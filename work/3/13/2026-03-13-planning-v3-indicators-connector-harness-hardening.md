# 2026-03-13 planning-v3 indicators connector harness hardening

## 변경 파일
- 추가 코드 수정 없음
- audit/closeout 대상 dirty subset
  - `planning/v3/indicators/connectors/ecos.ts`
  - `planning/v3/indicators/connectors/ecos.test.ts`
  - `planning/v3/indicators/connectors/fixture.ts`
  - `planning/v3/indicators/connectors/fred.test.ts`
  - `planning/v3/indicators/connectors/kosis.ts`
  - `planning/v3/indicators/connectors/kosis.test.ts`
- `work/3/13/2026-03-13-planning-v3-indicators-connector-harness-hardening.md`

## 사용 skill
- `planning-gate-selector`: connector harness 범위에 맞는 최소 검증 세트를 고정하는 데 사용
- `work-log-closeout`: 실제 실행한 검증과 이번 배치 closeout을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest `news-indicators residue rerun batch plan`이 다음 실제 구현 1순위로 `indicators connector harness hardening`을 추천했다.
- 현재 dirty 중 이 6파일이 가장 작은 internal-only subset이고, `news/settings/specOverrides/store/runtime`를 다시 열지 않고도 원인 분리가 가능하다.
- 이번 라운드는 connector runtime semantics 확대가 아니라 harness/fixture/test contract만 닫는 것이 목적이다.

## 핵심 변경
- ECOS/FRED/KOSIS 테스트는 모두 `NODE_ENV: "test"`를 포함한 env fixture를 전제로 같은 harness 계약을 공유하는 상태로 재확인했다.
- `planning/v3/indicators/connectors/ecos.ts`, `planning/v3/indicators/connectors/kosis.ts`, `planning/v3/indicators/connectors/fixture.ts`의 `void options` / `void _options`는 shared `FetchSeriesOptions` 시그니처를 유지하면서 unused-arg lint만 잠그는 변화로 확인됐다.
- connector별 deterministic output, missing-key error surface, 429 retry/backoff 계약은 targeted test에서 그대로 PASS했다.
- 조건부로 `planning/v3/indicators/connectors/fred.ts`를 읽어 harness 사용 패턴만 비교했고, 추가 파일 수정은 하지 않았다.

## 검증
- 기준선/범위 확인
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-rerun-batch-plan.md`
  - `git status --short -- planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `git diff -- planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `sed -n '1,260p' planning/v3/indicators/connectors/ecos.ts`
  - `sed -n '1,260p' planning/v3/indicators/connectors/fixture.ts`
  - `sed -n '1,260p' planning/v3/indicators/connectors/kosis.ts`
  - `sed -n '1,240p' planning/v3/indicators/connectors/ecos.test.ts`
  - `sed -n '1,220p' planning/v3/indicators/connectors/fred.test.ts`
  - `sed -n '1,240p' planning/v3/indicators/connectors/kosis.test.ts`
  - `sed -n '1,220p' planning/v3/indicators/connectors/fred.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `pnpm exec eslint planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `git diff --check -- planning/v3/indicators/connectors/ecos.ts planning/v3/indicators/connectors/ecos.test.ts planning/v3/indicators/connectors/fixture.ts planning/v3/indicators/connectors/fred.test.ts planning/v3/indicators/connectors/kosis.ts planning/v3/indicators/connectors/kosis.test.ts`
  - `git diff --no-index --check -- /dev/null work/3/13/2026-03-13-planning-v3-indicators-connector-harness-hardening.md`
- 미실행 검증
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm planning:v2:complete`

## 남은 리스크
- 이번 라운드는 connector harness만 닫았으므로 `indicators specOverrides/store`와 `news read/write` residue는 그대로 남아 있다.
- `NODE_ENV: "test"`를 전제로 한 harness 계약은 명확해졌지만, 이후 connector가 env 분기에 더 의존하게 되면 인접 테스트를 다시 맞춰야 할 수 있다.
- build/release 게이트는 범위 밖이라 실행하지 않았다.

## 이번 라운드 완료 항목
- `indicators connector harness hardening` 배치를 6파일 범위로 잠갔다.
- 추가 코드 수정 없이 current dirty subset이 connector harness/test contract 정렬 수준임을 확인했다.
- targeted `vitest`와 `eslint` 기준으로 connector 계약이 PASS하는 것을 확인했다.

## 다음 라운드 우선순위
1. `indicators specs import/root contract`
2. `news read-only surface`
3. `news write/settings surface`
