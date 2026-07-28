import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT count(*)::int AS students FROM students"
    );
    return Response.json({ ok: true, students: result.rows[0].students });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}