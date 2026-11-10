<?php
header('Content-Type: application/json; charset=UTF-8');
require_once 'koneksi.php';
require_once 'auth.php';

$action = $_GET['action'] ?? '';

function send_json($payload, $status_code = 200) {
    http_response_code($status_code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensure_registration_table($conn) {
    // Tabel yang sudah ada di database versi lama memiliki kolom:
    // id, event_id, nama_tim, nama_pemenang, status_pendaftaran, created_at.
    // Jangan mengganti/menghapus kolom tersebut. Tambahkan kolom yang dibutuhkan
    // oleh formulir Gabung agar database lama tetap kompatibel.
    $create = "CREATE TABLE IF NOT EXISTS event_registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        nama_tim VARCHAR(150) NULL,
        nama_pemenang VARCHAR(255) NULL,
        status_pendaftaran VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_id (event_id),
        INDEX idx_status_pendaftaran (status_pendaftaran)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    if (!$conn->query($create)) {
        send_json(["status" => "error", "message" => "Tabel event_registrations tidak dapat dibuat: " . $conn->error], 500);
    }

    // Pastikan kolom baru tersedia. Kolom lama tidak diubah.
    $required = [
        'nama_lengkap' => "VARCHAR(150) NULL",
        'alias_nama' => "VARCHAR(100) NULL",
        'instagram' => "VARCHAR(150) NULL",
        'whatsapp' => "VARCHAR(50) NULL",
        'jabatan' => "VARCHAR(100) NULL",
        'foto_path' => "VARCHAR(255) NULL",
        'status' => "VARCHAR(30) NOT NULL DEFAULT 'Menunggu'",
        'updated_at' => "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ,'crew_id' => "INT NULL"
    ];

    $cols = [];
    $res = $conn->query("SHOW COLUMNS FROM event_registrations");
    if (!$res) send_json(["status" => "error", "message" => "Gagal membaca struktur event_registrations: " . $conn->error], 500);
    while ($row = $res->fetch_assoc()) $cols[strtolower($row['Field'])] = true;

    foreach ($required as $name => $definition) {
        if (!isset($cols[strtolower($name)])) {
            if (!$conn->query("ALTER TABLE event_registrations ADD COLUMN `$name` $definition")) {
                send_json(["status" => "error", "message" => "Kolom `$name` belum tersedia dan gagal ditambahkan: " . $conn->error], 500);
            }
        }
    }

    // Migrasikan data lama jika ada, tanpa menghapus kolom lama.
    $conn->query("UPDATE event_registrations SET nama_lengkap = COALESCE(NULLIF(nama_lengkap,''), nama_tim) WHERE nama_tim IS NOT NULL AND nama_tim <> ''");
    $conn->query("UPDATE event_registrations SET status = COALESCE(NULLIF(status,''), status_pendaftaran, 'Menunggu') WHERE status IS NULL OR status = ''");
}
ensure_registration_table($conn);

$logoColumn=$conn->query("SHOW COLUMNS FROM events LIKE 'logo_event'");
if($logoColumn&&$logoColumn->num_rows===0)$conn->query("ALTER TABLE events ADD COLUMN logo_event VARCHAR(255) NULL AFTER foto_event");

function ensure_crew_members_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS crew_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama_lengkap VARCHAR(150) NOT NULL,
        alias_nama VARCHAR(100) NULL,
        instagram VARCHAR(150) NULL,
        whatsapp VARCHAR(50) NULL,
        jabatan VARCHAR(100) NOT NULL DEFAULT 'Anggota Crew',
        foto_path VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crew_name (nama_lengkap),
        INDEX idx_crew_phone (whatsapp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    if (!$conn->query($sql)) send_json(["status"=>"error","message"=>"Tabel Crew tidak dapat dibuat: ".$conn->error],500);

    // Data lama tetap berguna: satu identitas per nomor WA, atau per nama bila WA kosong.
    $conn->query("INSERT INTO crew_members (nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path)
        SELECT MAX(r.nama_lengkap),MAX(r.alias_nama),MAX(r.instagram),r.whatsapp,MAX(r.jabatan),MAX(r.foto_path)
        FROM event_registrations r
        WHERE r.nama_lengkap IS NOT NULL AND r.nama_lengkap <> ''
          AND NOT EXISTS (SELECT 1 FROM crew_members c WHERE (r.whatsapp <> '' AND c.whatsapp=r.whatsapp) OR (COALESCE(r.whatsapp,'')='' AND c.nama_lengkap=r.nama_lengkap))
        GROUP BY CASE WHEN COALESCE(r.whatsapp,'')<>'' THEN r.whatsapp ELSE CONCAT('name:',r.nama_lengkap) END");
    $conn->query("UPDATE event_registrations r JOIN crew_members c ON ((r.whatsapp<>'' AND c.whatsapp=r.whatsapp) OR (COALESCE(r.whatsapp,'')='' AND c.nama_lengkap=r.nama_lengkap)) SET r.crew_id=c.id WHERE r.crew_id IS NULL");
}
ensure_crew_members_table($conn);

// Public: ambil event yang dibuat Admin untuk pilihan pendaftaran.
if ($action === 'get_registration_events' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $sql = "SELECT id, nama_event, cabang_olahraga, tanggal_pelaksanaan, jam_pelaksanaan, lokasi, status, foto_event, logo_event
            FROM events
            ORDER BY tanggal_pelaksanaan DESC, jam_pelaksanaan DESC, id DESC";
    $result = $conn->query($sql);
    if (!$result) send_json(["status" => "error", "message" => $conn->error], 500);
    $events = [];
    while ($row = $result->fetch_assoc()) $events[] = $row;
    send_json($events);
}

// Public: daftar nama Crew untuk searchable dropdown Join Event.
if ($action === 'get_crew_options' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $result=$conn->query("SELECT id,nama_lengkap,alias_nama,jabatan,foto_path FROM crew_members ORDER BY nama_lengkap ASC");
    if(!$result) send_json(["status"=>"error","message"=>$conn->error],500);
    $rows=[]; while($row=$result->fetch_assoc()) $rows[]=$row; send_json($rows);
}

// Public: peserta mendaftarkan identitasnya sebagai Crew sebelum memakai Join Event.
if ($action === 'register_crew' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $nama=trim((string)($_POST['nama_lengkap']??''));$alias=trim((string)($_POST['alias_nama']??''));
    $instagram=trim((string)($_POST['instagram']??''));$whatsapp=trim((string)($_POST['whatsapp']??''));
    $jabatan=trim((string)($_POST['jabatan']??'Anggota Crew'))?:'Anggota Crew';
    if($nama===''||$whatsapp==='')send_json(["status"=>"error","message"=>"Nama lengkap dan WhatsApp wajib diisi."],400);
    $dup=$conn->prepare("SELECT id FROM crew_members WHERE whatsapp=? LIMIT 1");$dup->bind_param('s',$whatsapp);$dup->execute();
    if($dup->get_result()->num_rows){$dup->close();send_json(["status"=>"error","message"=>"Nomor WhatsApp ini sudah terdaftar sebagai Crew."],409);}$dup->close();
    $photo='';
    if(isset($_FILES['foto'])&&$_FILES['foto']['error']===UPLOAD_ERR_OK){$file=$_FILES['foto'];if($file['size']>3*1024*1024)send_json(["status"=>"error","message"=>"Ukuran foto maksimal 3MB."],400);$mime=function_exists('mime_content_type')?mime_content_type($file['tmp_name']):$file['type'];$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];if(!isset($allowed[$mime]))send_json(["status"=>"error","message"=>"Foto harus JPG, PNG, atau WEBP."],400);$dir=__DIR__.DIRECTORY_SEPARATOR.'uploads'.DIRECTORY_SEPARATOR.'crew';if(!is_dir($dir)&&!mkdir($dir,0775,true))send_json(["status"=>"error","message"=>"Folder foto Crew tidak dapat dibuat."],500);$name='crew_'.date('Ymd_His').'_'.bin2hex(random_bytes(4)).'.'.$allowed[$mime];if(!move_uploaded_file($file['tmp_name'],$dir.DIRECTORY_SEPARATOR.$name))send_json(["status"=>"error","message"=>"Foto gagal disimpan."],500);$photo='uploads/crew/'.$name;}
    $stmt=$conn->prepare("INSERT INTO crew_members(nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path) VALUES(?,?,?,?,?,?)");$stmt->bind_param('ssssss',$nama,$alias,$instagram,$whatsapp,$jabatan,$photo);
    if(!$stmt->execute())send_json(["status"=>"error","message"=>$stmt->error],500);$id=$stmt->insert_id;$stmt->close();
    send_json(["status"=>"success","message"=>"Pendaftaran Crew berhasil. Nama kamu sekarang tersedia di Join Event.","id"=>$id]);
}

// Public self-service: detail dibuka langsung dari kartu Crew.
if ($action === 'get_crew_profile' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data=json_decode(file_get_contents('php://input'),true);$id=(int)($data['id']??0);
    if($id<1)send_json(["status"=>"error","message"=>"ID Crew tidak valid."],400);
    $stmt=$conn->prepare("SELECT id,nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path FROM crew_members WHERE id=? LIMIT 1");$stmt->bind_param('i',$id);$stmt->execute();$member=$stmt->get_result()->fetch_assoc();$stmt->close();
    if(!$member)send_json(["status"=>"error","message"=>"Profil Crew tidak ditemukan."],404);
    $stmt=$conn->prepare("SELECT DISTINCT event_id FROM event_registrations WHERE crew_id=? AND status='Disetujui'");$stmt->bind_param('i',$id);$stmt->execute();$res=$stmt->get_result();$eventIds=[];while($row=$res->fetch_assoc())$eventIds[]=(int)$row['event_id'];$stmt->close();$member['event_ids']=$eventIds;
    send_json(["status"=>"success","member"=>$member]);
}

if ($action === 'update_crew_profile' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id=(int)($_POST['id']??0);$nama=trim((string)($_POST['nama_lengkap']??''));$alias=trim((string)($_POST['alias_nama']??''));$instagram=trim((string)($_POST['instagram']??''));$whatsapp=trim((string)($_POST['whatsapp']??''));$jabatan=trim((string)($_POST['jabatan']??''));
    if($id<1||$nama===''||$whatsapp===''||$jabatan==='')send_json(["status"=>"error","message"=>"Nama, WhatsApp, dan jabatan wajib diisi."],400);
    $check=$conn->prepare("SELECT foto_path FROM crew_members WHERE id=? LIMIT 1");$check->bind_param('i',$id);$check->execute();$old=$check->get_result()->fetch_assoc();$check->close();if(!$old)send_json(["status"=>"error","message"=>"Profil Crew tidak ditemukan."],404);
    $duplicate=$conn->prepare("SELECT id FROM crew_members WHERE whatsapp=? AND id<>? LIMIT 1");$duplicate->bind_param('si',$whatsapp,$id);$duplicate->execute();if($duplicate->get_result()->num_rows){$duplicate->close();send_json(["status"=>"error","message"=>"Nomor WhatsApp sudah digunakan Crew lain."],409);}$duplicate->close();
    $photo=$old['foto_path']??'';
    if(isset($_FILES['foto'])&&$_FILES['foto']['error']===UPLOAD_ERR_OK){$file=$_FILES['foto'];if($file['size']>3*1024*1024)send_json(["status"=>"error","message"=>"Ukuran foto maksimal 3MB."],400);$mime=function_exists('mime_content_type')?mime_content_type($file['tmp_name']):$file['type'];$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];if(!isset($allowed[$mime]))send_json(["status"=>"error","message"=>"Foto harus JPG, PNG, atau WEBP."],400);$dir=__DIR__.DIRECTORY_SEPARATOR.'uploads'.DIRECTORY_SEPARATOR.'crew';if(!is_dir($dir)&&!mkdir($dir,0775,true))send_json(["status"=>"error","message"=>"Folder foto Crew tidak dapat dibuat."],500);$name='crew_'.date('Ymd_His').'_'.bin2hex(random_bytes(4)).'.'.$allowed[$mime];if(!move_uploaded_file($file['tmp_name'],$dir.DIRECTORY_SEPARATOR.$name))send_json(["status"=>"error","message"=>"Foto gagal disimpan."],500);$photo='uploads/crew/'.$name;}
    $eventIds=json_decode((string)($_POST['event_ids']??'[]'),true);if(!is_array($eventIds))$eventIds=[];$eventIds=array_values(array_unique(array_filter(array_map('intval',$eventIds))));
    $conn->begin_transaction();try{$stmt=$conn->prepare("UPDATE crew_members SET nama_lengkap=?,alias_nama=?,instagram=?,whatsapp=?,jabatan=?,foto_path=? WHERE id=?");$stmt->bind_param('ssssssi',$nama,$alias,$instagram,$whatsapp,$jabatan,$photo,$id);$stmt->execute();$stmt->close();$sync=$conn->prepare("UPDATE event_registrations SET nama_lengkap=?,alias_nama=?,instagram=?,whatsapp=?,jabatan=?,foto_path=? WHERE crew_id=?");$sync->bind_param('ssssssi',$nama,$alias,$instagram,$whatsapp,$jabatan,$photo,$id);$sync->execute();$sync->close();$del=$conn->prepare("DELETE FROM event_registrations WHERE crew_id=? AND status='Disetujui'");$del->bind_param('i',$id);$del->execute();$del->close();$ins=$conn->prepare("INSERT INTO event_registrations(event_id,crew_id,nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path,status) VALUES(?,?,?,?,?,?,?,?,'Disetujui')");foreach($eventIds as $eid){$ins->bind_param('iissssss',$eid,$id,$nama,$alias,$instagram,$whatsapp,$jabatan,$photo);$ins->execute();}$ins->close();$conn->commit();}catch(Throwable $e){$conn->rollback();send_json(["status"=>"error","message"=>"Profil gagal disimpan: ".$e->getMessage()],500);}
    send_json(["status"=>"success","message"=>"Profil dan riwayat event berhasil diperbarui."]);
}

// Public: user mengirim formulir Gabung. Tidak membutuhkan password.
if ($action === 'register_event' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $crew_id = (int)($_POST['crew_id'] ?? 0);
    $event_id = (int)($_POST['event_id'] ?? 0);
    if ($crew_id < 1 || $event_id < 1) send_json(["status"=>"error","message"=>"Nama Crew dan event wajib dipilih."],400);

    $crewStmt=$conn->prepare("SELECT * FROM crew_members WHERE id=? LIMIT 1");
    $crewStmt->bind_param('i',$crew_id);$crewStmt->execute();$crew=$crewStmt->get_result()->fetch_assoc();$crewStmt->close();
    if(!$crew) send_json(["status"=>"error","message"=>"Crew yang dipilih tidak ditemukan."],404);
    $nama=$crew['nama_lengkap'];$alias=$crew['alias_nama'];$instagram=$crew['instagram'];$whatsapp=$crew['whatsapp'];$jabatan=$crew['jabatan'];$photoPath=$crew['foto_path'];

    $eventStmt = $conn->prepare("SELECT id, nama_event, status FROM events WHERE id = ? LIMIT 1");
    if (!$eventStmt) send_json(["status" => "error", "message" => $conn->error], 500);
    $eventStmt->bind_param('i', $event_id);
    $eventStmt->execute();
    $event = $eventStmt->get_result()->fetch_assoc();
    $eventStmt->close();
    if (!$event) send_json(["status" => "error", "message" => "Event yang dipilih tidak ditemukan."], 404);

    // Cegah pendaftaran ganda pada event yang sama berdasarkan nomor WhatsApp.
    $dup = $conn->prepare("SELECT id FROM event_registrations WHERE event_id = ? AND crew_id = ? AND status <> 'Ditolak' LIMIT 1");
    if ($dup) {
        $dup->bind_param('ii', $event_id, $crew_id);
        $dup->execute();
        if ($dup->get_result()->num_rows > 0) {
            $dup->close();
            send_json(["status" => "error", "message" => "Crew tersebut sudah bergabung pada event ini."], 409);
        }
        $dup->close();
    }

    $stmt = $conn->prepare("INSERT INTO event_registrations (event_id,crew_id,nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path,status) VALUES (?,?,?,?,?,?,?,?, 'Menunggu')");
    if (!$stmt) {
        send_json(["status" => "error", "message" => "Gagal menyiapkan pendaftaran: " . $conn->error], 500);
    }
    $stmt->bind_param('iissssss', $event_id,$crew_id,$nama,$alias,$instagram,$whatsapp,$jabatan,$photoPath);
    if (!$stmt->execute()) {
        $err = $stmt->error;
        $stmt->close();
        send_json(["status" => "error", "message" => "Pendaftaran gagal disimpan: " . $err], 500);
    }
    $newId = $stmt->insert_id;
    $stmt->close();
    send_json([
        "status" => "success",
        "message" => "Pendaftaran berhasil dikirim. Silakan tunggu persetujuan Admin.",
        "id" => $newId,
        "event" => $event['nama_event']
    ]);
}

// Public: daftar peserta yang pendaftarannya sudah DISETUJUI untuk event tertentu.
if ($action === 'get_event_participants' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $event_id = (int)($_GET['event_id'] ?? 0);
    if ($event_id < 1) send_json(["status" => "error", "message" => "ID event tidak valid."], 400);

    $stmt = $conn->prepare("SELECT id, crew_id, nama_lengkap, alias_nama, whatsapp, jabatan, foto_path, created_at
                            FROM event_registrations
                            WHERE event_id = ? AND status = 'Disetujui'
                            ORDER BY id ASC");
    if (!$stmt) send_json(["status" => "error", "message" => $conn->error], 500);
    $stmt->bind_param('i', $event_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $participants = [];
    while ($row = $result->fetch_assoc()) $participants[] = $row;
    $stmt->close();
    send_json($participants);
}

// Public: riwayat event yang pernah diikuti peserta yang sudah disetujui.
if ($action === 'get_participant_events' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $registration_id = (int)($_GET['registration_id'] ?? 0);
    if ($registration_id < 1) send_json(["status" => "error", "message" => "ID peserta tidak valid."], 400);

    $stmt = $conn->prepare("SELECT nama_lengkap, whatsapp FROM event_registrations WHERE id = ? LIMIT 1");
    if (!$stmt) send_json(["status" => "error", "message" => $conn->error], 500);
    $stmt->bind_param('i', $registration_id);
    $stmt->execute();
    $current = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$current) send_json(["status" => "error", "message" => "Peserta tidak ditemukan."], 404);

    $name = trim((string)($current['nama_lengkap'] ?? ''));
    $whatsapp = trim((string)($current['whatsapp'] ?? ''));

    // Utamakan nomor HP sebagai identitas; nama menjadi pencocokan tambahan agar
    // riwayat tetap muncul bila nomor HP pada pendaftaran lama belum diisi.
    if ($whatsapp !== '') {
        $stmt = $conn->prepare("SELECT r.id, r.event_id, r.nama_lengkap, r.alias_nama, r.whatsapp, r.jabatan, r.foto_path, r.created_at,
                                       e.nama_event, e.tanggal_pelaksanaan, e.jam_pelaksanaan, e.lokasi
                                FROM event_registrations r
                                INNER JOIN events e ON e.id = r.event_id
                                WHERE r.status = 'Disetujui'
                                  AND (r.whatsapp = ? OR (r.whatsapp = '' AND r.nama_lengkap = ?))
                                ORDER BY e.tanggal_pelaksanaan DESC, r.id DESC");
        if (!$stmt) send_json(["status" => "error", "message" => $conn->error], 500);
        $stmt->bind_param('ss', $whatsapp, $name);
    } else {
        $stmt = $conn->prepare("SELECT r.id, r.event_id, r.nama_lengkap, r.alias_nama, r.whatsapp, r.jabatan, r.foto_path, r.created_at,
                                       e.nama_event, e.tanggal_pelaksanaan, e.jam_pelaksanaan, e.lokasi
                                FROM event_registrations r
                                INNER JOIN events e ON e.id = r.event_id
                                WHERE r.status = 'Disetujui' AND r.nama_lengkap = ?
                                ORDER BY e.tanggal_pelaksanaan DESC, r.id DESC");
        if (!$stmt) send_json(["status" => "error", "message" => $conn->error], 500);
        $stmt->bind_param('s', $name);
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $events = [];
    while ($row = $result->fetch_assoc()) $events[] = $row;
    $stmt->close();
    send_json(["status" => "success", "participant" => $current, "events" => $events]);
}

// Semua aksi berikutnya membutuhkan login.
if ($action !== 'register_event' && $action !== 'register_crew' && $action !== 'get_crew_profile' && $action !== 'update_crew_profile' && $action !== 'get_registration_events' && $action !== 'get_crew_options' && $action !== 'get_event_participants' && $action !== 'get_participant_events') require_login_json();

if ($action === 'get_registrations' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    require_admin_json();
    $sql = "SELECT r.id, r.event_id, r.nama_lengkap, r.alias_nama, r.instagram, r.whatsapp, r.jabatan, r.foto_path, r.status, r.created_at,
                   e.nama_event, e.cabang_olahraga, e.tanggal_pelaksanaan
            FROM event_registrations r
            LEFT JOIN events e ON e.id = r.event_id
            ORDER BY r.id DESC";
    $result = $conn->query($sql);
    if (!$result) send_json(["status" => "error", "message" => $conn->error], 500);
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    send_json($rows);
}

if ($action === 'get_crew_members' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    require_admin_json();
    $sql="SELECT c.*,
        (SELECT GROUP_CONCAT(r.event_id ORDER BY r.event_id SEPARATOR ',') FROM event_registrations r WHERE r.crew_id=c.id AND r.status='Disetujui') AS event_ids
        FROM crew_members c ORDER BY c.nama_lengkap ASC";
    $result=$conn->query($sql);if(!$result)send_json(["status"=>"error","message"=>$conn->error],500);
    $rows=[];while($row=$result->fetch_assoc()){$row['event_ids']=$row['event_ids']?array_map('intval',explode(',',$row['event_ids'])):[];$rows[]=$row;}send_json($rows);
}

if ($action === 'save_crew_member' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_admin_json();
    $id=(int)($_POST['id']??0);$nama=trim((string)($_POST['nama_lengkap']??''));$alias=trim((string)($_POST['alias_nama']??''));
    $instagram=trim((string)($_POST['instagram']??''));$whatsapp=trim((string)($_POST['whatsapp']??''));$jabatan=trim((string)($_POST['jabatan']??'Anggota Crew'));
    if($nama===''||$jabatan==='')send_json(["status"=>"error","message"=>"Nama dan jabatan Crew wajib diisi."],400);
    $photo=null;
    if(isset($_FILES['foto'])&&$_FILES['foto']['error']===UPLOAD_ERR_OK){$file=$_FILES['foto'];if($file['size']>3*1024*1024)send_json(["status"=>"error","message"=>"Ukuran foto maksimal 3MB."],400);$mime=function_exists('mime_content_type')?mime_content_type($file['tmp_name']):$file['type'];$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];if(!isset($allowed[$mime]))send_json(["status"=>"error","message"=>"Foto harus JPG, PNG, atau WEBP."],400);$dir=__DIR__.DIRECTORY_SEPARATOR.'uploads'.DIRECTORY_SEPARATOR.'crew';if(!is_dir($dir)&&!mkdir($dir,0775,true))send_json(["status"=>"error","message"=>"Folder foto Crew tidak dapat dibuat."],500);$name='crew_'.date('Ymd_His').'_'.bin2hex(random_bytes(4)).'.'.$allowed[$mime];if(!move_uploaded_file($file['tmp_name'],$dir.DIRECTORY_SEPARATOR.$name))send_json(["status"=>"error","message"=>"Foto Crew gagal disimpan."],500);$photo='uploads/crew/'.$name;}
    if($id>0){$old=$conn->prepare("SELECT foto_path FROM crew_members WHERE id=?");$old->bind_param('i',$id);$old->execute();$oldRow=$old->get_result()->fetch_assoc();$old->close();if(!$oldRow)send_json(["status"=>"error","message"=>"Crew tidak ditemukan."],404);if($photo){$stmt=$conn->prepare("UPDATE crew_members SET nama_lengkap=?,alias_nama=?,instagram=?,whatsapp=?,jabatan=?,foto_path=? WHERE id=?");$stmt->bind_param('ssssssi',$nama,$alias,$instagram,$whatsapp,$jabatan,$photo,$id);}else{$stmt=$conn->prepare("UPDATE crew_members SET nama_lengkap=?,alias_nama=?,instagram=?,whatsapp=?,jabatan=? WHERE id=?");$stmt->bind_param('sssssi',$nama,$alias,$instagram,$whatsapp,$jabatan,$id);}}
    else{$stmt=$conn->prepare("INSERT INTO crew_members(nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path) VALUES(?,?,?,?,?,?)");$stmt->bind_param('ssssss',$nama,$alias,$instagram,$whatsapp,$jabatan,$photo);}
    if(!$stmt->execute())send_json(["status"=>"error","message"=>$stmt->error],500);if($id<1)$id=$stmt->insert_id;$stmt->close();
    $fresh=$conn->prepare("SELECT nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path FROM crew_members WHERE id=?");$fresh->bind_param('i',$id);$fresh->execute();$member=$fresh->get_result()->fetch_assoc();$fresh->close();
    $nama=$member['nama_lengkap'];$alias=$member['alias_nama'];$instagram=$member['instagram'];$whatsapp=$member['whatsapp'];$jabatan=$member['jabatan'];$photo=$member['foto_path'];
    $eventIds=json_decode((string)($_POST['event_ids']??'[]'),true);if(!is_array($eventIds))$eventIds=[];$eventIds=array_values(array_unique(array_filter(array_map('intval',$eventIds))));
    $conn->begin_transaction();try{$del=$conn->prepare("DELETE FROM event_registrations WHERE crew_id=? AND status='Disetujui'");$del->bind_param('i',$id);$del->execute();$del->close();$ins=$conn->prepare("INSERT INTO event_registrations(event_id,crew_id,nama_lengkap,alias_nama,instagram,whatsapp,jabatan,foto_path,status) VALUES(?,?,?,?,?,?,?,?,'Disetujui')");foreach($eventIds as $eid){$ins->bind_param('iissssss',$eid,$id,$nama,$alias,$instagram,$whatsapp,$jabatan,$photo);$ins->execute();}$ins->close();$conn->commit();}catch(Throwable $e){$conn->rollback();send_json(["status"=>"error","message"=>"Riwayat event gagal disimpan: ".$e->getMessage()],500);}
    send_json(["status"=>"success","message"=>"Detail Crew dan riwayat event berhasil disimpan.","id"=>$id]);
}

if ($action === 'update_registration_status' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_admin_json();
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || empty($data['id'])) send_json(["status" => "error", "message" => "ID pendaftaran tidak valid."], 400);
    $id = (int)$data['id'];
    $status = trim((string)($data['status'] ?? ''));
    if (!in_array($status, ['Menunggu','Disetujui','Ditolak'], true)) send_json(["status" => "error", "message" => "Status tidak valid."], 400);

    $stmt = $conn->prepare("UPDATE event_registrations SET status = ? WHERE id = ?");
    $stmt->bind_param('si', $status, $id);
    if (!$stmt->execute()) send_json(["status" => "error", "message" => $stmt->error], 500);
    $stmt->close();
    send_json(["status" => "success", "message" => "Status pendaftaran menjadi $status."]);
}

if ($action === 'update_registration_role' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once 'auth.php';
    if (!is_logged_in() || !is_admin()) send_json(["status"=>"error","message"=>"Akses hanya untuk admin."],403);
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['id'] ?? 0);
    $jabatan = trim((string)($data['jabatan'] ?? ''));
    if ($id < 1 || $jabatan === '') send_json(["status"=>"error","message"=>"ID peserta dan jabatan wajib diisi."],400);
    $stmt = $conn->prepare("UPDATE event_registrations SET jabatan = ? WHERE id = ? AND status = 'Disetujui'");
    if (!$stmt) send_json(["status"=>"error","message"=>$conn->error],500);
    $stmt->bind_param('si',$jabatan,$id);
    if (!$stmt->execute()) send_json(["status"=>"error","message"=>$stmt->error],500);
    if ($stmt->affected_rows < 1) send_json(["status"=>"error","message"=>"Peserta tidak ditemukan atau belum disetujui admin."],404);
    $stmt->close();
    send_json(["status"=>"success","message"=>"Jabatan peserta berhasil diperbarui."]);
}

if ($action === 'delete_registration' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_admin_json();
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || empty($data['id'])) send_json(["status" => "error", "message" => "ID pendaftaran tidak valid."], 400);
    $id = (int)$data['id'];
    $stmt = $conn->prepare("SELECT foto_path FROM event_registrations WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $id); $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc(); $stmt->close();
    if (!$row) send_json(["status" => "error", "message" => "Pendaftaran tidak ditemukan."], 404);
    $del = $conn->prepare("DELETE FROM event_registrations WHERE id = ?");
    $del->bind_param('i', $id);
    if (!$del->execute()) send_json(["status" => "error", "message" => $del->error], 500);
    $del->close();
    if (!empty($row['foto_path'])) {
        $full = __DIR__ . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $row['foto_path']);
        if (is_file($full)) @unlink($full);
    }
    send_json(["status" => "success", "message" => "Pendaftaran berhasil dihapus."]);
}

// Backward compatibility: endpoint akun lama tetap tersedia untuk Admin.
if ($action === 'get_users') {
    require_admin_json();
    $sql = "SELECT users.id, users.nama_lengkap, users.email, roles.role_name AS role, users.created_at
            FROM users LEFT JOIN roles ON users.role_id = roles.id ORDER BY users.id DESC";
    $result = $conn->query($sql);
    if (!$result) send_json(["status" => "error", "message" => $conn->error], 500);
    $users=[]; while($row=$result->fetch_assoc()) $users[]=$row; send_json($users);
}

if ($action === 'delete_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_admin_json();
    $data=json_decode(file_get_contents('php://input'),true); $id=(int)($data['id']??0);
    if($id<1) send_json(["status"=>"error","message"=>"ID pengguna tidak valid."],400);
    $stmt=$conn->prepare("DELETE FROM users WHERE id=?"); $stmt->bind_param('i',$id);
    if($stmt->execute()) send_json(["status"=>"success","message"=>"Pengguna berhasil dihapus"]);
    send_json(["status"=>"error","message"=>$stmt->error],500);
}

send_json(["status" => "error", "message" => "Action tidak ditemukan."], 404);
?>
