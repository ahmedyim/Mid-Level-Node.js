
import { pool } from "../config/db.config";
import { AuditLogger, LogCategory } from "../utils/logger";

export const workTypeDefs = `
enum WorkspaceRole {
  OWNER
  MEMBER
  VIEWER
}

type WorkspaceMember {
  userId: Int!
  role: WorkspaceRole!
}

type Workspace {
  id: Int!
  name: String!
  members: [WorkspaceMember!]!
}

extend type Query {
  getWorkspace(id: Int!): Workspace
  getAllWorkspaces: [Workspace!]!
}

extend type Mutation {
  createWorkspace(name: String!): Workspace
  addWorkspaceMember(workspaceId: Int!, userId: Int!, role: WorkspaceRole = MEMBER): Workspace
  removeWorkspaceMember(workspaceId: Int!, userId: Int!): Workspace
  updateWorkspaceMemberRole(workspaceId: Int!, userId: Int!, role: WorkspaceRole!): Workspace
}
`;

export const workResolver = {
  Query: {
    // Get a single workspace (must be a member)
    getWorkspace: async (_: any, { id }: { id: number }, context: { user: any }) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      // Check membership
      const memberRes = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [id, user.id]
      );
      if (memberRes.rowCount === 0)
        throw new Error("Access denied: not a workspace member");

      // Fetch workspace
      const wsRes = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [id]);
      if (wsRes.rowCount === 0) throw new Error("Workspace not found");

      // Fetch members
      const membersRes = await pool.query(
        `SELECT user_id AS "userId", role FROM workspace_members WHERE workspace_id = $1`,
        [id]
      );

      return {
        id: wsRes.rows[0].id,
        name: wsRes.rows[0].name,
        members: membersRes.rows,
      };
    },

    //ADMIN can view all workspaces
    getAllWorkspaces: async (_: any, __: any, context: { user: any }) => {
      const { user } = context;
        if (!user) {
        throw new Error("Unauthorized – Please log in");
      }
       const dbUser = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
  
      if (dbUser.rows[0].global_status !== "ADMIN") {
        throw new Error("Forbidden – Only ADMINs can view all users");
      }
    
      const wsRes = await pool.query(`SELECT * FROM workspaces ORDER BY id ASC`);
      const workspaces = wsRes.rows;

      const allMembers = await pool.query(
        `SELECT workspace_id AS "workspaceId", user_id AS "userId", role FROM workspace_members`
      );

      // Attach members to each workspace
      return workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        members: allMembers.rows
          .filter((m) => m.workspaceId === w.id)
          .map((m) => ({ userId: m.userId, role: m.role })),
      }));
    },
  },

  Mutation: {
    //Create a workspace and make creator OWNER
    createWorkspace: async (_: any, { name }: { name: string }, context: { user: any }) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const wsRes = await pool.query(
        `INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name`,
        [name]
      );
      const workspace = wsRes.rows[0];

      await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'OWNER')`,
        [workspace.id, user.id]
      );

      await AuditLogger.log({
            level: "info",
            category: LogCategory.ACTIVITY,
            userId: user.id,
            action: "User created a new workspace",
            details: { workspace: workspace.id },
          });


      return {
        ...workspace,
        members: [{ userId: user.id, role: "OWNER" }],
      };
    },

    // Add a member (OWNER only)
    addWorkspaceMember: async (
      _: any,
      { workspaceId, userId, role = "MEMBER" }: { workspaceId: number; userId: number; role?: string },
      context: { user: any }
    ) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const requester = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, user.id]
      );
      if (requester.rowCount === 0 || requester.rows[0].role !== "OWNER")
        throw new Error("Only Owner can add members");

      await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [workspaceId, userId, role]
      );

      const wsRes = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [workspaceId]);
      const membersRes = await pool.query(
        `SELECT user_id AS "userId", role FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId]
      );

       await AuditLogger.log({
            level: "info",
            category: LogCategory.ACTIVITY,
            userId: user.id,
            action: "User Add member to workspace",
            details: { workspaceId: workspaceId ,newMember:userId,role:role},
          });
      return { ...wsRes.rows[0], members: membersRes.rows };
    },

    //Remove member (OWNER only)
    removeWorkspaceMember: async (
      _: any,
      { workspaceId, userId }: { workspaceId: number; userId: number },
      context: { user: any }
    ) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const requester = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, user.id]
      );
      if (requester.rowCount === 0 || requester.rows[0].role !== "OWNER")
        throw new Error("Only Owner can remove members");

      await pool.query(
        `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId]
      );

      const wsRes = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [workspaceId]);
      const membersRes = await pool.query(
        `SELECT user_id AS "userId", role FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId]
      );

           await AuditLogger.log({
            level: "info",
            category: LogCategory.ACTIVITY,
            userId: user.id,
            action: "Remove removeWorkspaceMember",
            details: { removeWorkSpaceMember: `User from worksSpaceId ${workspaceId} is removed by ${user.id}` },
          });

      return { ...wsRes.rows[0], members: membersRes.rows };
    },

    //Update member role (OWNER only)
    updateWorkspaceMemberRole: async (
      _: any,
      { workspaceId, userId, role }: { workspaceId: number; userId: number; role: string },
      context: { user: any }
    ) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const requester = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, user.id]
      );
      if (requester.rowCount === 0 || requester.rows[0].role !== "OWNER")
        throw new Error("Only Owner can update member roles");

      const target = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId]
      );
      if (target.rowCount === 0) throw new Error("Member not found");
      if (target.rows[0].role === "OWNER")
        throw new Error("Cannot change Owner role");

      await pool.query(
        `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
        [role, workspaceId, userId]
      );

      const wsRes = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [workspaceId]);
      const membersRes = await pool.query(
        `SELECT user_id AS "userId", role FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId]
      );

      return { ...wsRes.rows[0], members: membersRes.rows };
    },
  },
};

