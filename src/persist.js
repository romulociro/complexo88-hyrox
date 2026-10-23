const { Pool } = require("pg");

const ROW_ID = "store";

let pool = null;
let ready = false;

function enabled() {
  return Boolean(pool);
}

function sslFor(url) {
  if (/localhost|127\.0\.0\.1|sslmode=disable/i.test(url)) return false;
  if (/render\.com|sslmode=require/i.test(url)) return { rejectUnauthorized: false };
  return undefined;
}

function configure() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (pool) return true;
  pool = new Pool({
    connectionString: url,
    ssl: sslFor(url),
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });
  pool.on("error", (err) => {
    console.error("Postgres:", err.message);
  });
  return true;
}

async function ensure() {
  if (!pool) return;
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      doc jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  ready = true;
}

function asDoc(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

async function loadDoc() {
  if (!pool) return { ok: false, doc: null };
  try {
    await ensure();
    const result = await pool.query("SELECT doc FROM app_state WHERE id = $1", [ROW_ID]);
    return { ok: true, doc: asDoc(result.rows[0]?.doc) };
  } catch (err) {
    console.error("Falha ao ler o ranking no Postgres:", err.message);
    return { ok: false, doc: null };
  }
}

async function saveDoc(doc) {
  if (!pool) return false;
  try {
    await ensure();
    await pool.query(
      `INSERT INTO app_state (id, doc, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [ROW_ID, JSON.stringify(doc)]
    );
    return true;
  } catch (err) {
    console.error("Falha ao gravar o ranking no Postgres:", err.message);
    return false;
  }
}

async function clearDoc() {
  if (!configure()) return false;
  try {
    await ensure();
    await pool.query("DELETE FROM app_state WHERE id = $1", [ROW_ID]);
    return true;
  } catch (err) {
    console.error("Falha ao limpar o ranking no Postgres:", err.message);
    return false;
  }
}

module.exports = { configure, enabled, loadDoc, saveDoc, clearDoc };
