
import { logout,login,getAccessToken } from "../controllers/authController/authController";
import express from"express"

export const authRoute=express.Router()
authRoute.post("/login",login)
authRoute.get("/accessToken",getAccessToken)
authRoute.post("/logout",logout)


