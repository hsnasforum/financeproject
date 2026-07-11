# 2026-07-11 Issue #228 restore apply 차단

## 변경 파일

- `src/lib/planning/v3/ops/restore.ts`
- `planning/v3/ops/restore.test.ts`
- `docs/runbook.md`
- `USER_GUIDE.md`
- `OPERATIONS_GUIDE.md`
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `plandoc/v3plan1.md`
- `work/7/11/2026-07-11-issue-228-restore-apply-block.md`

## 사용 skill

- `finance-skill-routing`: Finance Project 작업에 필요한 최소 skill 집합을 선정했습니다.
- `planning-gate-selector`: restore 운영 코드·문서 변경에 맞는 focused/full 검증 세트를 선정했습니다.
- `work-log-closeout`: 변경·검증·잔여 위험을 이 문서 형식으로 정리했습니다.
- `github:github`: 기존 Issue·PR 중복 조사와 Issue #228~#249 등록에 사용했습니다.
- `github:yeet`: 게시 순서를 확인했습니다. 로컬에 `gh`가 없어 GitHub connector와 로컬 Git/SSH로 대체합니다.

## 변경 이유

- P0 [Issue #228](https://github.com/hsnasforum/financeproject/issues/228)의 현재 `main` 기준 근거를 재확인했습니다.
- 기존 restore apply는 소유자 경계와 staged validation 없이 canonical `.data/planning-v3`를 디렉터리 단위로 교체할 수 있어, 실제 사용자 데이터에 실행하면 데이터 손실·교차 소유권 복원 위험이 있습니다.
- owner-aware staged restore가 [Issue #229](https://github.com/hsnasforum/financeproject/issues/229)에서 별도로 완성되기 전까지 파괴적 apply 진입점을 fail-closed로 차단합니다.

## 핵심 변경

- `runV3Restore({ apply: true })`가 archive 접근이나 데이터 경로 계산보다 먼저 `V3_RESTORE_APPLY_DISABLED` 오류로 중단되도록 했습니다.
- CLI도 동일한 안정 코드와 비정상 종료 상태를 반환하고, preview는 기존 dry-run inventory 기능을 유지합니다.
- 임시 fixture, canonical·외부 데이터 루트, SHA-256 checksum을 사용해 함수/CLI 차단 전후 데이터가 동일하고 backup 디렉터리가 생기지 않음을 검증했습니다.
- 실제 사용자 데이터와 실제 restore apply는 실행하지 않았습니다.
- 운영·사용자·계획 문서의 현재 절차를 preview-only로 맞추고 수동 디렉터리 교체 우회도 금지했습니다.

## 계약 영향

| 항목 | 영향 |
| --- | --- |
| public API | 없음. HTTP route와 공개 TypeScript API shape는 변경하지 않았습니다. |
| 응답 shape | 없음. CLI apply 실패에 안정 코드 `V3_RESTORE_APPLY_DISABLED`가 추가됐습니다. |
| stored data | apply 경로를 mutation 전에 중단하므로 저장 데이터 변경이 없습니다. |
| DB query | 없음. Prisma/SQLite/PostgreSQL query를 변경하지 않습니다. |
| cache/revalidation | 없음. Next.js cache/revalidation 경로를 변경하지 않습니다. |
| migration | 없음. schema/data migration을 추가하거나 실행하지 않습니다. |

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm install --frozen-lockfile`: PASS. 첫 실행은 postinstall Prisma 단계에서 `DATABASE_URL` 누락으로 실패했고, 문서화된 테스트용 SQLite URL을 명시해 재실행했습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run planning/v3/ops/restore.test.ts tests/planning-v3-canonical-source-contract.test.ts --reporter=dot`: PASS, 2 files / 9 tests.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm lint`: PASS.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS.
- `corepack pnpm sec:scan:routes`: PASS (`devRoutes=37`, `opsRoutes=38`, `prodHidden=7`, `allowlist=0`, `opsActions=3`).
- `corepack pnpm planning:ssot:check`: PASS, 관련 5 files / 9 tests.
- `corepack pnpm planning:current-screens:guard`: PASS, 관련 5 files / 9 tests.
- `corepack pnpm browser-storage:check`: PASS (`files=36`).
- `corepack pnpm verify`: PASS, 804 files / 2,712 tests. DART rules quality는 `tmp/dart/rules_eval.json`이 없어 기존 계약대로 SKIP됐습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 804 files / 2,712 tests.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, Next.js production build 및 250개 페이지 생성 완료. 첫 시도는 300초 실행 제한으로 종료됐고 동일 명령을 더 긴 제한으로 재실행해 통과했습니다.
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped. production 전용 dev/debug 비노출 검사는 dev web server 조건에서 skip됐습니다.
- `git diff --check`: PASS.

## 남은 리스크

- 파괴적 기존 apply 구현은 호출 불가능한 상태로 남아 있습니다. Issue #229의 staged validation, owner-aware manifest, checksum, injected-failure rollback 검증이 끝나기 전에는 다시 활성화하면 안 됩니다.
- 이번 변경은 실제 사용자 archive나 실제 사용자 데이터에 apply하지 않았으므로 production 데이터셋 호환성은 검증하지 않았습니다.
- DART rules quality는 평가 fixture 부재로 SKIP됐으며 restore 변경과 직접 관련은 없지만 release 판단 시 별도 evidence가 필요합니다.
- GitHub Actions의 원격 결과는 PR 생성 후 별도로 확인해야 합니다.
- 롤백은 이 커밋을 revert하면 가능하지만, Issue #229가 완료되지 않은 상태에서 revert하면 파괴적 apply가 다시 노출되므로 보안·운영 승인 없이는 수행하지 않습니다.

## 다음 라운드

- Issue #228을 단일 초안 PR로 제출하고 원격 검증 상태를 확인합니다.
- Issue #228 병합 후 Issue #229의 owner-aware staged backup/restore 설계를 별도 PR들로 구현합니다.
