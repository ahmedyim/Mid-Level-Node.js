import { pool } from "../config/db.config";
import { PubSub } from "graphql-subscriptions";
import gql from "graphql-tag";
import { AuditLogger, LogCategory } from "../utils/logger";
export const pubsub = new PubSub();
const TASK_STATUS_UPDATED = "TASK_STATUS_UPDATED";
export const projectTypeDefs = gql`
  enum ProjectRole {
    PROJECT_LEAD
    CONTRIBUTOR
    PROJECT_VIEWER
  }

  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
  }

  enum NotificationStatus {
    DELIVERED
    SEEN
  }

  type Project {
    id: ID!
    name: String!
    workspace_id: Int!
    members: [ProjectMember!]!
  }

  type ProjectMember {
    project_id: Int!
    user_id: Int!
    role: ProjectRole!
  }

  type Task {
    id: ID!
    project_id: Int!
    title: String!
    description: String
    status: TaskStatus!
  }

  type Notification {
    id: ID!
    title: String!
    body: String!
    recipient_id: Int!
    related_entity_id: Int
    status: NotificationStatus!
  }

  type Query {
    getProject(id: ID!): Project!
    getProjectsByWorkspace(workspaceId: Int!): [Project!]!
    getTasks(projectId: Int!): [Task!]!
    getNotifications: [Notification!]!
  }

  type Mutation {
    createProject(workspaceId: Int!, name: String!): Project!
    addProjectMember(projectId: Int!, userId: Int!, role: ProjectRole): Project!
    updateProjectMemberRole(projectId: Int!, userId: Int!, role: ProjectRole!): Project!
    createTask(
      projectId: Int!
      title: String!
      description: String
      assignedToIds: [Int!]
    ): Task!
    updateTask(id: Int!, title: String, description: String, status: TaskStatus): Task!
    deleteTask(id: Int!): Boolean!
    markNotificationAsSeen(id: Int!): Notification!
    saveFcmToken(token: String!): Boolean!
  }

  type Subscription {
    taskStatusUpdated(workspaceId: Int!): Task
  }
`;
export enum ProjectRole {
  PROJECT_LEAD = "PROJECT_LEAD",
  CONTRIBUTOR = "CONTRIBUTOR",
  PROJECT_VIEWER = "PROJECT_VIEWER",
}

interface  ProjectMember {
  project_id: number,
  user_id: number,
  role: ProjectRole
}

export enum TaskStatus {
    TODO="TODO",
    IN_PROGRESS="IN_PROGRESS",
    DONE="DONE"
  }

  export 
  enum NotificationStatus {
    DELIVERED="DELIVERED",
    SEEN="SEEN"
  }


  export const fcmResolvers = {
  Mutation: {
    saveFcmToken: async (_: any, { token }: { token: string }, context : any) => {
      const {user}=context
      if (!user) throw new Error("Unauthorized");
      await pool.query(
        `INSERT INTO user_fcm_tokens (user_id, token)
         VALUES ($1, $2)
         ON CONFLICT (token) DO NOTHING`,
        [user.id, token]
      );
      return true;
    },
  },
};

// ---------- PostgreSQL-Based Resolver ----------
export const projectResolver= {
  Query: {
    // Get one project (with members)
    getProject: async (_: any, { id }: { id: number }, context: { user: any }) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      // Check membership
      const membership = await pool.query(
        `SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2`,
        [user.id, id]
      );
      if (membership.rowCount === 0) throw new Error("Access denied");

      // Fetch project and members
      const projectRes = await pool.query(`SELECT * FROM projects WHERE id = $1`, [id]);
      if (projectRes.rowCount === 0) throw new Error("Project not found");

      const members = await pool.query(`SELECT * FROM project_members WHERE project_id = $1`, [id]);
      return { ...projectRes.rows[0], members: members.rows };
    },

    // Get all projects in a workspace (only for workspace members)
    getProjectsByWorkspace: async (_: any, { workspaceId }: { workspaceId: number }, context: any) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const wsMember = await pool.query(
        `SELECT * FROM workspace_members WHERE user_id = $1 AND workspace_id = $2`,
        [user.id, workspaceId]
      );
      if (wsMember.rowCount === 0) throw new Error("Access denied");

      const projects = await pool.query(`SELECT * FROM projects WHERE workspace_id = $1`, [workspaceId]);
      const members = await pool.query(`SELECT * FROM project_members`);
      return projects.rows.map((p) => ({
        ...p,
        members: members.rows.filter((m) => m.project_id === p.id),
      }));
    },

    // Get all tasks for a project
    getTasks: async (_: any, { projectId }: { projectId: number }, context: { user: any }) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      const membership = await pool.query(
        `SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2`,
        [user.id, projectId]
      );
      if (membership.rowCount === 0) throw new Error("Access denied");

      const res = await pool.query(`SELECT * FROM tasks WHERE project_id = $1`, [projectId]);
      return res.rows;
    },

    //  Get notifications for logged-in user
    getNotifications: async (_: any, __: any, context: { user: any }) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");
      const res = await pool.query(`SELECT * FROM notifications WHERE recipient_id = $1`, [user.id]);
      return res.rows;
    },
  },

  Mutation: {
    //  Create a new project
 createProject: async (_: any, { workspaceId, name }: { workspaceId: number; name: string }, context: { user: any }) => {
  const { user } = context;

  if (!user) throw new Error("Unauthorized");

  // Check if workspace member
  const wsMember = await pool.query(
    `SELECT * FROM workspace_members WHERE user_id = $1 AND workspace_id = $2`,
    [user.id, workspaceId]
  );
  if (wsMember.rowCount === 0) throw new Error("Access denied");

   const existProject = await pool.query(
    `SELECT * FROM projects WHERE name = $1 AND workspace_id = $2`,
    [name, workspaceId]
  );
  if (existProject.rowCount != 0) throw new Error("Project name with this workspace already exist");

  // Create project
  const res = await pool.query(
    `INSERT INTO projects (name, workspace_id) VALUES ($1, $2) RETURNING *`,
    [name, workspaceId]
  );
  const project = res.rows[0];

  // Add creator as project lead
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
    [project.id, user.id, ProjectRole.PROJECT_LEAD]
  );

  // Return members in correct shape
  const members = [
    {
      project_id: project.id,
      user_id: user.id,
      role: ProjectRole.PROJECT_LEAD,
    },
  ];

  return { ...project, members };
},

    // Add project member
addProjectMember: async (_: any, { projectId, userId, role = ProjectRole.CONTRIBUTOR }: any,  context: any) => {
  const {user}=context
      if (!user) throw new Error("Unauthorized");

      const requester = await pool.query(
        `SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2 AND role = $3`,
        [user.id, projectId, ProjectRole.PROJECT_LEAD]
      );
      if (requester.rowCount === 0) throw new Error("Only Project Lead can add members");
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
        [projectId, userId, role]
      );

      const members = await pool.query(`SELECT * FROM project_members WHERE project_id = $1`, [projectId]);
      const project = await pool.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
      return { ...project.rows[0], members: members.rows };
    },

    //  Update project member role
    updateProjectMemberRole: async (_: any, { projectId, userId, role }: any, context: any) => {
      const {user}=context
      if (!user) throw new Error("Unauthorized");
      const requester = await pool.query(
        `SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2`,
        [user.id, projectId]
      );
      if (requester.rowCount === 0) throw new Error("Access denied");
      await pool.query(`UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`, [
        role,
        projectId,
        userId,
      ]);
      const members = await pool.query(`SELECT * FROM project_members WHERE project_id = $1`, [projectId]);
      const project = await pool.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
      return { ...project.rows[0], members: members.rows };
    },
    //Create task
   createTask: async (_: any, { projectId, title, description, assignedToIds = [] }: any, context: any) => {
      const { user } = context;
      if (!user) throw new Error("Unauthorized");

      // Check if user is a project member
      const membership = await pool.query(
        `SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2`,
        [user.id, projectId]
      );
      if (membership.rowCount === 0) throw new Error("Access denied");

      // Create the task
      const res = await pool.query(
        `INSERT INTO tasks (project_id, title, description, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [projectId, title, description || "", TaskStatus.TODO]
      );
      const task = res.rows[0];

      // Notify assigned users via DB + Firebase
      // for (const assigneeId of assignedToIds) {
      //   // Create DB notification record
      //   await pool.query(
      //     `INSERT INTO notifications (title, body, recipient_id, related_entity_id, status)
      //      VALUES ($1, $2, $3, $4, $5)`,
      //     [
      //       "New Task Assigned",
      //       `${user.name || user.email} assigned you a new task: ${title}`,
      //       assigneeId,
      //       task.id,
      //       NotificationStatus.DELIVERED,
      //     ]
      //   );

      //   // Get FCM tokens for this user
      //   const tokensRes = await pool.query(
      //     `SELECT token FROM user_fcm_tokens WHERE user_id = $1`,
      //     [assigneeId]
      //   );

      //   if ((tokensRes.rowCount ?? 0) > 0) {
      //     const messages = tokensRes.rows.map((row) => ({
      //       token: row.token,
      //       notification: {
      //         title: "New Task Assigned",
      //         body: `${user.name || user.email} assigned you a new task: ${title}`,
      //       },
      //       data: {
      //         taskId: String(task.id),
      //         projectId: String(projectId),
      //         type: "TASK_ASSIGNED",
      //       },
      //       webpush: {
      //         fcmOptions: {
      //           // optional: link to your web app or deep link
      //           link: "https://your-app.com/task/" + task.id,
      //         },
      //       },
      //     }));

      //     // Send all push notifications asynchronously
      //     await Promise.all(messages.map((msg) => fcm.send(msg).catch(console.error)));
      //   }
      // }

      // Publish GraphQL subscription event for connected clients
      const project = await pool.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
      pubsub.publish(TASK_STATUS_UPDATED, {
        taskStatusUpdated: task,
        workspaceId: project.rows[0].workspace_id,
      });

      return task;
    },
  

    updateTask: async (_: any, { id, title, description, status }: any, context: any) => {
      const{user}=context
  if (!user) throw new Error("Unauthorized");

  const existingRes = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  if (existingRes.rowCount === 0) throw new Error("Task not found");

  const existing = existingRes.rows[0];

  // Update DB
  await pool.query(
    `UPDATE tasks 
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         status = COALESCE($3, status)
     WHERE id = $4`,
    [title, description, status, id]
  );

  const updatedRes = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  const updatedTask = updatedRes.rows[0];

  // Get project to find workspace
  const projectRes = await pool.query(`SELECT * FROM projects WHERE id = $1`, [updatedTask.project_id]);
  const project = projectRes.rows[0];

  // Publish to GraphQL subscriptions
  pubsub.publish(TASK_STATUS_UPDATED, {
    taskStatusUpdated: updatedTask,
    workspaceId: project.workspace_id,
  });

  //Send Firebase notifications to all assignees of the task
  // const assignedUsers = await pool.query(
  //   `SELECT DISTINCT recipient_id FROM notifications WHERE related_entity_id = $1`,
  //   [id]
  // );

  // for (const row of assignedUsers.rows) {
  //   const assigneeId = row.recipient_id;

  //   // Get user's FCM tokens
  //   const tokensRes = await pool.query(
  //     `SELECT token FROM user_fcm_tokens WHERE user_id = $1`,
  //     [assigneeId]
  //   );

  //   if ((tokensRes.rowCount ?? 0) > 0) {
  //     const messages = tokensRes.rows.map((row) => ({
  //       token: row.token,
  //       notification: {
  //         title: "Task Updated",
  //         body: `${user.name || user.email} updated the task: ${updatedTask.title}`,
  //       },
  //       data: {
  //         taskId: String(updatedTask.id),
  //         projectId: String(updatedTask.project_id),
  //         type: "TASK_UPDATED",
  //       },
  //       webpush: {
  //         fcmOptions: {
  //           link: "https://your-app.com/task/" + updatedTask.id,
  //         },
  //       },
  //     }));

  //     await Promise.all(messages.map((msg) => fcm.send(msg).catch(console.error)));

  //   }
  // }
     await AuditLogger.log({
            level: "info",
            category: LogCategory.ACTIVITY,
            userId: user.id,
            action: "User Update task",
            details: { taskId: id ,title:title,description:description},
          });
  return updatedTask;
},


    // Delete task
    deleteTask: async (_: any, { id }: { id: number }, context: any) => {
      const {user}=context
      if (!user) throw new Error("Unauthorized");
      const task = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
      if (task.rowCount === 0) throw new Error("Task not found");
      await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
      return true;
    },

    //Mark notification as seen
    markNotificationAsSeen: async (_: any, { id }: { id: number }, context: any) => {
      const {user}=context
      if (!user) throw new Error("Unauthorized");
      const res = await pool.query(
        `UPDATE notifications SET status = $1 WHERE id = $2 AND recipient_id = $3 RETURNING *`,
        [NotificationStatus.SEEN, id, user.id]
      );
      if (res.rowCount === 0) throw new Error("Notification not found");
      return res.rows[0];
    },
  },

 Subscription: {
  taskStatusUpdated: {
    subscribe: (_: any, { workspaceId }: { workspaceId: number }) =>
      (pubsub as any).asyncIterator(TASK_STATUS_UPDATED),
    resolve: (payload: any, args: { workspaceId: number }) =>
      payload.workspaceId === args.workspaceId ? payload.taskStatusUpdated : null,
  },
}

};
