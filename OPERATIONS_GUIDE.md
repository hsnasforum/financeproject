# OPERATIONS GUIDE (Dev/Maint)

## 1) Scope and operating model
This guide is for maintaining `planning/v3` in local-first mode.

Principles:
- Work in small deterministic tasks.
- Keep all runtime data in `.data/**`.
- Treat write paths as local-only and guarded.

## 2) Speed mode workflow
Use this loop for each task.

1. Prepare scope
```bash
git status --short
```
- Confirm the task scope before edits.
- Keep changes minimal and task-focused.

2. Implement one task
- 1 task = 1 commit.
- Prefer deterministic logic and fixture-based tests.

3. Verify
```bash
pnpm test
```
- If routes/UI/build outputs changed, also run:
```bash
pnpm build
```

4. Commit
```bash
git add <task files>
git commit -m "V3-XXX: <task summary>"
```

5. Optional runtime refresh check
```bash
pnpm news:refresh
pnpm indicators:refresh
```

## 3) Verification cadence
### Per task (mandatory)
- `pnpm test`
- `pnpm build` when touching routes/UI/build behavior

### Daily/regular maintenance
- Data refresh:
```bash
pnpm daily:refresh
```
or explicit refresh:
```bash
pnpm news:refresh
pnpm indicators:refresh
```

- Data integrity check:
```bash
pnpm v3:doctor
```

### Before release or handoff
```bash
pnpm test
pnpm build
pnpm v3:doctor
```

## 4) Do-not list (hard rules)
Do not:
- Add telemetry or external tracking.
- Expose keys/tokens in client bundle or responses.
- Persist raw full article text / raw CSV payload / raw external API responses.
- Generate recommendation-style certainty language (e.g., imperative or guaranteed outcome wording).

Also avoid:
- Silent background deletion/migration.
- Unscoped edits outside target task area.

## 5) Ops CLI usage
## 5.1 Doctor (read-only integrity check)
```bash
pnpm v3:doctor
```
- Validates local `.data` files against schemas.
- Reports counts, warnings, and errors.

## 5.2 Trim (manual retention)
Preview only:
```bash
pnpm v3:trim
```
Apply deletion:
```bash
pnpm v3:trim -- --apply
```
Optional retention days:
```bash
pnpm v3:trim -- --days=45
```

## 5.3 Export (backup archive)
Default archive path:
```bash
pnpm v3:export
```
Custom archive path:
```bash
pnpm v3:export -- --out=.data/exports/v3-backup.zip
```

## 5.4 Restore (dry-run first)
Dry-run validation:
```bash
pnpm v3:restore -- --in=.data/exports/v3-backup.zip
```
Apply restore:
```bash
pnpm v3:restore -- --in=.data/exports/v3-backup.zip --apply
```
- On apply, current `.data` is backed up to `.data.bak-<timestamp>`.

## 5.5 Migrate (manual only)
Preview migration:
```bash
pnpm v3:migrate
```
Apply migration:
```bash
pnpm v3:migrate -- --apply
```
- No silent auto-migration.
- Backup is created before apply.

## 6) Incident quick path
1. Stop making writes.
2. Run:
```bash
pnpm v3:doctor
```
3. If corruption is suspected, validate restore archive in dry-run:
```bash
pnpm v3:restore -- --in=<archive.zip>
```
4. Apply restore only after dry-run is clean:
```bash
pnpm v3:restore -- --in=<archive.zip> --apply
```
5. Re-check integrity:
```bash
pnpm v3:doctor
```

---
This document covers currently implemented operations only.
