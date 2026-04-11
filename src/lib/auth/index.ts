import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/auth/password";
import authConfig from "@/lib/auth/config";
import { getUserByEmail } from "@/lib/db/queries";

const authSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV !== "production" ? "pixelverse-dev-secret" : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailValue = credentials?.email;
        const passwordValue = credentials?.password;

        const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
        const password = typeof passwordValue === "string" ? passwordValue : "";

        if (!email || !password) {
          return null;
        }

        const user = await getUserByEmail(email);

        if (!user || !verifyPassword(password, user.passwordHash)) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: "Pixelverse",
        };
      },
    }),
  ],
  secret: authSecret,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
