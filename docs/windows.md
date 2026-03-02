# Windows Runtime Notes

## Single Instance

- `pnpm start:local` uses a lock file at:
  - `%LOCALAPPDATA%/<AppName>/vault/runtime.lock` (production)
  - `<repo>/.data/planning/runtime.lock` (dev)
- If lock is held by a live process, second launch prints:
  - `ALREADY_RUNNING http://127.0.0.1:<port>`
  - then exits `0`.
- If lock is stale (PID dead), launcher removes it and starts normally.

## Stop / Shutdown

- Use `Ctrl+C` in the terminal where the app runs.
- Launcher forwards shutdown signal to the Next process, waits for exit, then removes lock file.

## Uninstall Policy

- Uninstall removes binaries/launcher only.
- Data directory is preserved by default.
- To wipe data intentionally:
  1. Use `/ops/security` reset flow, or
  2. Manually delete the resolved planning data directory.

