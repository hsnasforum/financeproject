import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import {
  buildAuthConfig,
  buildOAuthProviders,
  isPrismaAdapterEnabled,
} from "./lib/auth/config";
import { prisma } from "./lib/db/prisma";

export { buildAuthConfig, buildOAuthProviders };

const authAdapter = isPrismaAdapterEnabled(process.env) ? PrismaAdapter(prisma) : undefined;

export const authConfig = buildAuthConfig(process.env, { adapter: authAdapter });

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
