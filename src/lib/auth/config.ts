import type { NextAuthConfig } from "next-auth";

const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: async ({ auth, request }) => {
      const p = request.nextUrl.pathname;
      if (p === "/api/news/worker-config" || p === "/api/news/ingest") {
        return true;
      }
      return !!auth;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;