<?php
header('Content-Type: text/html; charset=UTF-8');
require_once 'auth.php';
require_once 'koneksi.php';
if (!is_logged_in() || !is_admin()) { http_response_code(403); exit('Akses hanya untuk admin.'); }
$sql = "CREATE TABLE IF NOT EXISTS crew_event_data (
  event_id INT NOT NULL PRIMARY KEY,
  data_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
if ($conn->query($sql)) {
  echo '<h2>Database Crew siap.</h2><p>Tabel <b>crew_event_data</b> berhasil dibuat atau sudah tersedia.</p><p><a href="index.html">Kembali ke Beranda</a></p>';
} else {
  http_response_code(500);
  echo '<h2>Gagal menyiapkan Database Crew</h2><p>'.htmlspecialchars($conn->error, ENT_QUOTES, 'UTF-8').'</p><p>Jika hosting melarang CREATE TABLE, import file <b>database_crew.sql</b> melalui phpMyAdmin.</p>';
}
