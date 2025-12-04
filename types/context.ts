// types.ts
import type { Request, Response } from "express";
import { Pool } from "pg";

// Define user info stored in context
export interface AuthUser {
  id: number;
  email: string;
}

// Context type
export interface Context {
  req: Request;
  res: Response;
  user: AuthUser | null;
  pool: Pool; 
}
