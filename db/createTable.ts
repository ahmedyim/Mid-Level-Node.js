import { pool } from "../config/db.config";

export async function createTables() {
  console.log("⏳ Creating tables...");

  // ---------- ENUMS ----------
  const enums = [
    { name: "global_status", values: "'ACTIVE','BANNED','ADMIN'" },
    { name: "workspace_role", values: "'OWNER','MEMBER','VIEWER'" },
    { name: "project_role", values: "'PROJECT_LEAD','CONTRIBUTOR','PROJECT_VIEWER'" },
    { name: "task_status", values: "'TODO','IN_PROGRESS','DONE'" },
    { name: "notification_status", values: "'DELIVERED','SEEN'" },
  ];

  for (const e of enums) {
    const exists = await pool.query(
      `SELECT 1 FROM pg_type WHERE typname = $1`,
      [e.name]
    );
    if (exists.rowCount === 0) {
      await pool.query(`CREATE TYPE ${e.name} AS ENUM (${e.values})`);
      console.log(`✅ Created enum: ${e.name}`);
    }
  }

  // ---------- TABLES ----------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      global_status global_status NOT NULL DEFAULT 'ACTIVE'
    )
  `);
  await pool.query(`
    
CREATE TABLE IF NOT EXISTS user_devices (
  id SERIAL PRIMARY KEY,                           
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,                                
  user_agent TEXT,                                  
  login_time TIMESTAMP DEFAULT NOW(),               
  is_revoked BOOLEAN DEFAULT FALSE                 
)
    `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role workspace_role NOT NULL DEFAULT 'MEMBER',
      PRIMARY KEY (workspace_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role project_role NOT NULL DEFAULT 'CONTRIBUTOR',
      PRIMARY KEY (project_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status task_status NOT NULL DEFAULT 'TODO'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status notification_status NOT NULL DEFAULT 'DELIVERED',
      related_entity_id INT
    )
  `);
  await pool.query(
    `
  CREATE TABLE IF NOT EXISTS auditLogs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  level VARCHAR(20) NOT NULL,
  category VARCHAR(20) NOT NULL,
  "userId" INT,
  "ipAddress" VARCHAR(50),
  action TEXT NOT NULL,
  details JSONB
)
    `
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL
)`)

await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      user_id INTEGER,
      ip_address TEXT,
      action TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ---------- INDEXES ----------
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id)`);

  console.log("✅ All tables and indexes created successfully");
}
