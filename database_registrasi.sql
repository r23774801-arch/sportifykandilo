-- Struktur kompatibel dengan database event_registrations yang sudah ada.
-- Tidak menghapus / mengganti kolom lama: id, event_id, nama_tim,
-- nama_pemenang, status_pendaftaran, created_at.
CREATE TABLE IF NOT EXISTS event_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  nama_tim VARCHAR(150) NULL,
  nama_pemenang VARCHAR(255) NULL,
  status_pendaftaran VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_id (event_id),
  INDEX idx_status_pendaftaran (status_pendaftaran)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Jika tabel event_registrations sudah ada, api.php akan otomatis menambahkan
-- kolom berikut saat halaman Gabung dibuka/dikirim. Jadi tidak perlu rename field lama.

-- Data master Crew disimpan terpisah agar satu orang cukup didaftarkan sekali,
-- lalu dapat dipilih pada banyak event melalui menu Join Event.
CREATE TABLE IF NOT EXISTS crew_members (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- api.php otomatis menambahkan kolom crew_id ke event_registrations pada
-- instalasi lama, sehingga data pendaftaran lama tetap kompatibel.
