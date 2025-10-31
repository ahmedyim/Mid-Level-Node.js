// tests/e2e/auth.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTables } from "../db/createTable";
import { checkDbConnection, pool } from "../config/db.config";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { app } from "../index";
import http from "http";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  await checkDbConnection();
  await createTables();

  server = http.createServer(app);
  server.listen(0);
  const port = (server.address() as any).port;
  baseUrl = `http://localhost:${port}`;
});

// afterAll(async () => {
//   await pool.query(
//     "TRUNCATE users, workspaces, workspace_members, projects, project_members, tasks, notifications CASCADE"
//   );
//   server.close();
// });

describe("Authentication Flow E2E (Apollo)", () => {

  let cookies: string[] = [];
let accessToken: string;
  it("should create a new user via GraphQL mutation", async () => {
    const mutation = `
      mutation CreateUser($name: String!, $email: String!, $phone: String!, $password: String!) {
        createUser(name: $name, email: $email, phone: $phone, password: $password) {
          id
          name
          email
          phone
          globalStatus
        }
      }
    `;

    const res = await fetch(`${baseUrl}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: mutation,
        variables: {
          name: "Ali",
          email: "ali@test.com",
          phone: "09324234",
          password: "ahmed1234",
        },
      }),
    });
    const data = await res.json();
   
    const user = data.data.createUser;

    expect(res.status).toBe(200);
    expect(user).toHaveProperty("id");
    expect(user.email).toBe("ali@test.com");
    expect(user.globalStatus).toBe("ACTIVE");  // for default globalStatus 
  });

  it("should login via REST and return tokens", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ali@test.com", password: "ahmed1234" }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.accessToken).toBeDefined();

    accessToken = data.accessToken;
    // Grab the cookie from headers
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    if (setCookie) cookies = [setCookie];
    
  });

  it("should refresh token via REST endpoint", async () => {
    const res = await fetch(`${baseUrl}/api/auth/accessToken`, {
      method: "GET",
      headers: {
         "Content-Type": "application/json" ,
        "Cookie": cookies.join("; ")},
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.accessToken).toBeDefined();
  });
it("should allow member ahmed to access workspace", async () => {
   const query = `
      query getWorkspace($id: Int!) {
        getWorkspace(id: $Int) {
          id
          name
         members: {
         userId,
         role,
         }
        }
      }
    `;

     const res = await fetch(`${baseUrl}/graphql`, {
      method: "POST",
      headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
        },
      body: JSON.stringify({
        query: query,
        variables: {
          id: 1,
        },
      }),
    });
    const data=await res.json()
   console.log(data)
    expect(res.status).toBe(200);
  });
});

describe("Authorization Flow E2E", () => {
  let accessToken: string;
  let bobToken: string;
  let workspaceId: number;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("password", 10);

    const ahmed = await pool.query(
      `INSERT INTO users (name, email, phone, password, global_status)
       VALUES ('alemu', 'alemu@test.com', '092434243', $1, 'ACTIVE') RETURNING *`,
      [passwordHash]
    );

    const bob = await pool.query(
      `INSERT INTO users (name, email, phone, password, global_status)
       VALUES ('Adem', 'adem@test.com', '0923434234', $1, 'ACTIVE') RETURNING *`,
      [passwordHash]
    );

    accessToken = jwt.sign({ id: ahmed.rows[0].id, email: ahmed.rows[0].email }, process.env.ACCESS_TOKEN_SECRET ?? "", { algorithm: "HS256" });

    const ws = await pool.query(`INSERT INTO workspaces (name) VALUES ('Workspace1') RETURNING *`);
    workspaceId = ws.rows[0].id;

    await pool.query(`INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)`, [
      workspaceId,
      ahmed.rows[0].id,
    ]);
  });



//   it("should prevent non-member Bob from accessing workspace", async () => {
//     const res = await fetch(`${baseUrl}/api/workspace/${workspaceId}`, {
//       headers: { Authorization: `Bearer ${bobToken}` },
//     });
//     expect(res.status).toBe(403);
//   });
});
