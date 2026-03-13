# Windows Runtime Notes

## Single Instance

- `pnpm start:local` uses a lock file at:
  - `%LOCALAPPDATA%/<AppName>/vault/runtime.lock` (production)
  - `<repo>/.data/planning/runtime.lock` (dev)
- If lock is held by a live process, second launch prints:
  - `ALREADY_RUNNING http://127.0.0.1:<port>`
  - then exits `0`.
- If lock is stale (PID dead), launcher removes it and starts normally.

## WSL / Localhost

- WSL에서는 `pnpm dev`가 기본적으로 `0.0.0.0`에 바인드하고, Windows 브라우저용 `127.0.0.1 -> WSL IPv4` localhost bridge를 함께 엽니다.
- 기본 접속 경로는 `http://localhost:PORT` 입니다.
- Windows 브라우저에서 localhost forwarding이 막힌 환경이면 같은 출력의 `Open (LAN)` URL을 사용합니다.

## Stop / Shutdown

- Use `Ctrl+C` in the terminal where the app runs.
- Launcher forwards shutdown signal to the Next process, waits for exit, then removes lock file.

## Uninstall Policy

- Uninstall removes binaries/launcher only.
- Data directory is preserved by default.
- To wipe data intentionally:
  1. Use `/ops/security` reset flow, or
  2. Manually delete the resolved planning data directory.
