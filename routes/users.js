// ==========================================
// KELOLA USER (SISWA)  -- tanggung jawab: Bagas
// Dipasang di index.js: app.use("/api/users", require("./routes/users"));
// ==========================================
const express = require("express");
const { pool } = require("../db");

const router = express.Router();

const USER_COLUMNS =
  "id, nama, kelas, sekolah, created_at AS createdAt, updated_at AS updatedAt";

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Validasi body. Mengembalikan { error } atau { data }
function validateUserBody(body) {
  const nama = String(body?.nama ?? "").trim();
  const kelas = String(body?.kelas ?? "").trim();
  const sekolah = String(body?.sekolah ?? "").trim();

  if (!nama || !kelas || !sekolah) {
    return { error: "Nama, kelas, dan asal sekolah wajib diisi." };
  }
  if (nama.length > 255 || sekolah.length > 255 || kelas.length > 100) {
    return { error: "Nama/sekolah maksimal 255 karakter dan kelas maksimal 100 karakter." };
  }
  return { data: { nama, kelas, sekolah } };
}

// Login siswa (/api/auth/student-login) mencocokkan berdasarkan nama,
// jadi nama harus unik (tidak peduli huruf besar/kecil).
async function isNamaTaken(nama, exceptId = 0) {
  const [rows] = await pool.execute(
    "SELECT id FROM users WHERE LOWER(nama) = LOWER(?) AND id <> ? LIMIT 1",
    [nama, exceptId]
  );
  return rows.length > 0;
}

async function findUser(id) {
  const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

// GET /api/users            -> semua user (array, sama seperti sebelumnya)
// GET /api/users?q=eca      -> cari di nama / sekolah
// GET /api/users?kelas=3 SD -> filter kelas
router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const kelas = String(req.query.kelas ?? "").trim();

  const where = [];
  const params = [];
  if (q) {
    where.push("(nama LIKE ? OR sekolah LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (kelas) {
    where.push("kelas = ?");
    params.push(kelas);
  }

  const sql =
    `SELECT ${USER_COLUMNS} FROM users` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY id DESC";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID user tidak valid." });

  const user = await findUser(id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
  res.json(user);
});

router.post("/", async (req, res) => {
  const { error, data } = validateUserBody(req.body);
  if (error) return res.status(400).json({ message: error });

  if (await isNamaTaken(data.nama)) {
    return res.status(409).json({ message: "Nama siswa sudah terdaftar." });
  }

  const [result] = await pool.execute(
    "INSERT INTO users (nama, kelas, sekolah) VALUES (?, ?, ?)",
    [data.nama, data.kelas, data.sekolah]
  );
  res.status(201).json(await findUser(result.insertId));
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID user tidak valid." });

  const { error, data } = validateUserBody(req.body);
  if (error) return res.status(400).json({ message: error });

  if (!(await findUser(id))) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }
  if (await isNamaTaken(data.nama, id)) {
    return res.status(409).json({ message: "Nama siswa sudah terdaftar." });
  }

  await pool.execute(
    "UPDATE users SET nama = ?, kelas = ?, sekolah = ?, updated_at = NOW() WHERE id = ?",
    [data.nama, data.kelas, data.sekolah, id]
  );
  res.json(await findUser(id));
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID user tidak valid." });

  if (!(await findUser(id))) {
    return res.status(404).json({ message: "User tidak ditemukan." });
  }
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true, id });
});

module.exports = router;
