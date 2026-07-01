# 2026-06-28 P2-01 runStore read boundary plan

## 변경 파일
- `work/6/28/2026-06-28-p2-01-runstore-read-boundary-plan.md`

## 사용 skill
- `finance-skill-routing`: 이번 planning 라운드에 필요한 최소 skill 조합을 최신 `/work` 기준으로 고르는 데 사용했습니다.
- `planning-gate-selector`: `runStore` 조회 경계 분리와 migration 상태 노출 변경에 맞는 최소 검증 세트를 고르는 데 사용했습니다.
- `work-log-closeout`: 오늘 `/work` 기록 형식과 필수 섹션을 맞추는 데 사용했습니다.

## 변경 이유
- P2-01 목표는 `getRun`, `listRuns`, `getRunBlob` 조회가 파일 hash/mtime을 바꾸지 않도록 읽기 경계를 정리하고, 읽기 중 발생하는 migration 실패를 `/ops/doctor` 같은 운영 상태로 드러내는 것입니다.
- 현재 `runStore` 조회 경로는 startup migration 실행, legacy envelope 정규화, vault 재기록, legacy partition 이동을 읽기 함수 안에서 함께 수행하고 있어 read-only filesystem과 조회 무변성 요구를 동시에 만족하지 못할 가능성이 있습니다.
- public facade인 `src/lib/planning/server/runs/repository.ts`의 함수 시그니처와 호출 경로는 유지한 채 내부 모듈만 분리하는 방향으로 범위를 제한해야 합니다.

## 전달 변경
- 코드 수정은 하지 않았고, 최신 `/work` 및 관련 저장소 문서를 읽어 이번 라운드의 구현 범위와 검증 범위를 정리했습니다.
- 핵심 확인 지점으로 `runStore.ts`의 `ensureStartupMigrations`, `readRunMetaByPath`, `readRunMeta`, `listRuns`, `getRun`, `getRunBlob`를 검토했습니다.
- migration 실패는 현재 조회 호출부에서 catch 후 무시되며 주석상 `/ops/doctor` 노출에 의존하고 있음을 확인했습니다.
- `repository.ts`는 현재 `getRun/listRuns/getRunBlob`를 그대로 재노출하므로 public facade 유지 범위는 작고, 내부 분리 작업은 `runStore`와 주변 저장소 모듈 중심으로 좁힐 수 있습니다.
- `routeService`와 `/dashboard`, `/`, planning v2 run API, report/export/products 후보 API가 이 facade를 소비하는 주요 사용자 경로임을 확인했습니다.

## 검증
- 실행:
  - `Get-ChildItem -Path work -Recurse -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,LastWriteTime`
  - `Get-Content -Path .codex/skills/planning-gate-selector/SKILL.md`
  - `Get-Content -Path .codex/skills/work-log-closeout/SKILL.md`
  - `Get-Content -Path .codex/skills/finance-skill-routing/SKILL.md`
  - `Get-Content -Path multi_agent.md`
  - `Get-Content -Path work/6/28/2026-06-28-p1-09-run-application-service.md`
  - `rg -n "runStore|getRun\\(|listRuns\\(|getRunBlob\\(|engineEnvelopeMigration|vaultStorage|journal" src tests`
  - `Get-Content -Path src/lib/planning/store/runStore.ts`
  - `Get-Content -Path src/lib/planning/server/runs/repository.ts`
  - `rg -n -C 8 "ensureStartupMigrations|readRunMetaByPath|migrateLegacyRunToEngineEnvelope|writeJsonAtomic\\(|upsertRunIndexEntry|appendStorageTransactionStep|beginStorageTransaction|getRunBlob\\(|export async function listRuns|export async function getRun\\(" src/lib/planning/store/runStore.ts`
  - `Get-Content -Path src/lib/planning/store/engineEnvelopeMigration.ts`
  - `Get-Content -Path src/lib/planning/security/vaultStorage.ts`
  - `Get-Content -Path src/lib/planning/storage/journal.ts`
  - `rg -n "read-only|readonly|mtime|hash|migration failure|ops/doctor|runStore/readRunMetaByPath|backfillLegacyRuns|summarizeLegacyRunBackfill|listCurrentUserRuns|getCurrentUserRun|getCurrentUserRunBlob" tests src`
- 미실행:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:compat`

## 남은 리스크
- 실제 구현 전이라 hash/mtime 무변성, read-only filesystem 동작, migration 실패 노출 계약은 아직 테스트로 고정되지 않았습니다.
- `readRunMetaByPath`가 `decodeStoragePayload().rewriteToVault`, canonical/resultDto 보정, engine envelope migration 시 즉시 재기록하는 구조라 읽기/쓰기 분리 과정에서 legacy 호환 계약이 깨질 수 있습니다.
- startup migration과 run-level lazy migration을 어떻게 `/ops/doctor` 상태와 연결할지 설계가 불명확하면 조회 API가 성공하면서 운영 장애만 누락되는 회귀가 생길 수 있습니다.
