declare module "cookie-parser" {
  import { RequestHandler } from "express";
  function cookieParser(secret?: string, options?: any): RequestHandler;
  export = cookieParser;
}
