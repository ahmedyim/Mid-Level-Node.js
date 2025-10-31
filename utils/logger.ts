// src/utils/logger.ts
import winston from "winston";
import fs from "fs";
import path from "path";
import { pool } from "../config/db.config";

// ---------- Types ----------
export type LogLevel = "info" | "warn" | "error" | "security";

export enum LogCategory {
  USER = "USER",
  SYSTEM = "SYSTEM",
  ACTIVITY = "ACTIVITY",
}

export interface AuditLog {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  userId?: number;
  ipAddress?: string;
  action: string;
  adminId?: number;
  details?: Record<string, any>;
}

// ---------- Ensure log directory exists ----------
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ---------- Winston Logger Setup ----------
const fileLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "audit.log"),
      level: "info",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "audit-error.log"),
      level: "error",
    }),
  ],
});

// ---------- Console logging for development ----------
if (process.env.NODE_ENV !== "production") {
  fileLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// ---------- Audit Logger Service ----------
export class AuditLogger {
  /**
   * Writes logs to both the file system and PostgreSQL database.
   */
  static async log({
    level,
    category,
    userId,
    ipAddress,
    action,
    details,
  }: Omit<AuditLog, "timestamp">): Promise<AuditLog> {
    const logEntry: AuditLog = {
      timestamp: new Date().toISOString(),
      level,
      category,
      userId,
      ipAddress,
      action,
      details,
    };

    // ---- Write to file ----
    fileLogger.log({
      level,
      message: `[${category}] ${action}`,
      userId,
      ipAddress,
      details,
      timestamp: logEntry.timestamp,
    });

    // ---- Write to DB ----
    try {
      await pool.query(
        `
          INSERT INTO audit_logs
          (timestamp, level, category, user_id, ip_address, action, details)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          logEntry.timestamp,
          logEntry.level,
          logEntry.category,
          logEntry.userId ?? null,
          logEntry.ipAddress ?? null,
          logEntry.action,
          logEntry.details ? JSON.stringify(logEntry.details) : null,
        ]
      );
    } catch (err) {
      // Fallback to console logging if DB write fails
      console.error("❌ Failed to write audit log to DB:", err);
    }

    return logEntry;
  }

  /**
   * Convenience wrappers for log levels.
   */
  static info(data: Omit<AuditLog, "timestamp" | "level">) {
    return this.log({ ...data, level: "info" });
  }

  static warn(data: Omit<AuditLog, "timestamp" | "level">) {
    return this.log({ ...data, level: "warn" });
  }

  static error(data: Omit<AuditLog, "timestamp" | "level">) {
    return this.log({ ...data, level: "error" });
  }

  static security(data: Omit<AuditLog, "timestamp" | "level">) {
    return this.log({ ...data, level: "security" });
  }
}
