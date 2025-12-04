import jwt from "jsonwebtoken";
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET??''
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET??''

export function generateAccessToken(id:number,email:string) {
  return jwt.sign({ id: id, email:email }, ACCESS_TOKEN_SECRET, {
    expiresIn: "16m",
  });
}

     
export function generateRefreshToken(id:number,email:string) {
  return jwt.sign({ id: id, email: email }, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyToken(token:string){
  try{
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET,{ algorithms: ["HS256"] });
      let user = { id: (payload as any).id, email: (payload as any).email };
      return user

    }catch(error:any){
      return error.message
    }
}