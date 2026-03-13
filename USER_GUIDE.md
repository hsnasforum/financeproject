# USER GUIDE (5-minute start)

## 1) What this app does
This app is a local-first finance workspace.

Main use in `planning/v3`:
- News digest/trends/scenarios from RSS-based pipeline
- Indicator refresh/storage and scenario linkage
- Exposure profile input (manual, explicit save)
- Journal entries for decision notes
- Local backup/restore/doctor/trim/migrate tools for `.data/**`

Notes:
- Data is stored locally under `.data/**`.
- Some write APIs are local-only and CSRF-protected.

## 2) 5-minute start
1. Install and run:
```bash
pnpm install
pnpm dev
```
2. Open local app:
- `http://localhost:3100/planning/v3/start`
3. Initialize core data:
```bash
pnpm news:refresh
pnpm indicators:refresh
```
4. Open key pages:
- News today: `http://localhost:3100/planning/v3/news`
- News trends: `http://localhost:3100/planning/v3/news/trends`
- Exposure profile: `http://localhost:3100/planning/v3/exposure`
- Journal: `http://localhost:3100/planning/v3/journal`

## 3) Pages overview (planning v3)
- `/planning/v3/start`
  - First-run checklist (read-only status)
  - Verifies cache/profile/journal presence
- `/planning/v3/news`
  - Today digest + scenarios
  - Manual refresh entry point
- `/planning/v3/news/trends`
  - Topic trends table view
- `/planning/v3/news/explore`
  - Search/filter view for recent items
- `/planning/v3/news/alerts`
  - Local alert inbox
- `/planning/v3/news/settings`
  - News source/topic override settings (explicit save)
- `/planning/v3/exposure`
  - Personal exposure profile (explicit save)
- `/planning/v3/journal`
  - Journal CRUD for observations/assumptions/options

## 4) Backup and restore
### Backup export
Create a zip archive of v3 local data:
```bash
pnpm v3:export
```
Optional output path:
```bash
pnpm v3:export -- --out=.data/exports/my-v3-backup.zip
```

### Restore (dry-run first)
Preview/validate archive structure and schemas:
```bash
pnpm v3:restore -- --in=.data/exports/v3-data-backup-YYYYMMDDHHMMSS.zip
```
Apply restore (creates backup of current `.data` first):
```bash
pnpm v3:restore -- --in=.data/exports/v3-data-backup-YYYYMMDDHHMMSS.zip --apply
```

### Health check and maintenance
```bash
pnpm v3:doctor
pnpm v3:trim            # preview
pnpm v3:trim -- --apply # apply retention trim
pnpm v3:migrate         # preview
pnpm v3:migrate -- --apply
```

## 5) Troubleshooting
### A) `403` on planning v3 APIs
Common cause:
- Accessing from non-local host, or missing same-origin/CSRF requirements on write routes.

Check:
- Use `http://localhost:3100` or `http://127.0.0.1:3100`.
- WSL에서 dev 서버가 `Bind: host=::`로 시작되면 `http://[::1]:3100`도 같은 로컬 경로입니다.
- Windows 브라우저에서 localhost forwarding이 막히면 터미널의 `Open (LAN)` URL을 사용합니다.
- Trigger write actions from app UI (not cross-origin clients).

### B) News page shows no data
Run refresh first:
```bash
pnpm news:refresh
```
Then reload:
- `/planning/v3/start`
- `/planning/v3/news`

### C) Indicator-based fields show `Unknown`
Common cause:
- Indicator series not refreshed yet, or insufficient history.

Run:
```bash
pnpm indicators:refresh
```

### D) Refresh/CLI exits with error
Run doctor to identify invalid local files:
```bash
pnpm v3:doctor
```
If needed, restore from backup archive (dry-run first).

### E) Build issues before deploy
```bash
pnpm test
pnpm build
```

---
Scope of this guide is current implemented behavior only.
