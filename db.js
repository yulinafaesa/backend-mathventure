const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

// Muat file .env jika tersedia (Node 20.6+)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Abaikan jika gagal memuat .env
  }
}

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "mathventure",
};

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

let isInitialized = false;
let initPromise = null;

async function initDb() {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. Pastikan database sudah dibuat di MySQL
      const rootConn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
      });

      await rootConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await rootConn.end();

      // 2. Buat tabel-tabel jika belum ada
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL DEFAULT 'Admin',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS materi (
          id INT AUTO_INCREMENT PRIMARY KEY,
          judul VARCHAR(255) NOT NULL,
          deskripsi TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS soal (
          id INT AUTO_INCREMENT PRIMARY KEY,
          materi_id INT NOT NULL,
          pertanyaan TEXT NOT NULL,
          jawaban TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_soal_materi
            FOREIGN KEY (materi_id) REFERENCES materi(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nama VARCHAR(255) NOT NULL,
          kelas VARCHAR(100) NOT NULL,
          sekolah VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 3. Seed default admin jika belum ada
      const [[adminRow]] = await pool.query("SELECT COUNT(*) AS count FROM admins");
      if (Number(adminRow.count) === 0) {
        const defaultEmail = (process.env.ADMIN_EMAIL || "adminmathventure@gmail.com").toLowerCase();
        const defaultPassword = process.env.ADMIN_PASSWORD || "Admin@123456";
        await pool.execute("INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)", [
          defaultEmail,
          hashPassword(defaultPassword),
          "Admin MathVenture",
        ]);
      }

      // 4. Seed data awal materi & soal jika tabel materi masih kosong
      const [[materiRow]] = await pool.query("SELECT COUNT(*) AS count FROM materi");
      if (Number(materiRow.count) === 0) {
        const initialMateri = [
          {
            id: 1,
            judul: "Mengenal Bilangan",
            deskripsi:
              "Bilangan dapat diurutkan dari yang terkecil hingga terbesar dengan membandingkan nilai tempatnya. Bilangan dengan ratusan yang lebih kecil diletakkan lebih dahulu. Jadi, urutan bilangan dari yang terkecil adalah 125, 238, 341, kemudian 456.",
          },
          { id: 2, judul: "Nilai Tempat", deskripsi: "Mengenal satuan, puluhan, dan ratusan" },
          { id: 3, judul: "Penjumlahan", deskripsi: "Penjumlahan bersusun hingga ratusan" },
          { id: 4, judul: "Pengurangan", deskripsi: "Pengurangan bersusun dengan meminjam" },
        ];
        for (const m of initialMateri) {
          await pool.execute("INSERT INTO materi (id, judul, deskripsi) VALUES (?, ?, ?)", [
            m.id,
            m.judul,
            m.deskripsi,
          ]);
        }

        const initialSoal = [
          { id: 1, materiId: 1, pertanyaan: "456", jawaban: "Empat Ratus Lima Puluh Enam" },
          { id: 2, materiId: 1, pertanyaan: "809", jawaban: "Delapan Ratus Sembilan" },
          { id: 3, materiId: 2, pertanyaan: "Angka 7 pada 372 bernilai ...", jawaban: "Puluhan" },
          { id: 4, materiId: 3, pertanyaan: "235 + 148 = ...", jawaban: "383" },
          { id: 5, materiId: 4, pertanyaan: "502 - 267 = ...", jawaban: "235" },
        ];
        for (const s of initialSoal) {
          await pool.execute("INSERT INTO soal (id, materi_id, pertanyaan, jawaban) VALUES (?, ?, ?, ?)", [
            s.id,
            s.materiId,
            s.pertanyaan,
            s.jawaban,
          ]);
        }
      }

      // 5. Seed data awal users jika tabel users masih kosong
      const [[userRow]] = await pool.query("SELECT COUNT(*) AS count FROM users");
      if (Number(userRow.count) === 0) {
        const initialUsers = [
          { id: 1, nama: "Eca", kelas: "3 SD", sekolah: "SD Brawijaya" },
          { id: 2, nama: "Rafi Akbar", kelas: "3 SD", sekolah: "SD Brawijaya" },
          { id: 3, nama: "Naura Azzahra", kelas: "2 SD", sekolah: "SDN Sumbersari 1" },
          { id: 4, nama: "Daffa Pratama", kelas: "4 SD", sekolah: "SD Islam Malang" },
          { id: 5, nama: "Kirana Larasati", kelas: "3 SD", sekolah: "SDN Lowokwaru 3" },
        ];
        for (const u of initialUsers) {
          await pool.execute("INSERT INTO users (id, nama, kelas, sekolah) VALUES (?, ?, ?, ?)", [
            u.id,
            u.nama,
            u.kelas,
            u.sekolah,
          ]);
        }
      }

      isInitialized = true;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

module.exports = {
  pool,
  dbConfig,
  initDb,
  hashPassword,
};
