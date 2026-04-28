import type { NextAuthConfig } from "next-auth";

// Edge-compatible config used by middleware.
// Provider list lives in src/auth.ts (Node runtime).
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAuthPage =
        nextUrl.pathname === "/login" || nextUrl.pathname === "/signup";

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      }
      if (isOnAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string | null) ?? null;
      }
      return session;
    }
  },
  providers: [] // populated in src/auth.ts
};
