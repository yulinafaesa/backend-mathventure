const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { pool, dbConfig, initDb, verifyPassword } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "mathventure-jwt-secret";

// Middleware CORS dan JSON sesuai modul panduan
app.use(cors());
app.use(express.json());

// Endpoint utama sesuai Modul Tahap 6 - Langkah 4
app.get("/", (_req, res) => {
  res.json({
    status: "success",
    message: "Backend Aplikasi MathVenture Berjalan",
  });
});

// Pastikan MySQL sudah diinisialisasi sebelum memproses request API
app.use("/api", async (req, res, next) => {
  if (req.path === "/health") return next();
  try {
    await initDb();
    next();
  } catch (err) {
    console.error("MySQL initialization error:", err.message);
    return res.status(503).json({
      ok: false,
      message: `Gagal terhubung ke MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database}). Pastikan service MySQL (XAMPP/Laragon) sudah berjalan.`,
    });
  }
});

// Helper functions untuk query data MySQL
async function getAllMateri() {
  const [rows] = await pool.query(
    "SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi ORDER BY id DESC"
  );
  return rows;
}

async function getAllSoal() {
  const [rows] = await pool.query(
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
  );
  return rows;
}

async function getAllUsers() {
  const [rows] = await pool.query(
    "SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY id DESC"
  );
  return rows;
}

async function getStats() {
  const [[materiRow]] = await pool.query("SELECT COUNT(*) AS count FROM materi");
  const [[soalRow]] = await pool.query("SELECT COUNT(*) AS count FROM soal");
  const [[usersRow]] = await pool.query("SELECT COUNT(*) AS count FROM users");
  return {
    totalMateri: Number(materiRow.count),
    totalSoal: Number(soalRow.count),
    totalUsers: Number(usersRow.count),
  };
}

// ==========================================
// 1. HEALTH & BOOTSTRAP / STATS
// ==========================================
app.get("/api/health", async (_req, res) => {
  try {
    await initDb();
    res.json({
      ok: true,
      status: "success",
      service: "mathventure-backend",
      database: "mysql",
      dbName: dbConfig.database,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      status: "error",
      service: "mathventure-backend",
      database: "mysql",
      error: err.message,
    });
  }
});

app.get("/api/stats", async (_req, res) => {
  res.json(await getStats());
});

app.get("/api/bootstrap", async (_req, res) => {
  const [materi, soal, users, stats] = await Promise.all([
    getAllMateri(),
    getAllSoal(),
    getAllUsers(),
    getStats(),
  ]);
  res.json({ materi, soal, users, stats });
});

// ==========================================
// 2. AUTHENTICATION (Admin & Student) + JWT
// ==========================================
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email dan password wajib diisi." });
  }

  const [rows] = await pool.execute(
    "SELECT id, email, password_hash, name FROM admins WHERE LOWER(email) = ? LIMIT 1",
    [email]
  );
  const admin = rows[0];

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ ok: false, message: "Email atau password salah." });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: "admin" },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    ok: true,
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
});

// Endpoint login siswa (terhubung dengan Flutter mathventure-mobile & Kelola User di Admin)
app.post("/api/auth/student-login", async (req, res) => {
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama) {
    return res.status(400).json({ ok: false, message: "Nama wajib diisi." });
  }

  const [rows] = await pool.execute(
    "SELECT id, nama, kelas, sekolah FROM users WHERE LOWER(nama) = LOWER(?) LIMIT 1",
    [nama]
  );
  const user = rows[0];

  if (!user) {
    return res.status(404).json({
      ok: false,
      message: "Mohon maaf nama tidak terdaftar segera hubungi admin",
    });
  }

  const token = jwt.sign(
    { id: user.id, nama: user.nama, role: "student" },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  return res.json({
    ok: true,
    token,
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
app.get("/api/materi", async (_req, res) => {
  res.json(await getAllMateri());
});

app.get("/api/materi/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute(
    "SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ? LIMIT 1",
    [id]
  );
  const item = rows[0];

  if (!item) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }
  res.json(item);
});

app.post("/api/materi", async (req, res) => {
  const judul = String(req.body?.judul ?? "").trim();
  const deskripsi = String(req.body?.deskripsi ?? "").trim();

  if (!judul || !deskripsi) {
    return res.status(400).json({ message: "Judul materi dan deskripsi wajib diisi." });
  }

  const [result] = await pool.execute("INSERT INTO materi (judul, deskripsi) VALUES (?, ?)", [
    judul,
    deskripsi,
  ]);

  const [rows] = await pool.execute(
    "SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ? LIMIT 1",
    [result.insertId]
  );

  res.status(201).json(rows[0]);
});

app.put("/api/materi/:id", async (req, res) => {
  const id = Number(req.params.id);
  const judul = String(req.body?.judul ?? "").trim();
  const deskripsi = String(req.body?.deskripsi ?? "").trim();

  if (!judul || !deskripsi) {
    return res.status(400).json({ message: "Judul materi dan deskripsi wajib diisi." });
  }

  const [existingRows] = await pool.execute("SELECT id FROM materi WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }

  await pool.execute("UPDATE materi SET judul = ?, deskripsi = ?, updated_at = NOW() WHERE id = ?", [
    judul,
    deskripsi,
    id,
  ]);

  const [rows] = await pool.execute(
    "SELECT id, judul, deskripsi, created_at AS createdAt, updated_at AS updatedAt FROM materi WHERE id = ? LIMIT 1",
    [id]
  );

  res.json(rows[0]);
});

app.delete("/api/materi/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existingRows] = await pool.execute("SELECT id FROM materi WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "Materi tidak ditemukan." });
  }

  await pool.execute("DELETE FROM materi WHERE id = ?", [id]);
  res.json({ ok: true, id });
});

// ==========================================
// 4. CRUD SOAL
// ==========================================
app.get("/api/soal", async (req, res) => {
  const rawMateriId = req.query.materiId;
  if (
    rawMateriId !== undefined &&
    rawMateriId !== "" &&
    (!Number.isInteger(Number(rawMateriId)) || Number(rawMateriId) <= 0)
  ) {
    return res.status(400).json({ message: "Parameter materiId tidak valid." });
  }
  const materiId = rawMateriId ? Number(rawMateriId) : null;
  if (materiId) {
    const [filtered] = await pool.execute(
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
       ORDER BY s.id DESC`,
      [materiId]
    );
    return res.json(filtered);
  }
  res.json(await getAllSoal());
});

app.get("/api/soal/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute(
    `SELECT s.id,
            s.materi_id AS materiId,
            s.pertanyaan,
            s.jawaban,
            m.judul AS materiJudul,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt
     FROM soal s
     LEFT JOIN materi m ON m.id = s.materi_id
     WHERE s.id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }
  res.json(rows[0]);
});

app.post("/api/soal", async (req, res) => {
  const materiId = Number(req.body?.materiId);
  const pertanyaan = String(req.body?.pertanyaan ?? "").trim();
  const jawaban = String(req.body?.jawaban ?? "").trim();

  if (!materiId || !pertanyaan || !jawaban) {
    return res.status(400).json({ message: "Materi, pertanyaan, dan jawaban wajib diisi." });
  }

  const [materiRows] = await pool.execute("SELECT id FROM materi WHERE id = ? LIMIT 1", [materiId]);
  if (materiRows.length === 0) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  const [result] = await pool.execute(
    "INSERT INTO soal (materi_id, pertanyaan, jawaban) VALUES (?, ?, ?)",
    [materiId, pertanyaan, jawaban]
  );

  const [rows] = await pool.execute(
    `SELECT s.id,
            s.materi_id AS materiId,
            s.pertanyaan,
            s.jawaban,
            m.judul AS materiJudul,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt
     FROM soal s
     LEFT JOIN materi m ON m.id = s.materi_id
     WHERE s.id = ?
     LIMIT 1`,
    [result.insertId]
  );

  res.status(201).json(rows[0]);
});

app.put("/api/soal/:id", async (req, res) => {
  const id = Number(req.params.id);
  const materiId = Number(req.body?.materiId);
  const pertanyaan = String(req.body?.pertanyaan ?? "").trim();
  const jawaban = String(req.body?.jawaban ?? "").trim();

  if (!materiId || !pertanyaan || !jawaban) {
    return res.status(400).json({ message: "Materi, pertanyaan, dan jawaban wajib diisi." });
  }

  const [existingRows] = await pool.execute("SELECT id FROM soal WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }

  const [materiRows] = await pool.execute("SELECT id FROM materi WHERE id = ? LIMIT 1", [materiId]);
  if (materiRows.length === 0) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  await pool.execute(
    "UPDATE soal SET materi_id = ?, pertanyaan = ?, jawaban = ?, updated_at = NOW() WHERE id = ?",
    [materiId, pertanyaan, jawaban, id]
  );

  const [rows] = await pool.execute(
    `SELECT s.id,
            s.materi_id AS materiId,
            s.pertanyaan,
            s.jawaban,
            m.judul AS materiJudul,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt
     FROM soal s
     LEFT JOIN materi m ON m.id = s.materi_id
     WHERE s.id = ?
     LIMIT 1`,
    [id]
  );

  res.json(rows[0]);
});

app.delete("/api/soal/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existingRows] = await pool.execute("SELECT id FROM soal WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }

  await pool.execute("DELETE FROM soal WHERE id = ?", [id]);
  res.json({ ok: true, id });
});

// ==========================================
// 5. CRUD USERS (SISWA)
// ==========================================
app.get("/api/users", async (_req, res) => {
  res.json(await getAllUsers());
});

app.get("/api/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute(
    "SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ? LIMIT 1",
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }
  res.json(rows[0]);
});

app.post("/api/users", async (req, res) => {
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama || !kelas || !sekolah) {
    return res.status(400).json({ message: "Nama, kelas, dan asal sekolah wajib diisi." });
  }

  const [result] = await pool.execute("INSERT INTO users (nama, kelas, sekolah) VALUES (?, ?, ?)", [
    nama,
    kelas,
    sekolah,
  ]);

  const [rows] = await pool.execute(
    "SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ? LIMIT 1",
    [result.insertId]
  );

  res.status(201).json(rows[0]);
});

app.put("/api/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  const nama = String(req.body?.nama ?? "").trim();
  const kelas = String(req.body?.kelas ?? "").trim();
  const sekolah = String(req.body?.sekolah ?? "").trim();

  if (!nama || !kelas || !sekolah) {
    return res.status(400).json({ message: "Nama, kelas, dan asal sekolah wajib diisi." });
  }

  const [existingRows] = await pool.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }

  await pool.execute(
    "UPDATE users SET nama = ?, kelas = ?, sekolah = ?, updated_at = NOW() WHERE id = ?",
    [nama, kelas, sekolah, id]
  );

  const [rows] = await pool.execute(
    "SELECT id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ? LIMIT 1",
    [id]
  );

  res.json(rows[0]);
});

app.delete("/api/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existingRows] = await pool.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }

  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true, id });
});

// Fallback 404 & Error Handler JSON
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, message: "Endpoint API tidak ditemukan." });
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ ok: false, message: "Format JSON tidak valid." });
  }
  console.error("Unhandled backend error:", err);
  return res.status(500).json({ ok: false, message: "Terjadi kesalahan pada server backend." });
});

function startServer() {
  initDb()
    .then(() => {
      console.log(`Terhubung ke MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
    })
    .catch((err) => {
      console.warn(`Peringatan: MySQL belum siap (${err.message}). Server akan mencoba lagi saat ada request.`);
    })
    .finally(() => {
      // Listen di 0.0.0.0 sesuai Modul Tahap 6 - Langkah 4 & Bagian 8 (agar dapat diakses dari Emulator & HP Fisik)
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server berjalan di port ${PORT} (http://localhost:${PORT})`);
      });
    });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
