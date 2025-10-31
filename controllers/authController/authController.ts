
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { pool } from "../../config/db.config";
import { generateAccessToken, generateRefreshToken } from "../../utils/generatToken";
import { AuditLogger, LogCategory } from "../../utils/logger";

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    // Check user in PostgreSQL
    const userRes = await pool.query(
      `SELECT id, email, name, password, global_status FROM users WHERE email = $1`,
      [email]
    );

    if (userRes.rowCount === 0)
      return res.status(401).json({ error: "Invalid credentials" });
    const user = userRes.rows[0];
    if (user.global_status == "BANNED") {
      return res
        .status(403)
        .json({ error: `Your account is ${user.global_status}` });
    }

    //Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid password" });

    //Generate JWT tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    //Get device info
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    //Store device record in PostgreSQL
    await pool.query(
      `INSERT INTO user_devices (user_id, ip_address, user_agent, login_time, is_revoked)
       VALUES ($1, $2, $3, NOW(), false)`,
      [user.id, ipAddress, userAgent]
    );

    await AuditLogger.log({
        level: "info",
        category: LogCategory.USER,
        userId: user.id,
        ipAddress: ipAddress,
        action: "Login",
        details: { login: ["User logn"] },
      });

    //Store refresh token in cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// GET NEW ACCESS TOKEN
export const getAccessToken = async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: "Not authorized" });

  try {
    const payload: any = jwt.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET ?? ""
    );

    //Verify user still exists
    const userRes = await pool.query(
      `SELECT id, email FROM users WHERE id = $1 AND email = $2`,
      [payload.id, payload.email]
    );
    if (userRes.rowCount === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    //Generate new access token
    const accessToken = generateAccessToken(payload.id, payload.email);
    return res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
};

// LOGOUT
export const logout = async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: "Token required" });

  try {
    // Decode token to identify user
    const payload: any = jwt.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET ?? ""
    );

    // Revoke latest device entry
    await pool.query(
      `UPDATE user_devices SET is_revoked = true WHERE user_id = $1 AND is_revoked = false`,
      [payload.id]
    );
  } catch {
    // ignore invalid token silently
  }

  //Clear refresh token cookie
  res.clearCookie("refreshToken", { path: "/" });
  return res.status(200).json({ message: "Logout successful" });
};
