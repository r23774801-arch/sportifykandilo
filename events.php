<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST");
header("Content-Type: application/json; charset=UTF-8");

require_once 'koneksi.php';
require_once 'auth.php';

$method = $_SERVER['REQUEST_METHOD'];

function send_json($payload, $status_code = 200) {
    http_response_code($status_code);
    echo json_encode($payload);
    exit;
}

function ensure_event_location_column($conn) {
    $result = $conn->query("SHOW COLUMNS FROM events LIKE 'lokasi'");
    if ($result && $result->num_rows === 0) {
        $conn->query("ALTER TABLE events ADD COLUMN lokasi VARCHAR(255) NOT NULL DEFAULT 'GOR Kandilo' AFTER jam_pelaksanaan");
    }
}

function ensure_event_photo_column($conn) {
    $result = $conn->query("SHOW COLUMNS FROM events LIKE 'foto_event'");
    if ($result && $result->num_rows === 0) {
        $conn->query("ALTER TABLE events ADD COLUMN foto_event VARCHAR(255) NULL AFTER jam_pelaksanaan");
    }
}

function ensure_event_logo_column($conn) {
    $result = $conn->query("SHOW COLUMNS FROM events LIKE 'logo_event'");
    if ($result && $result->num_rows === 0) {
        $conn->query("ALTER TABLE events ADD COLUMN logo_event VARCHAR(255) NULL AFTER foto_event");
    }
}

function ensure_event_photos_table($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS event_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        photo_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (event_id)
    )");
}

ensure_event_location_column($conn);
ensure_event_photo_column($conn);
ensure_event_logo_column($conn);
ensure_event_photos_table($conn);

function save_uploaded_event_photos($files) {
    if (empty($files['name'])) {
        return [];
    }

    $names = is_array($files['name']) ? $files['name'] : [$files['name']];
    $tmp_names = is_array($files['tmp_name']) ? $files['tmp_name'] : [$files['tmp_name']];
    $errors = is_array($files['error']) ? $files['error'] : [$files['error']];
    $sizes = is_array($files['size']) ? $files['size'] : [$files['size']];

    $allowed_types = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif'
    ];
    $upload_dir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads';

    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0775, true);
    }

    $paths = [];
    foreach ($names as $index => $name) {
        if ($name === '') {
            continue;
        }

        if ($errors[$index] !== UPLOAD_ERR_OK) {
            send_json(["status" => "error", "message" => "Upload salah satu foto gagal."], 400);
        }

        $mime_type = mime_content_type($tmp_names[$index]);
        if (!isset($allowed_types[$mime_type])) {
            send_json(["status" => "error", "message" => "Semua file harus berupa gambar JPG, PNG, WEBP, atau GIF."], 400);
        }

        if ($sizes[$index] > 3 * 1024 * 1024) {
            send_json(["status" => "error", "message" => "Ukuran setiap foto maksimal 3MB."], 400);
        }

        $filename = 'event_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $allowed_types[$mime_type];
        $destination = $upload_dir . DIRECTORY_SEPARATOR . $filename;

        if (!move_uploaded_file($tmp_names[$index], $destination)) {
            send_json(["status" => "error", "message" => "Gagal menyimpan salah satu foto."], 500);
        }

        $paths[] = 'uploads/' . $filename;
    }

    return $paths;
}

// 1. GET: Ambil Semua Event
if ($method === 'GET') {
    $sql = "SELECT events.*, users.nama_lengkap AS pembuat
            FROM events
            LEFT JOIN users ON events.created_by = users.id
            ORDER BY events.id DESC";
    $result = $conn->query($sql);

    if (!$result) {
        send_json(["status" => "error", "message" => $conn->error], 500);
    }

    $events = [];
    while ($row = $result->fetch_assoc()) {
        $row['photos'] = [];
        $events[] = $row;
    }

    if (count($events) > 0) {
        $photo_result = $conn->query("SELECT event_id, photo_path FROM event_photos ORDER BY id ASC");
        $photos_by_event = [];
        if ($photo_result) {
            while ($photo = $photo_result->fetch_assoc()) {
                $photos_by_event[$photo['event_id']][] = $photo['photo_path'];
            }
        }

        foreach ($events as &$event) {
            $event['photos'] = $photos_by_event[$event['id']] ?? [];
            if (empty($event['photos']) && !empty($event['foto_event'])) {
                $event['photos'] = [$event['foto_event']];
            }
        }
        unset($event);
    }

    send_json($events);
}

// 2. POST: Tambah Event Baru
if ($method === 'POST') {
    require_admin_json();

    if (($_GET['action'] ?? '') === 'delete_event') {
        require_admin_json();
        $data = json_decode(file_get_contents("php://input"), true);

        if (!is_array($data) || empty($data['id'])) {
            send_json(["status" => "error", "message" => "ID event tidak valid."], 400);
        }

        $id = intval($data['id']);
        $check = $conn->prepare("SELECT id, foto_event, logo_event FROM events WHERE id = ? LIMIT 1");
        $check->bind_param("i", $id);
        $check->execute();
        $result = $check->get_result();
        $event_row = $result ? $result->fetch_assoc() : null;
        $check->close();

        if (!$event_row) {
            send_json(["status" => "error", "message" => "Event tidak ditemukan."], 404);
        }

        // Ambil seluruh foto yang terkait sebelum data event dihapus.
        $old_paths = [];
        $photo_stmt = $conn->prepare("SELECT photo_path FROM event_photos WHERE event_id = ?");
        if ($photo_stmt) {
            $photo_stmt->bind_param("i", $id);
            $photo_stmt->execute();
            $photo_result = $photo_stmt->get_result();
            while ($photo_result && ($photo = $photo_result->fetch_assoc())) {
                $old_paths[] = $photo['photo_path'];
            }
            $photo_stmt->close();
        }
        if (!empty($event_row['foto_event'])) $old_paths[] = $event_row['foto_event'];
        if (!empty($event_row['logo_event'])) $old_paths[] = $event_row['logo_event'];

        $conn->begin_transaction();
        try {
            $delPhotos = $conn->prepare("DELETE FROM event_photos WHERE event_id = ?");
            if (!$delPhotos) throw new Exception($conn->error);
            $delPhotos->bind_param("i", $id);
            if (!$delPhotos->execute()) throw new Exception($delPhotos->error);
            $delPhotos->close();

            $delEvent = $conn->prepare("DELETE FROM events WHERE id = ?");
            if (!$delEvent) throw new Exception($conn->error);
            $delEvent->bind_param("i", $id);
            if (!$delEvent->execute()) throw new Exception($delEvent->error);
            if ($delEvent->affected_rows < 1) throw new Exception("Event tidak ditemukan atau sudah dihapus.");
            $delEvent->close();

            $conn->commit();

            // Hapus file foto event yang tidak lagi direferensikan.
            foreach (array_unique($old_paths) as $old_path) {
                if (!$old_path) continue;
                $full = __DIR__ . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $old_path);
                if (is_file($full)) @unlink($full);
            }

            // Hapus seluruh struktur Crew yang khusus untuk event ini dari database.
            $crew_stmt = $conn->prepare("DELETE FROM crew_event_data WHERE event_id = ?");
            if ($crew_stmt) {
                $crew_stmt->bind_param("i", $id);
                $crew_stmt->execute();
                $crew_stmt->close();
            }

            // Bersihkan juga data Crew lama yang masih tersimpan di JSON (jika ada).
            $crew_file = __DIR__ . DIRECTORY_SEPARATOR . 'crew_data.json';
            if (is_file($crew_file)) {
                $store = json_decode(file_get_contents($crew_file), true);
                if (is_array($store) && isset($store['events']) && is_array($store['events'])) {
                    $key = (string)$id;
                    if (array_key_exists($key, $store['events'])) {
                        unset($store['events'][$key]);
                        @file_put_contents($crew_file, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
                    }
                }
            }

            send_json(["status" => "success", "message" => "Event berhasil dihapus. Data foto dan Crew event juga dibersihkan."]);
        } catch (Throwable $e) {
            $conn->rollback();
            send_json(["status" => "error", "message" => "Gagal menghapus event: " . $e->getMessage()], 500);
        }
    }

    if (($_GET['action'] ?? '') === 'finish_event') {
        require_admin_json();
        $data = json_decode(file_get_contents("php://input"), true);

        if (!is_array($data) || empty($data['id'])) {
            send_json(["status" => "error", "message" => "ID event tidak valid."], 400);
        }

        $id = intval($data['id']);
        $stmt = $conn->prepare("UPDATE events SET status = 'Selesai' WHERE id = ?");
        $stmt->bind_param("i", $id);

        if ($stmt->execute()) {
            send_json(["status" => "success", "message" => "Event berhasil dipindahkan ke History."]);
        }

        send_json(["status" => "error", "message" => $stmt->error], 500);
    }

    if (($_GET['action'] ?? '') === 'delete_photo') {
        require_admin_json();
        $data = json_decode(file_get_contents("php://input"), true);
        $event_id = intval($data['event_id'] ?? 0);
        $photo_path = trim((string)($data['photo_path'] ?? ''));

        if (!$event_id || $photo_path === '') {
            send_json(["status" => "error", "message" => "Event atau foto tidak valid."], 400);
        }

        // Pastikan foto benar-benar milik event yang dipilih.
        $check = $conn->prepare("SELECT id, foto_event FROM events WHERE id = ? LIMIT 1");
        $check->bind_param("i", $event_id);
        $check->execute();
        $event_result = $check->get_result();
        $event_row = $event_result ? $event_result->fetch_assoc() : null;
        $check->close();

        if (!$event_row) {
            send_json(["status" => "error", "message" => "Event tidak ditemukan."], 404);
        }

        $photo_stmt = $conn->prepare("SELECT id FROM event_photos WHERE event_id = ? AND photo_path = ? LIMIT 1");
        $photo_stmt->bind_param("is", $event_id, $photo_path);
        $photo_stmt->execute();
        $photo_result = $photo_stmt->get_result();
        $photo_row = $photo_result ? $photo_result->fetch_assoc() : null;
        $photo_stmt->close();

        $is_cover = ((string)($event_row['foto_event'] ?? '') === $photo_path);
        if (!$photo_row && !$is_cover) {
            send_json(["status" => "error", "message" => "Foto tidak ditemukan pada event ini."], 404);
        }

        $conn->begin_transaction();
        try {
            if ($photo_row) {
                $delete = $conn->prepare("DELETE FROM event_photos WHERE id = ? AND event_id = ?");
                if (!$delete) throw new Exception($conn->error);
                $photo_id = intval($photo_row['id']);
                $delete->bind_param("ii", $photo_id, $event_id);
                if (!$delete->execute()) throw new Exception($delete->error);
                $delete->close();
            }

            // Jika foto yang dihapus adalah cover, pilih foto lain sebagai cover.
            if ($is_cover) {
                $next = $conn->prepare("SELECT photo_path FROM event_photos WHERE event_id = ? ORDER BY id ASC LIMIT 1");
                if (!$next) throw new Exception($conn->error);
                $next->bind_param("i", $event_id);
                $next->execute();
                $next_result = $next->get_result();
                $next_row = $next_result ? $next_result->fetch_assoc() : null;
                $next->close();

                $new_cover = $next_row['photo_path'] ?? null;
                $upd = $conn->prepare("UPDATE events SET foto_event = ? WHERE id = ?");
                if (!$upd) throw new Exception($conn->error);
                $upd->bind_param("si", $new_cover, $event_id);
                if (!$upd->execute()) throw new Exception($upd->error);
                $upd->close();
            }

            $conn->commit();

            // Hapus file fisik setelah referensi database dihapus.
            $safe_path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $photo_path);
            $full = __DIR__ . DIRECTORY_SEPARATOR . $safe_path;
            if (is_file($full)) @unlink($full);

            send_json(["status" => "success", "message" => "Foto berhasil dihapus dari galeri event."]);
        } catch (Throwable $e) {
            $conn->rollback();
            send_json(["status" => "error", "message" => "Gagal menghapus foto: " . $e->getMessage()], 500);
        }
    }

    if (($_GET['action'] ?? '') === 'upload_photos') {
        $id = intval($_POST['id'] ?? 0);
        if (!$id) {
            send_json(["status" => "error", "message" => "ID event tidak valid."], 400);
        }

        $check = $conn->prepare("SELECT status, foto_event FROM events WHERE id = ? LIMIT 1");
        $check->bind_param("i", $id);
        $check->execute();
        $event_result = $check->get_result();
        $event_row = $event_result ? $event_result->fetch_assoc() : null;
        $check->close();

        if (!$event_row) {
            send_json(["status" => "error", "message" => "Event tidak ditemukan."], 404);
        }
        if (strtolower($event_row['status'] ?? '') !== 'selesai') {
            send_json(["status" => "error", "message" => "Foto dokumentasi hanya dapat diunggah setelah event selesai."], 400);
        }
        if (empty($_FILES['foto_event']['name'])) {
            send_json(["status" => "error", "message" => "Pilih minimal satu foto."], 400);
        }

        $new_photos = save_uploaded_event_photos($_FILES['foto_event']);
        if (!$new_photos) {
            send_json(["status" => "error", "message" => "Tidak ada foto yang berhasil diunggah."], 400);
        }

        // Foto dari User ditambahkan ke galeri, bukan mengganti foto lama.
        // Setiap foto tetap terhubung ke event yang dipilih dan hanya bisa ditambahkan
        // setelah event berstatus Selesai.
        $conn->begin_transaction();
        try {
            $photo_stmt = $conn->prepare("INSERT INTO event_photos (event_id, photo_path) VALUES (?, ?)");
            if (!$photo_stmt) throw new Exception($conn->error);
            foreach ($new_photos as $photo_path) {
                $photo_stmt->bind_param("is", $id, $photo_path);
                if (!$photo_stmt->execute()) throw new Exception($photo_stmt->error);
            }
            $photo_stmt->close();

            // Jika event belum punya cover, foto pertama yang diunggah menjadi cover.
            if (empty($event_row['foto_event'])) {
                $primary_photo = $new_photos[0];
                $upd = $conn->prepare("UPDATE events SET foto_event = ? WHERE id = ?");
                if (!$upd) throw new Exception($conn->error);
                $upd->bind_param("si", $primary_photo, $id);
                if (!$upd->execute()) throw new Exception($upd->error);
                $upd->close();
            }

            $conn->commit();
            send_json(["status" => "success", "message" => count($new_photos) . " foto berhasil ditambahkan ke galeri event.", "photos" => $new_photos]);
        } catch (Throwable $e) {
            $conn->rollback();
            foreach ($new_photos as $new_path) {
                $full = __DIR__ . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $new_path);
                if (is_file($full)) @unlink($full);
            }
            send_json(["status" => "error", "message" => "Gagal menambahkan foto: " . $e->getMessage()], 500);
        }
    }

    if (($_GET['action'] ?? '') === 'update_event') {
        require_admin_json();
        $content_type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
        $is_multipart = strpos($content_type, 'multipart/form-data') !== false;
        $data = $is_multipart ? $_POST : json_decode(file_get_contents("php://input"), true);

        if (!is_array($data) || empty($data['id'])) {
            send_json(["status" => "error", "message" => "ID event tidak valid."], 400);
        }

        $id = intval($data['id']);
        $nama_event = trim($data['nama_event'] ?? '');
        $cabang_olahraga = trim($data['cabang_olahraga'] ?? '');
        $tanggal_pelaksanaan = $data['tanggal_pelaksanaan'] ?? '';
        $jam_pelaksanaan = !empty($data['jam_pelaksanaan']) ? $data['jam_pelaksanaan'] : NULL;
        $lokasi = trim($data['lokasi'] ?? 'GOR Kandilo');
        $status = $data['status'] ?? 'Buka';
        $allowed_status = ['Buka', 'Selesai', 'Dibatalkan'];

        if (empty($nama_event) || empty($tanggal_pelaksanaan)) {
            send_json(["status" => "error", "message" => "Data event tidak lengkap."], 400);
        }

        if (!in_array($status, $allowed_status, true)) {
            send_json(["status" => "error", "message" => "Status event tidak valid."], 400);
        }

        $new_logo = null;
        if (!empty($_FILES['logo_event']['name'])) {
            $logos = save_uploaded_event_photos($_FILES['logo_event']);
            $new_logo = $logos[0] ?? null;
        }
        if ($new_logo) {
            $stmt = $conn->prepare("UPDATE events SET nama_event = ?, cabang_olahraga = ?, tanggal_pelaksanaan = ?, jam_pelaksanaan = ?, lokasi = ?, status = ?, logo_event = ? WHERE id = ?");
            $stmt->bind_param("sssssssi", $nama_event, $cabang_olahraga, $tanggal_pelaksanaan, $jam_pelaksanaan, $lokasi, $status, $new_logo, $id);
        } else {
            $stmt = $conn->prepare("UPDATE events SET nama_event = ?, cabang_olahraga = ?, tanggal_pelaksanaan = ?, jam_pelaksanaan = ?, lokasi = ?, status = ? WHERE id = ?");
            $stmt->bind_param("ssssssi", $nama_event, $cabang_olahraga, $tanggal_pelaksanaan, $jam_pelaksanaan, $lokasi, $status, $id);
        }

        if ($stmt->execute()) {
            send_json(["status" => "success", "message" => "Event berhasil diupdate."]);
        }

        send_json(["status" => "error", "message" => $stmt->error], 500);
    }

    // Membuat event baru tetap khusus Admin.
    require_admin_json();

    $content_type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    $is_multipart = strpos($content_type, 'multipart/form-data') !== false || !empty($_POST) || !empty($_FILES);
    $data = $is_multipart ? $_POST : json_decode(file_get_contents("php://input"), true);

    if (!is_array($data)) {
        send_json(["status" => "error", "message" => "Data event tidak terbaca oleh server. Silakan coba lagi."], 400);
    }

    // Cabang olahraga sengaja tidak digunakan lagi. Tetap kirim string kosong agar database lama yang
    // memiliki kolom cabang_olahraga NOT NULL tetap kompatibel.
    $nama_event = trim((string)($data['nama_event'] ?? ''));
    $cabang_olahraga = '';
    $tanggal_pelaksanaan = trim((string)($data['tanggal_pelaksanaan'] ?? ''));
    $jam_pelaksanaan = !empty($data['jam_pelaksanaan']) ? $data['jam_pelaksanaan'] : NULL;
    $lokasi = trim($data['lokasi'] ?? '');
    if ($lokasi === '') { $lokasi = 'GOR Kandilo'; }

    if (empty($nama_event) || empty($tanggal_pelaksanaan)) {
        send_json(["status" => "error", "message" => "Data tidak lengkap!"], 400);
    }

    $uploaded_photos = [];
    if (!empty($_FILES['foto_event']['name'])) {
        $uploaded_photos = save_uploaded_event_photos($_FILES['foto_event']);
    }
    $foto_event = $uploaded_photos[0] ?? null;
    $logo_event = null;
    if (!empty($_FILES['logo_event']['name'])) {
        $logos = save_uploaded_event_photos($_FILES['logo_event']);
        $logo_event = $logos[0] ?? null;
    }

    $created_by = current_user()['id'];

    $stmt = $conn->prepare("INSERT INTO events (created_by, nama_event, cabang_olahraga, tanggal_pelaksanaan, jam_pelaksanaan, lokasi, foto_event, logo_event) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$stmt) {
        send_json(["status" => "error", "message" => "Gagal menyiapkan penyimpanan event: " . $conn->error], 500);
    }
    $stmt->bind_param("isssssss", $created_by, $nama_event, $cabang_olahraga, $tanggal_pelaksanaan, $jam_pelaksanaan, $lokasi, $foto_event, $logo_event);

    if ($stmt->execute()) {
        $event_id = $conn->insert_id;
        if (count($uploaded_photos) > 0) {
            $photo_stmt = $conn->prepare("INSERT INTO event_photos (event_id, photo_path) VALUES (?, ?)");
            foreach ($uploaded_photos as $photo_path) {
                $photo_stmt->bind_param("is", $event_id, $photo_path);
                $photo_stmt->execute();
            }
            $photo_stmt->close();
        }
        send_json(["status" => "success", "message" => "Acara berhasil ditambahkan!"]);
    }

    $message = "Gagal menyimpan data: " . $stmt->error;
    $stmt->close();
    send_json(["status" => "error", "message" => $message], 500);
}

send_json(["status" => "error", "message" => "Method tidak didukung."], 405);
?>
