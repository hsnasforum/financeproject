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

Experimental owner-aware encrypted export is available only for disposable fixtures or an explicitly offline copy:
```bash
chmod 700 /secure
chmod 600 /secure/finance-owner-passphrase
pnpm v3:export -- --format=owner --passphrase-file=/secure/finance-owner-passphrase --ack-quiesced --out=/secure/v3-owner-backup.owner.enc.json
```
- The passphrase and output paths must be outside every registered Planning owner.
- The output directory chain must be owned by the current POSIX user or root; a group/other-writable non-sticky directory fails with `OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED`.
- `--ack-quiesced` records an operator assertion; it does not stop application writers or acquire a global lock.
- Runtime-key encrypted stable profile/run payloads are not yet portable and make export fail closed.

## 5.4 Restore validation (preview only)
Dry-run validation:
```bash
pnpm v3:restore -- --in=.data/exports/v3-backup.zip
```
- `--apply` is disabled and exits with `V3_RESTORE_APPLY_DISABLED` until owner-aware staged restore is verified.
- Do not manually rename or copy `.data` or `PLANNING_DATA_DIR` to bypass the guard.

Experimental strict owner archive preview:
```bash
pnpm v3:restore -- --format=owner --passphrase-file=/secure/finance-owner-passphrase --in=/secure/v3-owner-backup.owner.enc.json
```
- This command decrypts and validates the manifest, exact ZIP entry set, checksums, namespace, and limits without writing restored data.
- Linux fixtures are covered. Native Windows owner export/passphrase-file input fails closed with `OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED` until junction/reparse-point, ACL, rename, and open-handle behavior are verified.
- A same-volume staged transaction and durable rollback journal now exist only as an internal `os.tmpdir()` fixture engine. There is no operator command or HTTP API for it, and it must not be invoked against copied or live user data.
- Restore apply remains blocked until owner-specific schema validation, registry-wide doctor coverage, offline single-writer enforcement, and native Windows rename/locking tests are complete.

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
4. Preserve the current data roots and archive separately. Do not attempt restore apply or manual file replacement.
5. Re-check current integrity:
```bash
pnpm v3:doctor
```

---
This document covers currently implemented operations only.
