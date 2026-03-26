# 2026-03-26 v3 ops-readiness operator-safety follow-up audit

## 변경 파일
- `docs/runbook.md`
- `work/3/26/2026-03-26-v3-ops-readiness-operator-safety-follow-up-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only + disposable sandbox audit 라운드에서 `git diff --check`만 최종 검증으로 고르고, 미실행 검증 목록을 일관되게 남기기 위해 사용.
- `work-log-closeout`: 실제 실행한 재현 명령, warning inventory, archive placement 규칙, `none for now` 유지 사유를 `/work` 표준 형식으로 남기기 위해 사용.

## 변경 이유
- [변경 전 메모] 수정 대상 파일: 우선 없음으로 시작했고, operator runbook note가 필요하다고 판단해 `docs/runbook.md`와 이번 `/work` note만 최소 수정했다.
- [변경 전 메모] 변경 이유: Stage 1~4는 closeout 상태지만 `v3:restore` warning 124건의 성격과 `restore --apply` archive placement semantics는 operator safety residual risk로 남아 있었다.
- [변경 전 메모] 실행할 검증 명령: disposable sandbox에서 `pnpm v3:restore` preview/apply와 `node --import tsx --input-type=module -e ...` warning inventory 집계만 실행하고, docs-only round라 마지막에 `git diff --check -- <changed files>`만 실행한다.
- broad v3 promotion, route 정책, UI, representative funnel은 reopen하지 않고 Stream C residual risk 2건만 좁게 정리한다.

## 핵심 변경
- `/tmp/finance-v3-ops-audit` disposable sandbox에서 baseline archive를 다시 preview해 `errors=0 warnings=124`를 재현했고, warning 124건이 모두 `UNKNOWN_ALLOWED_PATH` warning-only inventory notice라는 점을 확인했다.
- warning inventory 분류표를 아래처럼 고정했다.

| 분류 | 건수 | 성격 | 예시 |
| --- | ---: | --- | --- |
| `news.sqlite.corrupt` | 105 | `news` 허용 경로 안의 historical sidecar snapshot | `.data/news/news.sqlite.corrupt.20260309085939` |
| `news.sqlite` | 1 | live SQLite sidecar | `.data/news/news.sqlite` |
| `news json sidecar` | 12 | cache/digest/index/settings/weekly-plan 같은 derived inventory | `.data/news/cache/today.latest.json`, `.data/news/index.json`, `.data/news/settings.json` |
| `news markdown sidecar` | 3 | digest/brief/scenario markdown 산출물 | `.data/news/digest_day.latest.md` |
| `alerts / indicators sidecar` | 3 | alert state/override, indicator spec override | `.data/alerts/event-state.json`, `.data/indicators/specOverrides.json` |

- `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207-replay.zip --apply` 재현으로 archive가 current `.data/exports` 안에 있으면 `renameSync(.data -> .data.bak-*)`와 함께 backup 쪽으로 이동하고, 새 `.data`에는 `exports/`가 자동 재생성되지 않는다는 점을 다시 확인했다.
- safest archive placement rule은 `current .data 밖 절대 경로`다. 예: `pnpm v3:export -- --out=/tmp/v3-data-backup-YYYYMMDDHHMMSS.zip` 후 `pnpm v3:restore -- --in=/tmp/v3-data-backup-YYYYMMDDHHMMSS.zip --apply`
- `docs/runbook.md`에 `v3 restore 경고 / archive placement` 섹션을 추가해 warning-only inventory 해석과 safest archive placement rule을 운영 문구로 남겼다.
- current `none for now` 유지 사유는 그대로다. 이번 follow-up은 product-flow reopen이 아니라 operator safety residual risk 정리만으로 닫히고, Stage 1~4 parked baseline을 다시 열 새 제품 배치 근거는 생기지 않았다.
- trigger-specific reopen 조건도 좁게 고정했다. apply 뒤에도 archive를 in-tree same path에 유지해야 하거나, `UNKNOWN_ALLOWED_PATH` inventory를 실제 schema/whitelist contract 변경으로 줄여야 할 요구가 생길 때만 Stream C를 다시 연다.

## 검증
- `pnpm v3:restore -- --in=.data.bak-20260326124215/exports/v3-data-backup-20260326124207.zip`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `entries=787`, `errors=0`, `warnings=124`
- `node --import tsx --input-type=module -e "import restoreModule from './planning/v3/ops/restore.ts'; const { runV3Restore } = restoreModule; const summary = await runV3Restore({ cwd: process.cwd(), archivePath: '.data.bak-20260326124215/exports/v3-data-backup-20260326124207.zip' }); const groups = new Map(); for (const issue of summary.issues) { const p = issue.path; const group = p.startsWith('.data/news/') ? (p.startsWith('.data/news/cache/') ? 'news.cache' : p.startsWith('.data/news/news.sqlite.corrupt.') ? 'news.sqlite.corrupt' : p.endsWith('.md') ? 'news.markdown' : p.endsWith('.sqlite') ? 'news.sqlite' : p.includes('digest') ? 'news.digest' : p === '.data/news/index.json' ? 'news.index' : 'news.other') : p.startsWith('.data/alerts/') ? 'alerts.sidecar' : p.startsWith('.data/indicators/') ? 'indicators.sidecar' : p.startsWith('.data/planning_v3_drafts/') ? 'drafts.structure_only' : p.startsWith('.data/exposure/') ? 'exposure' : p.startsWith('.data/journal/') ? 'journal' : 'other'; groups.set(group, (groups.get(group) ?? 0) + 1); } console.log(JSON.stringify({ totals: summary.totals, groupCounts: Object.fromEntries([...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) }, null, 2));"`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `groupCounts={"alerts.sidecar":2,"indicators.sidecar":1,"news.cache":4,"news.digest":2,"news.index":1,"news.markdown":3,"news.other":5,"news.sqlite":1,"news.sqlite.corrupt":105}`
- `cp .data.bak-20260326124215/exports/v3-data-backup-20260326124207.zip .data/exports/v3-data-backup-20260326124207-replay.zip`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
- `find .data/exports -maxdepth 1 -type f | sort`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: apply 전 `.data/exports/v3-data-backup-20260326124207-replay.zip`, `.data/exports/v3-support-bundle-20260326124216.zip` 확인
- `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207-replay.zip --apply`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `backup=/tmp/finance-v3-ops-audit/.data.bak-20260326130639`, `restoredFiles=787`, `errors=0`, `warnings=124`, `doctor ok=true`
- `find .data/exports -maxdepth 1 -type f | sort`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: `find: '.data/exports': No such file or directory`
  - 비고: apply 뒤 new `.data`에 `exports/`가 자동 재생성되지 않음을 확인
- `find .data.bak-20260326130639/exports -maxdepth 1 -type f | sort`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `.data.bak-20260326130639/exports/v3-data-backup-20260326124207-replay.zip`, `.data.bak-20260326130639/exports/v3-support-bundle-20260326124216.zip`
- `git diff --check -- docs/runbook.md work/3/26/2026-03-26-v3-ops-readiness-operator-safety-follow-up-audit.md`
  - 결과: PASS
- `[미실행] pnpm v3:doctor`
  - 이유: 이번 라운드는 restore residual risk 2건만 재현했고, apply 결과가 이미 post-restore `doctor ok=true`를 함께 출력했다.
- `[미실행] pnpm v3:export`
  - 이유: baseline archive를 재사용해 warning inventory와 archive placement semantics만 확인했다.
- `[미실행] pnpm v3:support-bundle`
  - 이유: support bundle payload나 whitelist 범위는 이번 follow-up 범위가 아니다.
- `[미실행] pnpm v3:migrate`
  - 이유: migration semantics는 이번 residual risk와 무관하다.
- `[미실행] pnpm v3:refresh-all`
  - 이유: data refresh는 operator safety follow-up 범위를 벗어난다.
- `[미실행] pnpm v3:trim`
  - 이유: sidecar/inventory trimming 구현은 이번 라운드에서 열지 않았다.
- `[미실행] pnpm build`
  - 이유: route/page/runtime 코드는 바꾸지 않았다.
- `[미실행] pnpm lint`
  - 이유: TS/TSX/runtime 코드를 바꾸지 않았다.
- `[미실행] pnpm test`
  - 이유: 이번 라운드는 docs + disposable sandbox audit만 수행했다.
- `[미실행] pnpm e2e:rc`
  - 이유: product flow, selector, route transition을 바꾸지 않았다.
- `[미실행] pnpm planning:current-screens:guard`
  - 이유: `docs/current-screens.md`나 route inventory는 건드리지 않았다.
- `[미실행] pnpm planning:ssot:check`
  - 이유: route SSOT/catalog guard 영향이 없다.

## 남은 리스크
- warning 124건은 현재 baseline archive와 current validator 기준으로는 restore blocker가 아니라 inventory notice다. 다만 future sidecar file set이 늘어나면 warning count 자체는 변할 수 있다.
- archive를 apply 뒤에도 current `.data` 아래 동일 경로로 유지해야 하는 운영 요구가 생기면, 현재 runbook rule만으로는 부족하고 `restore.ts`의 backup/exports semantics를 다시 열어야 한다. [검증 필요]
- live repo root `.data`에는 이번 라운드에서 어떤 restore/apply도 수행하지 않았다. 실제 운영 데이터 apply는 current `.data` 밖 archive placement를 지키는 별도 operator 절차에서 더 보수적으로 다뤄야 한다.
