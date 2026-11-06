const express = require("express");
const { db, hashPassword } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware CORS agar dapat diakses oleh Next.js (adminmath) maupun Flutter (mathventure)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Helper functions untuk query data
function getAllMateri() {
  return db
    .prepare("SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi ORDER BY id DESC")
    .all();
}

function getAllSoal() {
  return db
    .prepare(
      `SELECT s.id,
              s.materi_id AS materiId,
              s.pertanyaan,
              s.jawaban,
              m.judul AS materiJudul,
              s.created_at AS createdAt,
              s.updated_at AS updatedAt
       FROM soal s
       LEFT JOIN materi m ON m.id = s.materi_id
       ORDER BY s.id DESC`
    )
    .all();
}

function getAllUsers() {
  return db
    .prepare("SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY id DESC")
    .all();
}

function getStats() {
  const totalMateri = db.prepare("SELECT COUNT(*) AS count FROM materi").get().count;
  const totalSoal = db.prepare("SELECT COUNT(*) AS count FROM soal").get().count;
  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  return { totalMateri, totalSoal, totalUsers };
}

// ==========================================
// 1. HEALTH & BOOTSTRAP / STATS
// ==========================================
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "mathventure-backend", timestamp: new Date().toISOString() });
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/bootstrap", (_req, res) => {
  res.json({
    materi: getAllMateri(),
    soal: getAllSoal(),
    users: getAllUsers(),
    stats: getStats(),
  });
});

// ==========================================
// 2. AUTHENTICATION (Admin & Student)
// ==========================================
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email dan password wajib diisi." });
  }

  const admin = db
    .prepare("SELECT id, email, password_hash, name FROM admins WHERE lower(email) = ?")
    .get(email);

  if (!admin || admin.password_hash !== hashPassword(password)) {
    return res.status(401).json({ ok: false, message: "Email atau password salah." });
  }

  return res.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
});

// Endpoint login siswa (disiapkan untuk integrasi Flutter mathventure)
app.post("/api/auth/student-login", (req, res) => {
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama) {
    return res.status(400).json({ ok: false, message: "Nama wajib diisi." });
  }

  const user = db
    .prepare("SELECT id, nama, kelas, sekolah FROM users WHERE lower(nama) = lower(?)")
    .get(nama);

  if (!user) {
    return res.status(404).json({
      ok: false,
      message: "Mohon maaf nama tidak terdaftar segera hubungi admin",
    });
  }

  return res.json({
    ok: true,
    user: {
      ...user,
      inputKelas: kelas || user.kelas,
      inputSekolah: sekolah || user.sekolah,
    },
  });
});

// ==========================================
// 3. CRUD MATERI
// ==========================================
app.get("/api/materi", (_req, res) => {
  res.json(getAllMateri());
});

app.get("/api/materi/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = db
    .prepare("SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ?")
    .get(id);

  if (!item) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }
  res.json(item);
});

app.post("/api/materi", (req, res) => {
  const judul = String(req.body?.judul ?? "").trim();
  const deskripsi = String(req.body?.deskripsi ?? "").trim();

  if (!judul || !deskripsi) {
    return res.status(400).json({ message: "Judul materi dan deskripsi wajib diisi." });
  }

  const result = db
    .prepare("INSERT INTO materi (judul, deskripsi) VALUES (?, ?)")
    .run(judul, deskripsi);

  const created = db
    .prepare("SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ?")
    .get(Number(result.lastInsertRowid));

  res.status(201).json(created);
});

app.put("/api/materi/:id", (req, res) => {
  const id = Number(req.params.id);
  const judul = String(req.body?.judul ?? "").trim();
  const deskripsi = String(req.body?.deskripsi ?? "").trim();

  if (!judul || !deskripsi) {
    return res.status(400).json({ message: "Judul materi dan deskripsi wajib diisi." });
  }

  const existing = db.prepare("SELECT id FROM materi WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }

  db.prepare("UPDATE materi SET judul = ?, deskripsi = ?, updated_at = datetime('now') WHERE id = ?").run(
    judul,
    deskripsi,
    id
  );

  const updated = db
    .prepare("SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ?")
    .get(id);

  res.json(updated);
});

app.delete("/api/materi/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM materi WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }

  db.prepare("DELETE FROM materi WHERE id = ?").run(id);
  res.json({ ok: true, id });
});

// ==========================================
// 4. CRUD SOAL
// ==========================================
app.get("/api/soal", (req, res) => {
  const materiId = req.query.materiId ? Number(req.query.materiId) : null;
  if (materiId) {
    const filtered = db
      .prepare(
        `SELECT s.id,
                s.materi_id AS materiId,
                s.pertanyaan,
                s.jawaban,
                m.judul AS materiJudul,
                s.created_at AS createdAt,
                s.updated_at AS updatedAt
         FROM soal s
         LEFT JOIN materi m ON m.id = s.materi_id
         WHERE s.materi_id = ?
         ORDER BY s.id DESC`
      )
      .all(materiId);
    return res.json(filtered);
  }
  res.json(getAllSoal());
});

app.get("/api/soal/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = db
    .prepare(
      `SELECT s.id,
              s.materi_id AS materiId,
              s.pertanyaan,
              s.jawaban,
              m.judul AS materiJudul,
              s.created_at AS createdAt,
              s.updated_at AS updatedAt
       FROM soal s
       LEFT JOIN materi m ON m.id = s.materi_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!item) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }
  res.json(item);
});

app.post("/api/soal", (req, res) => {
  const materiId = Number(req.body?.materiId);
  const pertanyaan = String(req.body?.pertanyaan ?? "").trim();
  const jawaban = String(req.body?.jawaban ?? "").trim();

  if (!materiId || !pertanyaan || !jawaban) {
    return res.status(400).json({ message: "Materi, pertanyaan, dan jawaban wajib diisi." });
  }

  const materiExists = db.prepare("SELECT id FROM materi WHERE id = ?").get(materiId);
  if (!materiExists) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  const result = db
    .prepare("INSERT INTO soal (materi_id, pertanyaan, jawaban) VALUES (?, ?, ?)")
    .run(materiId, pertanyaan, jawaban);

  const created = db
    .prepare(
      `SELECT s.id,
              s.materi_id AS materiId,
              s.pertanyaan,
              s.jawaban,
              m.judul AS materiJudul,
              s.created_at AS createdAt,
              s.updated_at AS updatedAt
       FROM soal s
       LEFT JOIN materi m ON m.id = s.materi_id
       WHERE s.id = ?`
    )
    .get(Number(result.lastInsertRowid));

  res.status(201).json(created);
});

app.put("/api/soal/:id", (req, res) => {
  const id = Number(req.params.id);
  const materiId = Number(req.body?.materiId);
  const pertanyaan = String(req.body?.pertanyaan ?? "").trim();
  const jawaban = String(req.body?.jawaban ?? "").trim();

  if (!materiId || !pertanyaan || !jawaban) {
    return res.status(400).json({ message: "Materi, pertanyaan, dan jawaban wajib diisi." });
  }

  const existing = db.prepare("SELECT id FROM soal WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }

  const materiExists = db.prepare("SELECT id FROM materi WHERE id = ?").get(materiId);
  if (!materiExists) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  db.prepare(
    "UPDATE soal SET materi_id = ?, pertanyaan = ?, jawaban = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(materiId, pertanyaan, jawaban, id);

  const updated = db
    .prepare(
      `SELECT s.id,
              s.materi_id AS materiId,
              s.pertanyaan,
              s.jawaban,
              m.judul AS materiJudul,
              s.created_at AS createdAt,
              s.updated_at AS updatedAt
       FROM soal s
       LEFT JOIN materi m ON m.id = s.materi_id
       WHERE s.id = ?`
    )
    .get(id);

  res.json(updated);
});

app.delete("/api/soal/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM soal WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }

  db.prepare("DELETE FROM soal WHERE id = ?").run(id);
  res.json({ ok: true, id });
});

// ==========================================
// 5. CRUD USERS (SISWA)
// ==========================================
app.get("/api/users", (_req, res) => {
  res.json(getAllUsers());
});

app.get("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = db
    .prepare("SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?")
    .get(id);

  if (!item) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }
  res.json(item);
});

app.post("/api/users", (req, res) => {
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama || !kelas || !sekolah) {
    return res.status(400).json({ message: "Nama, kelas, dan asal sekolah wajib diisi." });
  }

  const result = db
    .prepare("INSERT INTO users (nama, kelas, sekolah) VALUES (?, ?, ?)")
    .run(nama, kelas, sekolah);

  const created = db
    .prepare("SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?")
    .get(Number(result.lastInsertRowid));

  res.status(201).json(created);
});

app.put("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama || !kelas || !sekolah) {
    return res.status(400).json({ message: "Nama, kelas, dan asal sekolah wajib diisi." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }

  db.prepare(
    "UPDATE users SET nama = ?, kelas = ?, sekolah = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nama, kelas, sekolah, id);

  const updated = db
    .prepare("SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?")
    .get(id);

  res.json(updated);
});

app.delete("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true, id });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MathVenture Backend berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
