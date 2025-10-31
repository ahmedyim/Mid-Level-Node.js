import express from "express";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv"
import { createTables } from "./db/createTable";
dotenv.config()
import { ApolloServer } from 'apollo-server-express';
import { typeDefs, resolvers } from "./graphql/schema";
import {authRoute} from "./routes/authRoute"
import { checkDbConnection } from "./config/db.config";
import cookieParser from "cookie-parser";

export const app = express();
// --- REST middleware ---
app.use("/api",express.json());
app.use(cookieParser());
// Example REST endpoint
app.use('/api/auth',authRoute);

const server = new ApolloServer({ typeDefs, resolvers ,context: async({ req }: { req: Request }) => {
    const authHeader = req.headers.authorization || "";
    let user = null;
      const parts = authHeader.split(" "); // ['Bearer', 'token']
       const token = parts.length === 2 ? parts[1] : undefined;
    if (token) {
      try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET??"",{ algorithms: ["HS256"] });
          user = { id: (payload as any).id, email: (payload as any).email };
      } catch(error:any) {
        user = null;
      }
    }
    return { user }; 
  },
});
async function startServer() {
  await server.start();
  // Apply middleware without extra JSON parsing
  server.applyMiddleware({ app, path: '/graphql' });
  await checkDbConnection();
  app.listen(5000, async() => {

    console.log(`Server running on port 5000`);
    console.log(`GraphQL: http://localhost:5000${server.graphqlPath}`);
    console.log(`REST: http://localhost:5000/api/`);
    await createTables()
  });
}

startServer();
