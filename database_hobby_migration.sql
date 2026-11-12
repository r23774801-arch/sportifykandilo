-- Sportify Kandilo: Hobby feature migration
-- Jalankan pada database sportify_kandilo di hosting (phpMyAdmin > SQL).

CREATE TABLE IF NOT EXISTS hobby_members (
    id INT NOT NULL AUTO_INCREMENT,
    nama VARCHAR(150) NOT NULL,
    nrp VARCHAR(80) NOT NULL,
    perusahaan VARCHAR(150) NOT NULL,
    hobby VARCHAR(255) NOT NULL,
    foto_path VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Menambahkan foto_path ke tabel Hobby yang dibuat sebelum fitur foto profil.
SET @hobby_photo_column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'hobby_members'
      AND COLUMN_NAME = 'foto_path'
);
SET @hobby_photo_migration = IF(
    @hobby_photo_column_exists = 0,
    'ALTER TABLE hobby_members ADD COLUMN foto_path VARCHAR(255) NULL AFTER hobby',
    'SELECT ''foto_path sudah tersedia'' AS migration_status'
);
PREPARE hobby_photo_stmt FROM @hobby_photo_migration;
EXECUTE hobby_photo_stmt;
DEALLOCATE PREPARE hobby_photo_stmt;

CREATE TABLE IF NOT EXISTS hobby_settings (
    setting_key VARCHAR(40) NOT NULL,
    setting_value LONGTEXT NOT NULL,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO hobby_settings (setting_key, setting_value) VALUES
    ('hobbies', '["Futsal","Basket","Badminton"]'),
    ('companies', '["PT. United Tractors Tbk","Sims","Pama"]');
