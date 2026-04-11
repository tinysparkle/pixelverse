import type { NextAuthConfig } from "next-auth";

const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: async ({ auth }) => !!auth,
  },
} satisfies NextAuthConfig;

export default authConfig;