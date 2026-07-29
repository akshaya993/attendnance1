import { Pool } from "pg";

// Pool sizing is fixed by context/architecture.md - do not tune without measuring.
const POOL_CONFIG = {
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

function buildPool() {
  // Preferred: single DATABASE_URL (what .env.local already uses).
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ...POOL_CONFIG,
    });
  }

  // Fallback: discrete PG* variables.
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

  if (!PGHOST || !PGDATABASE || !PGUSER) {
    throw new Error(
      "Database not configured. Set DATABASE_URL (preferred) or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD in .env.local"
    );
  }

  return new Pool({
    host: PGHOST,
    port: Number(PGPORT) || 5432,
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    ...POOL_CONFIG,
  });
}

// Next.js dev re-evaluates modules on every file save. Without this guard a new
// Pool (up to 15 connections) would be created on each save until PostgreSQL
// rejects everything with "too many clients already". Stashing it on globalThis
// keeps exactly one pool alive across hot reloads.
const globalForDb = globalThis;

if (!globalForDb.__schoolAppPool) {
  globalForDb.__schoolAppPool = buildPool();

  // An idle client dropped by the server (restart, network blip) emits 'error'.
  // Unhandled, this crashes the whole Node process. Log it and let pg recycle.
  globalForDb.__schoolAppPool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
}

export const pool = globalForDb.__schoolAppPool;

/**
 * Run a single parameterized query.
 * ALWAYS pass user input through params - never build SQL with template strings.
 *   query("SELECT * FROM classes WHERE branch_id = $1", [branchId])
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run several statements as one all-or-nothing unit.
 * Required for money (fees + receipts + balance + audit) and promotions.
 *   await withTransaction(async (client) => {
 *     await client.query("UPDATE fees SET ...", [...]);
 *     await client.query("INSERT INTO receipts ...", [...]);
 *   });
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}