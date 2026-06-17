import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

function enabled(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function configured(value: string | undefined): string {
  return (value ?? "").trim();
}

export function buildOAuthProviders(env: NodeJS.ProcessEnv = process.env): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];
  const githubId = configured(env.AUTH_GITHUB_ID ?? env.GITHUB_CLIENT_ID);
  const githubSecret = configured(env.AUTH_GITHUB_SECRET ?? env.GITHUB_CLIENT_SECRET);
  if (githubId && githubSecret) {
    providers.push(GitHub({
      clientId: githubId,
      clientSecret: githubSecret,
    }));
  }

  const googleId = configured(env.AUTH_GOOGLE_ID ?? env.GOOGLE_CLIENT_ID);
  const googleSecret = configured(env.AUTH_GOOGLE_SECRET ?? env.GOOGLE_CLIENT_SECRET);
  if (googleId && googleSecret) {
    providers.push(Google({
      clientId: googleId,
      clientSecret: googleSecret,
    }));
  }

  return providers;
}

export function isPrismaAdapterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return enabled(env.AUTH_PRISMA_ADAPTER_ENABLED);
}

export function buildAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { adapter?: NextAuthConfig["adapter"] } = {},
): NextAuthConfig {
  const usePrismaAdapter = isPrismaAdapterEnabled(env);
  const authSecret = configured(env.AUTH_SECRET ?? env.NEXTAUTH_SECRET);
  if (usePrismaAdapter && !options.adapter) {
    throw new Error("AUTH_PRISMA_ADAPTER_ENABLED requires a configured Auth.js Prisma adapter.");
  }

  return {
    ...(usePrismaAdapter ? { adapter: options.adapter } : {}),
    ...(authSecret ? { secret: authSecret } : {}),
    providers: buildOAuthProviders(env),
    session: {
      strategy: usePrismaAdapter ? "database" : "jwt",
    },
    trustHost: enabled(env.AUTH_TRUST_HOST) || env.NODE_ENV !== "production",
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
}
