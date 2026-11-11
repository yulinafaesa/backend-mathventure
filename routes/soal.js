// ==========================================
// KELOLA SOAL  -- tanggung jawab: Zee
// Dipasang di index.js: app.use("/api/soal", require("./routes/soal"));
// ==========================================
const express = require("express");
const { pool } = require("../db");

const router = express.Router();

const SOAL_SELECT = `
  SELECT s.id,
         s.materi_id AS materiId,
         s.pertanyaan,
         s.jawaban,
         m.judul AS materiJudul,
         s.created_at AS createdAt,
         s.updated_at AS updatedAt
  FROM soal s
  LEFT JOIN materi m ON m.id = s.materi_id`;

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findSoal(id) {
  const [rows] = await pool.execute(`${SOAL_SELECT} WHERE s.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

async function materiExists(materiId) {
  const [rows] = await pool.execute("SELECT id FROM materi WHERE id = ? LIMIT 1", [materiId]);
  return rows.length > 0;
}

// Validasi body. Mengembalikan { error } atau { data }
function validateSoalBody(body) {
  const materiId = parseId(body?.materiId);
  const pertanyaan = String(body?.pertanyaan ?? "").trim();
  const jawaban = String(body?.jawaban ?? "").trim();

  if (!materiId || !pertanyaan || !jawaban) {
    return { error: "Materi, pertanyaan, dan jawaban wajib diisi." };
  }
  return { data: { materiId, pertanyaan, jawaban } };
}

// GET /api/soal                  -> semua soal (array, sama seperti sebelumnya)
// GET /api/soal?materiId=1       -> soal milik satu materi (dipakai app siswa)
// GET /api/soal?q=penjumlahan    -> cari di pertanyaan / jawaban / judul materi
router.get("/", async (req, res) => {
  const where = [];
  const params = [];

  const rawMateriId = req.query.materiId;
  if (rawMateriId !== undefined && rawMateriId !== "") {
    const materiId = parseId(rawMateriId);
    if (!materiId) return res.status(400).json({ message: "Parameter materiId tidak valid." });
    where.push("s.materi_id = ?");
    params.push(materiId);
  }

  const q = String(req.query.q ?? "").trim();
  if (q) {
    where.push("(s.pertanyaan LIKE ? OR s.jawaban LIKE ? OR m.judul LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql =
    SOAL_SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY s.id DESC";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID soal tidak valid." });

  const soal = await findSoal(id);
  if (!soal) return res.status(404).json({ message: "Soal tidak ditemukan." });
  res.json(soal);
});

router.post("/", async (req, res) => {
  const { error, data } = validateSoalBody(req.body);
  if (error) return res.status(400).json({ message: error });

  if (!(await materiExists(data.materiId))) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  const [result] = await pool.execute(
    "INSERT INTO soal (materi_id, pertanyaan, jawaban) VALUES (?, ?, ?)",
    [data.materiId, data.pertanyaan, data.jawaban]
  );
  res.status(201).json(await findSoal(result.insertId));
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID soal tidak valid." });

  const { error, data } = validateSoalBody(req.body);
  if (error) return res.status(400).json({ message: error });

  if (!(await findSoal(id))) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }
  if (!(await materiExists(data.materiId))) {
    return res.status(400).json({ message: "Materi yang dipilih tidak ditemukan." });
  }

  await pool.execute(
    "UPDATE soal SET materi_id = ?, pertanyaan = ?, jawaban = ?, updated_at = NOW() WHERE id = ?",
    [data.materiId, data.pertanyaan, data.jawaban, id]
  );
  res.json(await findSoal(id));
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID soal tidak valid." });

  if (!(await findSoal(id))) {
    return res.status(404).json({ message: "Soal tidak ditemukan." });
  }
  await pool.execute("DELETE FROM soal WHERE id = ?", [id]);
  res.json({ ok: true, id });
});

module.exports = router;
