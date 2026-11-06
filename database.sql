
CREATE DATABASE IF NOT EXISTS `mathventure`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `mathventure`;

CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT 'Admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `materi` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `judul` VARCHAR(255) NOT NULL,
  `deskripsi` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `soal` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `materi_id` INT NOT NULL,
  `pertanyaan` TEXT NOT NULL,
  `jawaban` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_soal_materi`
    FOREIGN KEY (`materi_id`) REFERENCES `materi`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nama` VARCHAR(255) NOT NULL,
  `kelas` VARCHAR(100) NOT NULL,
  `sekolah` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Default Admin (Password: Admin@123456)
INSERT IGNORE INTO `admins` (`id`, `email`, `password_hash`, `name`) VALUES
(1, 'adminmathventure@gmail.com', '60b8ab1da3f890f35dfade3341bc66d5e039de9d3e8f605d5f4741a2b1de51ef', 'Admin MathVenture');

-- Seed Data Awal Materi
INSERT IGNORE INTO `materi` (`id`, `judul`, `deskripsi`) VALUES
(1, 'Mengenal Bilangan', 'Bilangan dapat diurutkan dari yang terkecil hingga terbesar dengan membandingkan nilai tempatnya. Bilangan dengan ratusan yang lebih kecil diletakkan lebih dahulu. Jadi, urutan bilangan dari yang terkecil adalah 125, 238, 341, kemudian 456.'),
(2, 'Nilai Tempat', 'Mengenal satuan, puluhan, dan ratusan'),
(3, 'Penjumlahan', 'Penjumlahan bersusun hingga ratusan'),
(4, 'Pengurangan', 'Pengurangan bersusun dengan meminjam');

-- Seed Data Awal Soal
INSERT IGNORE INTO `soal` (`id`, `materi_id`, `pertanyaan`, `jawaban`) VALUES
(1, 1, '456', 'Empat Ratus Lima Puluh Enam'),
(2, 1, '809', 'Delapan Ratus Sembilan'),
(3, 2, 'Angka 7 pada 372 bernilai ...', 'Puluhan'),
(4, 3, '235 + 148 = ...', '383'),
(5, 4, '502 - 267 = ...', '235');

-- Seed Data Awal Users (Siswa)
INSERT IGNORE INTO `users` (`id`, `nama`, `kelas`, `sekolah`) VALUES
(1, 'Eca', '3 SD', 'SD Brawijaya'),
(2, 'Rafi Akbar', '3 SD', 'SD Brawijaya'),
(3, 'Naura Azzahra', '2 SD', 'SDN Sumbersari 1'),
(4, 'Daffa Pratama', '4 SD', 'SD Islam Malang'),
(5, 'Kirana Larasati', '3 SD', 'SDN Lowokwaru 3');
