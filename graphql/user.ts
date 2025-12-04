import bcrypt from "bcrypt";
import {sendEmail} from "../utils/sendEmail"
import { pool } from "../config/db.config";
import { AuditLogger, LogCategory } from "../utils/logger";
export const userTypeDefs = `
enum GlobalStatus {
  ACTIVE
  BANNED
  ADMIN
}

type User {
  id: Int!
  name: String!
  phone: String!
  email: String!
  password: String!
  globalStatus: GlobalStatus!
}

type Mutation {
  createUser(
    name: String!
    phone: String!
    email: String!
    password: String!
    globalStatus: GlobalStatus = ACTIVE
  ): User

  resetPassword(email: String!): String
  updatePassword(currentPassword: String!, newPassword: String!): String
  updateUserStatus(id: Int!, status: String!): User
  adminResetUserPassword(id: Int!, newPassword: String!): User
}

type Query {
  users: [User!]!
}
`;

//generate random 6-digit token
function generateResetToken(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------- RESOLVERS --
export const useResolver = {
  Query: {
       users: async (_: any, __: any, context: any) => {
      const { user } = context;
      if (!user) {
        throw new Error("Unauthorized – Please log in");
      }
       const dbUser = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
  
      if (dbUser.rows[0].global_status !== "ADMIN") {
        throw new Error("Forbidden – Only ADMINs can view all users");
      }

      const result = await pool.query(
        "SELECT id, name, phone, email, global_status AS \"globalStatus\" FROM users ORDER BY id ASC"
      );

      return result.rows;
    },
  },

  Mutation: {
    // CREATE USER
    createUser: async (_: any, args: any) => {
      const { name, phone, email, password, globalStatus = "ACTIVE" } = args;

      // check existing email or phone
      const existing:any = await pool.query(
        "SELECT * FROM users WHERE email = $1 OR phone = $2",
        [email, phone]
      );
      if (existing.rowCount > 0) {
        throw new Error("Email or phone already exists");
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (name, phone, email, password, global_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, phone, email, hashedPassword, globalStatus]
      );

      return {
              id: result.rows[0].id,
              name: result.rows[0].name,
              phone: result.rows[0].phone,
              email: result.rows[0].email,
              password: result.rows[0].password,
              globalStatus: result.rows[0].global_status, // map column to enum field
            };
    },

    // ---- RESET PASSWORD --------------
    resetPassword: async (_: any, args: any) => {
      const { email } = args;

      if (!email) throw new Error("Email is required");

      const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (result.rowCount === 0) throw new Error("User not found");

      const token = generateResetToken();
      const message = `http://localhost:5000/graphql/update-password/${token}`;

      await sendEmail(email, message);

      // Optional: log reset attempt
      await pool.query(
        `INSERT INTO notifications (title, body, recipient_id, status)
         VALUES ($1, $2, $3, 'DELIVERED')`,
        ["Password reset requested", message, result.rows[0].id]
      );

      return "Reset email sent successfully.";
    },

    // ---- UPDATE PASSWORD
    updatePassword: async (_: any, args: any, context: any) => {
      const { currentPassword, newPassword } = args;
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const dbUser = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
      if (dbUser.rowCount === 0) throw new Error("User not found");

      const match = await bcrypt.compare(currentPassword, dbUser.rows[0].password);
      if (!match) throw new Error("Current password is incorrect");

      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [newHash, user.id]);

      return "Password updated successfully";
    },

    //UPDATE USER STATUS (admin) -----
    updateUserStatus: async (_: any, args: any, context: any) => {
      const { id, status } = args;
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const adminRes = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
      const admin = adminRes.rows[0];
      if (!admin || admin.global_status !== "ADMIN") {
        throw new Error("You are not authorized to update user status");
      }

      const targetRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (targetRes.rowCount === 0) throw new Error("Target user not found");

      await pool.query("UPDATE users SET global_status = $1 WHERE id = $2", [status, id]);

      // optional: log the action
      await pool.query(
        `INSERT INTO notifications (title, body, recipient_id, status)
         VALUES ($1, $2, $3, 'DELIVERED')`,
        [
          `Admin ${admin.email} changed user status`,
          `User ID ${id} set to ${status}`,
          id,
        ]
      );

      const updated = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return updated.rows[0];
    },

    // ---ADMIN RESET PASSWORD
    adminResetUserPassword: async (_: any, args: any, context: any) => {
      const { id, newPassword } = args;
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const adminRes = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
      const admin = adminRes.rows[0];
      if (!admin || admin.global_status !== "ADMIN") {
        throw new Error("You are not authorized to reset user passwords");
      }

      const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (userRes.rowCount === 0) throw new Error("User not found");

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, id]);
           await AuditLogger.log({
                  level: "info",
                  category: LogCategory.ACTIVITY,
                  userId: user.id,
                  action: "Admin reset user password",
                  adminId:user.id,
                  details: { resetPasswordBy: user.id ,ofUserId:id},
                });

      return { ...userRes.rows[0], password: hashedPassword };
    },
  },
};

