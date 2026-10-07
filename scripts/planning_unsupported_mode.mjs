const entrypoint = typeof process.argv[2] === "string" ? process.argv[2].trim() : "unknown";
process.stderr.write(
  `[planning-runtime] failed code=DEPLOYMENT_MODE_UNSUPPORTED entrypoint=${entrypoint || "unknown"}; use pnpm start or pnpm start:local\n`,
);
process.exit(2);
