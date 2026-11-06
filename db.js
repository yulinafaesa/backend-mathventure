const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, "mathventure.db");
const db = new DatabaseSync(dbPath);

// Aktifkan WAL mode dan Foreign Keys
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      deskripsi TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS soal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      materi_id INTEGER NOT NULL,
      pertanyaan TEXT NOT NULL,
      jawaban TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (materi_id) REFERENCES materi(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kelas TEXT NOT NULL,
      sekolah TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default admin jika belum ada
  const adminCount = db.prepare("SELECT COUNT(*) AS count FROM admins").get().count;
  if (adminCount === 0) {
    const defaultEmail = (process.env.ADMIN_EMAIL || "adminmathventure@gmail.com").toLowerCase();
    const defaultPassword = process.env.ADMIN_PASSWORD || "Admin@123456";
    db.prepare("INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)").run(
      defaultEmail,
      hashPassword(defaultPassword),
      "Admin MathVenture"
    );
  }

  // Seed data awal materi & soal jika tabel materi masih kosong
  const materiCount = db.prepare("SELECT COUNT(*) AS count FROM materi").get().count;
  if (materiCount === 0) {
    const insertMateri = db.prepare("INSERT INTO materi (id, judul, deskripsi) VALUES (?, ?, ?)");
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
      insertMateri.run(m.id, m.judul, m.deskripsi);
    }

    const insertSoal = db.prepare("INSERT INTO soal (id, materi_id, pertanyaan, jawaban) VALUES (?, ?, ?, ?)");
    const initialSoal = [
      { id: 1, materiId: 1, pertanyaan: "456", jawaban: "Empat Ratus Lima Puluh Enam" },
      { id: 2, materiId: 1, pertanyaan: "809", jawaban: "Delapan Ratus Sembilan" },
      { id: 3, materiId: 2, pertanyaan: "Angka 7 pada 372 bernilai ...", jawaban: "Puluhan" },
      { id: 4, materiId: 3, pertanyaan: "235 + 148 = ...", jawaban: "383" },
      { id: 5, materiId: 4, pertanyaan: "502 - 267 = ...", jawaban: "235" },
    ];
    for (const s of initialSoal) {
      insertSoal.run(s.id, s.materiId, s.pertanyaan, s.jawaban);
    }
  }

  // Seed data awal users jika tabel users masih kosong
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare("INSERT INTO users (id, nama, kelas, sekolah) VALUES (?, ?, ?, ?)");
    const initialUsers = [
      { id: 1, nama: "Eca", kelas: "3 SD", sekolah: "SD Brawijaya" },
      { id: 2, nama: "Rafi Akbar", kelas: "3 SD", sekolah: "SD Brawijaya" },
      { id: 3, nama: "Naura Azzahra", kelas: "2 SD", sekolah: "SDN Sumbersari 1" },
      { id: 4, nama: "Daffa Pratama", kelas: "4 SD", sekolah: "SD Islam Malang" },
      { id: 5, nama: "Kirana Larasati", kelas: "3 SD", sekolah: "SDN Lowokwaru 3" },
    ];
    for (const u of initialUsers) {
      insertUser.run(u.id, u.nama, u.kelas, u.sekolah);
    }
  }
}

initDb();

module.exports = {
  db,
  hashPassword,
};
