# Runtime (Local Production)

## Run

```bash
pnpm build
pnpm start:local
```

`start:local` always binds to `127.0.0.1` and never binds `0.0.0.0`.

Port selection order:

1. `3100`
2. `3101..3199`
3. ephemeral fallback (reserved local port)

Startup prints a machine-readable line:

```text
LISTENING http://127.0.0.1:<port>
```

If another instance is already running, launcher prints:

```text
ALREADY_RUNNING http://127.0.0.1:<port>
```

and exits with code `0`.

When the standalone build is used, the launcher links required runtime assets beside the standalone server before starting:

- `.next/static`
- `public`
- `prisma`

It also restores traced package links needed by Prisma's SQLite adapter and `better-sqlite3` native binding when they are present in the standalone output.

## Data Directory

Planning storage root is resolved by this precedence:

1. `PLANNING_DATA_DIR`
2. dev (`NODE_ENV != production`): `<repo>/.data/planning`
3. production:
   - Windows: `%LOCALAPPDATA%/<AppName>/vault`
   - Others: `~/.local/share/<AppName>/vault`

`<AppName>` defaults to `PlanningV2` and can be changed via `PLANNING_APP_NAME`.

## Graceful Stop

- Stop with `Ctrl+C` on the terminal running `pnpm start:local`.
- Launcher forwards `SIGINT/SIGTERM` to child server.
- `runtime.lock` is removed on shutdown.
