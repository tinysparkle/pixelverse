import NextAuth from "next-auth";
import authConfig from "@/lib/auth/config";

export const middleware = NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/notes",
    "/notes/:path*",
    "/api/notes",
    "/api/notes/:path*",
    "/api/upload",
  ],
};
