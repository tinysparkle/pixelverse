import NextAuth from "next-auth";
import authConfig from "@/lib/auth/config";

export const middleware = NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // 保护以下路由，要求登录
    "/notes",
    "/notes/:path*",
    "/tasks",
    "/tasks/:path*",
    "/api/notes",
    "/api/notes/:path*",
    "/api/tasks",
    "/api/tasks/:path*",
    "/api/upload",
  ],
};
