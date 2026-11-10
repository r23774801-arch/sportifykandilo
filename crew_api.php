<?php
header('Content-Type: application/json; charset=UTF-8');
require_once 'auth.php';
require_once 'koneksi.php';

function out($d,$c=200){http_response_code($c);echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function require_admin(){if(!is_logged_in())out(['status'=>'error','message'=>'Belum login.'],401);if(!is_admin())out(['status'=>'error','message'=>'Akses hanya untuk admin.'],403);}
$file=__DIR__.'/crew_data.json';

// Penyimpanan utama Crew menggunakan database agar perubahan tetap tersimpan
// walaupun file JSON tidak memiliki permission tulis di hosting.
function ensure_crew_table($conn){
  $sql="CREATE TABLE IF NOT EXISTS crew_event_data (
    event_id INT NOT NULL PRIMARY KEY,
    data_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
  if(!$conn->query($sql)) out(['status'=>'error','message'=>'Database Crew belum siap. Jalankan setup_crew.php atau import database_crew.sql. Detail: '.$conn->error],500);
}
function is_list_compat($array){
  if(!is_array($array)) return false;
  $i=0;
  foreach($array as $k=>$_){ if($k!==$i++) return false; }
  return true;
}
function get_store_from_json($file){
  if(!file_exists($file)) return ['events'=>[],'default'=>[]];
  $d=json_decode(file_get_contents($file),true);
  if(!is_array($d)) return ['events'=>[],'default'=>[]];
  if(is_list_compat($d)) return ['events'=>[],'default'=>$d];
  $d['events']=is_array($d['events']??null)?$d['events']:[];
  $d['default']=is_array($d['default']??null)?$d['default']:[];
  return $d;
}
function migrate_json_crew($conn,$file){
  $store=get_store_from_json($file);
  if(empty($store['events']) || !is_array($store['events'])) return;
  $check=$conn->query("SELECT COUNT(*) AS c FROM crew_event_data");
  $row=$check?$check->fetch_assoc():null;
  if($row && (int)$row['c']>0) return;
  $stmt=$conn->prepare("INSERT INTO crew_event_data(event_id,data_json) VALUES(?,?) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json)");
  if(!$stmt) return;
  foreach($store['events'] as $id=>$data){
    if(!ctype_digit((string)$id)) continue;
    $eid=(int)$id; $json=json_encode(is_array($data)?$data:[],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    $stmt->bind_param('is',$eid,$json); $stmt->execute();
  }
  $stmt->close();
}
$action=$_GET['action']??'get';
if($action==='get'){
  ensure_crew_table($conn);
  migrate_json_crew($conn,$file);
  $eventId=trim((string)($_GET['event_id']??''));
  if($eventId!==''){
    $eid=(int)$eventId;
    $stmt=$conn->prepare("SELECT data_json FROM crew_event_data WHERE event_id=? LIMIT 1");
    if(!$stmt){out(['status'=>'error','message'=>$conn->error],500);}
    $stmt->bind_param('i',$eid);
    if(!$stmt->execute()){ $err=$stmt->error; $stmt->close(); out(['status'=>'error','message'=>'Gagal membaca data Crew: '.$err],500); }
    $stmt->bind_result($dataJson);
    $row=$stmt->fetch()?['data_json'=>$dataJson]:null;
    $stmt->close();
    $data=$row?json_decode($row['data_json'],true):[];
    if(!is_array($data))$data=[];
    out(['status'=>'success','data'=>$data,'event_id'=>$eventId]);
  }
  $all=[];$res=$conn->query("SELECT event_id,data_json FROM crew_event_data ORDER BY event_id");
  if($res) while($row=$res->fetch_assoc()){$d=json_decode($row['data_json'],true);$all[(string)$row['event_id']]=is_array($d)?$d:[];}
  out(['status'=>'success','data'=>['events'=>$all,'default'=>get_store_from_json($file)['default']]]);
}
if($action==='upload_photo' && $_SERVER['REQUEST_METHOD']==='POST'){
  require_admin();
  if(!isset($_FILES['photo']) || $_FILES['photo']['error']!==UPLOAD_ERR_OK) out(['status'=>'error','message'=>'Foto belum dipilih atau upload gagal.'],400);
  $f=$_FILES['photo'];
  if($f['size']>5*1024*1024) out(['status'=>'error','message'=>'Ukuran foto maksimal 5 MB.'],400);
  $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
  $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
  if(!isset($allowed[$mime])) out(['status'=>'error','message'=>'Format foto harus JPG, PNG, atau WEBP.'],400);
  $dir=__DIR__.'/uploads/crew';
  if(!is_dir($dir) && !mkdir($dir,0775,true)) out(['status'=>'error','message'=>'Folder upload Crew tidak dapat dibuat.'],500);
  $name='crew_'.date('Ymd_His').'_'.bin2hex(random_bytes(4)).'.'.$allowed[$mime];
  $dest=$dir.'/'.$name;
  if(!move_uploaded_file($f['tmp_name'],$dest)) out(['status'=>'error','message'=>'Foto gagal disimpan di server.'],500);
  out(['status'=>'success','message'=>'Foto berhasil diupload.','path'=>'uploads/crew/'.$name]);
}
if($action==='save' && $_SERVER['REQUEST_METHOD']==='POST'){
  require_admin();
  $payload=json_decode(file_get_contents('php://input'),true);
  if(!is_array($payload))out(['status'=>'error','message'=>'Data Crew tidak valid.'],400);
  $eventId=trim((string)($payload['event_id']??''));
  if($eventId==='' || !ctype_digit($eventId))out(['status'=>'error','message'=>'Event belum dipilih atau ID event tidak valid.'],400);
  $eid=(int)$eventId;
  $data=is_array($payload['data']??null)?$payload['data']:[];
  foreach($data as &$g){
    $g['role']=trim((string)($g['role']??'Struktur Baru'));
    $g['desc']=trim((string)($g['desc']??''));
    $g['members']=is_array($g['members']??null)?$g['members']:[];
    foreach($g['members'] as &$m){
      $m['name']=trim((string)($m['name']??'Tanpa Nama'));
      $m['alias']=trim((string)($m['alias']??''));
      $m['photo']=trim((string)($m['photo']??''));
    }
  }
  unset($g,$m);
  ensure_crew_table($conn);
  $json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
  if($json===false)out(['status'=>'error','message'=>'Data Crew gagal diproses.'],500);
  $stmt=$conn->prepare("INSERT INTO crew_event_data(event_id,data_json) VALUES(?,?) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json)");
  if(!$stmt)out(['status'=>'error','message'=>'Gagal menyiapkan penyimpanan Crew: '.$conn->error],500);
  $stmt->bind_param('is',$eid,$json);
  if(!$stmt->execute())out(['status'=>'error','message'=>'Gagal menyimpan Crew ke database: '.$stmt->error],500);
  $stmt->close();
  out(['status'=>'success','message'=>'Data Crew event berhasil disimpan ke database.','data'=>$data,'event_id'=>$eventId]);
}
out(['status'=>'error','message'=>'Action tidak ditemukan.'],404);
