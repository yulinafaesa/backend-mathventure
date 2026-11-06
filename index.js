const express = require("express");
const { pool, dbConfig, initDb, hashPassword } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware CORS agar dapat diakses oleh Next.js (mathventure-admin) maupun Flutter (mathventure-mobile)
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
      service: "mathventure-backend",
      database: "mysql",
      dbName: dbConfig.database,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
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
// 2. AUTHENTICATION (Admin & Student)
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

// Endpoint login siswa (disiapkan untuk integrasi Flutter mathventure-mobile)
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

if (require.main === module) {
  initDb()
    .then(() => {
      console.log(`Terhubung ke MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
    })
    .catch((err) => {
      console.warn(`Peringatan: MySQL belum siap (${err.message}). Server akan mencoba lagi saat ada request.`);
    })
    .finally(() => {
      app.listen(PORT, () => {
        console.log(`MathVenture Backend berjalan di http://localhost:${PORT}`);
      });
    });
}

module.exports = app;
