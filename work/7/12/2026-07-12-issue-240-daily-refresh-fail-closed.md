# 2026-07-12 Issue #240 daily refresh fail-closed

## 변경 파일

- `.github/workflows/daily-refresh.yml`
- `docs/daily-refresh.md`
- `scripts/daily_refresh.mjs`
- `scripts/daily_refresh_contract.mjs`
- `scripts/daily_refresh_ci.mjs`
- `tests/daily-refresh-ops-contract.test.ts`
- `tests/daily-refresh-ci-contract.test.ts`
- `tests/daily-refresh-workflow-contract.test.ts`
- `work/7/12/2026-07-12-issue-240-daily-refresh-fail-closed.md`

## 사용 skill

- `finance-skill-routing`: Issue #240에 필요한 ops/data-source 검증 skill만 선택
- `dart-data-source-hardening`: DART strict 전달, env 누락, freshness와 부분 실패 계약을 점검
- `planning-gate-selector`: ops/release workflow 변경에 맞춰 focused test, lint, typecheck, build, 전체 test와 `verify`를 선택
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 잔여 운영 위험과 다음 작업을 종료 기록으로 정리

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/240
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 기존 local best-effort 실행은 required step 실패를 `summary.ok=false`로 기록하면서 exit 0을 유지했고, workflow는 이 기본 실행과 넓은 PR 경로에 의존했습니다.
- 실패 결과와 부분 산출물이 자동 PR로 이어지지 않도록 CI용 strict 종료 계약, machine-readable evidence, 승인 경로 allowlist를 하나의 검증 흐름으로 고정할 필요가 있었습니다.
- 각 data source 구현과 실제 사용자 데이터는 변경하거나 실행하지 않았습니다.

## 핵심 변경

- local 기본 모드는 best-effort를 유지하되 required failure를 `summary.ok=false`로 노출하고, strict 모드는 모든 차단 실패를 exit 1로 반환합니다.
- strict 실행은 news, indicators, DART, freshness doctor에 `--strict`를 전달하며 result schema version, mode, 9개 step 순서와 status를 검증합니다.
- CI 사전검사는 필수 Secret 그룹과 HTTPS 환율 URL을 값 노출 없이 확인하고, evidence 단계는 strict success, canonical freshness 8행, 생성 시각 관계와 SHA-256을 검증합니다.
- 자동 PR은 승인된 tracked 산출물 13개만 허용하고 leaf/ancestor symlink, realpath 이탈, 승인 밖 tracked/untracked 변경을 차단합니다.
- workflow는 기본 브랜치와 저장소 단위 concurrency를 사용하며 preflight, refresh, evidence, artifact upload가 모두 성공한 경우에만 full-SHA로 고정한 PR action을 실행합니다.
- 실패 run의 result/log/evidence는 artifact로 남기되 PR body와 Actions Summary에는 stdout/stderr tail을 노출하지 않습니다.

## 검증

- `node --check scripts/daily_refresh.mjs`: PASS
- `node --check scripts/daily_refresh_contract.mjs`: PASS
- `node --check scripts/daily_refresh_ci.mjs`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/daily-refresh-ops-contract.test.ts tests/daily-refresh-ci-contract.test.ts tests/daily-refresh-workflow-contract.test.ts --reporter=dot`: PASS, 3 files / 19 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm typecheck`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- raw build 직후 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test -- --reporter=dot`: FAIL, 805 files / 2,724 tests PASS와 `tests/desktop-artifact-provenance.test.ts` 2 tests FAIL. `.next/standalone`의 pnpm symlink 32개로 기존 Issue #223을 재현했습니다.
- source-only audit alias 2개를 제외하고 ignored standalone 생성물을 dereference한 뒤 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts --reporter=dot`: PASS, 1 file / 6 tests
- 같은 materialized standalone 상태에서 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test -- --reporter=dot`: PASS, 806 files / 2,726 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS, dump/schema/freshness/DART/security/lint/typecheck/806 files 및 2,726 tests
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 독립 read-only reviewer: P0/P1 없음. strict exit, env preflight, result/freshness schema, allowlist/symlink, PR 조건과 output sanitization을 확인했습니다.

## 남은 리스크

- [미확인] 저장소에 필수 Secret 그룹이 실제 등록되어 있는지와 외부 source가 첫 scheduled strict run에서 모두 성공하는지는 PR 게시 후 Actions에서 확인해야 합니다.
- local `pnpm daily:refresh`는 운영자 편의를 위해 best-effort exit 0을 유지합니다. 자동화는 반드시 `pnpm daily:refresh:strict`와 evidence gate를 함께 사용해야 합니다.
- raw Next standalone에는 pnpm 내부 symlink 32개가 남아 strict desktop artifact test가 fail-closed합니다. 이번 검증은 ignored 생성물만 materialize했으며 소스 수정은 기존 Issue #223 범위로 남겼습니다.
- public API와 앱 응답 shape, DB schema/query, cache/revalidation, migration에는 직접 변경이 없습니다. stored result JSON에는 additive `schemaVersion`과 `mode`가 생기고 자동 PR 대상 freshness 문서의 검증 책임만 강화됩니다.
- 자동 PR allowlist 밖 파일을 source script가 변경하면 전체 run이 차단됩니다. 경로가 실제 canonical 산출물로 추가될 때만 문서, workflow, contract 상수를 함께 갱신해야 합니다.
- 롤백 시 PR 성공 조건이나 required failure를 완화하지 않고, 잘못 분류된 optional/required 정책, env 그룹 또는 승인 경로만 좁게 조정합니다.

## 다음 라운드 우선순위

1. Draft PR을 게시하고 GitHub Actions의 실제 workflow parse, Secret preflight와 CI 상태를 확인합니다.
2. Issue #239 뉴스 절반은 scheduled user namespace와 `news.sqlite` 대 per-user reader ownership 결정 후 진행합니다.
3. Issue #223과 #241에서 raw standalone symlink materialization과 release gate 정책을 확정합니다.
