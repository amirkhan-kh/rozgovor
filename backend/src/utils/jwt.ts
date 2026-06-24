import jwt from "jsonwebtoken";

interface TokenPayload {
  id: string;
  role: "company" | "manager" | "admin";
}

export const signToken = (id: string, role: "company" | "manager" | "admin" = "company"): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign({ id, role }, secret, { expiresIn: "7d" });
};

export const verifyToken = (token: string): TokenPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  const decoded = jwt.verify(token, secret) as TokenPayload;
  return decoded;
};
