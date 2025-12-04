import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function checkDbConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Connected to PostgreSQL at:", result.rows[0].now);
    client.release(); // release connection back to pool
  } catch (err:any) {
    console.error("❌ Failed to connect to PostgreSQL:", err.message);
    process.exit(1); // stop server if DB fails
  }
}
