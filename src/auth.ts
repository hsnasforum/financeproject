import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "./lib/db/prisma";

function enabled(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function configured(value: string | undefined): string {
  return (value ?? "").trim();
}

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];
  const githubId = configured(process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_CLIENT_ID);
  const githubSecret = configured(process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_CLIENT_SECRET);
  if (githubId && githubSecret) {
    providers.push(GitHub({
      clientId: githubId,
      clientSecret: githubSecret,
    }));
  }

  const googleId = configured(process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID);
  const googleSecret = configured(process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET);
  if (googleId && googleSecret) {
    providers.push(Google({
      clientId: googleId,
      clientSecret: googleSecret,
    }));
  }

  return providers;
}

const usePrismaAdapter = enabled(process.env.AUTH_PRISMA_ADAPTER_ENABLED);
const authSecret = configured(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);

export const authConfig = {
  ...(usePrismaAdapter ? { adapter: PrismaAdapter(prisma) } : {}),
  ...(authSecret ? { secret: authSecret } : {}),
  providers: buildProviders(),
  session: {
    strategy: usePrismaAdapter ? "database" : "jwt",
  },
  trustHost: enabled(process.env.AUTH_TRUST_HOST) || process.env.NODE_ENV !== "production",
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token, user }) {
      const userId = user?.id ?? token.sub;
      if (session.user && userId) {
        (session.user as typeof session.user & { id?: string }).id = userId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
