type AllowedCommand = {
  command: "pnpm" | "node";
  args: string[];
};

export const ALLOWED_FIX_MAP = {
  PRISMA_DB_PUSH: { command: "pnpm", args: ["prisma", "db", "push"] },
  PRISMA_PUSH: { command: "pnpm", args: ["prisma", "db", "push"] },
  SEED_DEBUG: { command: "pnpm", args: ["seed:debug"] },
  DATA_DOCTOR: { command: "pnpm", args: ["data:doctor"] },
  DART_WATCH: { command: "pnpm", args: ["dart:watch"] },
  DAILY_REFRESH: { command: "pnpm", args: ["daily:refresh"] },
} as const satisfies Record<string, AllowedCommand>;

export type AllowedFixId = keyof typeof ALLOWED_FIX_MAP;

export function isAllowedFixId(value: string): value is AllowedFixId {
  return Object.prototype.hasOwnProperty.call(ALLOWED_FIX_MAP, value);
}

