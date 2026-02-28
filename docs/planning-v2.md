# Planning v2

## 참고 문서
- 사용자 가이드: `docs/planning-v2-user.md`
- 운영 가이드: `docs/planning-v2-ops.md`
- 아키텍처: `docs/planning-v2-architecture.md`
- 릴리즈 체크리스트: `docs/planning-v2-release-checklist.md`
- 변경 이력: `docs/planning-v2-changelog.md`

## 원칙
- 재무설계 v2 엔진(`simulateMonthly`)은 오프라인 순수 함수입니다.
- 최신성은 네트워크 직접 호출이 아니라 로컬 스냅샷(`.data/planning/assumptions.latest.json`)으로 보장합니다.

## 반영 흐름
1. 운영자가 `/ops/assumptions`에서 **Sync now** 실행
2. 서버가 공개 지표를 수집해 스냅샷 저장
3. `/api/planning/v2/simulate` 호출 시 최신 스냅샷을 읽어 가정값에 자동 주입

## 가정 병합 우선순위
1. `DEFAULT_ASSUMPTIONS_V2` (보수적 기본값)
2. `mapSnapshotToAssumptionsV2(snapshot)` 결과
3. 요청 `assumptions` override (최우선)

## 결과 캐시
- 대상 API: `simulate`, `scenarios`, `monte-carlo`, `actions`
- 캐시 키(요약): `profile + horizonMonths + baseAssumptions + overrides + snapshot(asOf/missing) + options(seed/paths/includeProducts/full 등)`을 정렬 직렬화 후 `sha256`으로 생성
- snapshot `fetchedAt`은 캐시 키에서 제외해 과도한 무효화를 방지합니다.
- 응답 `meta.cache`:
  - `hit: true|false`
  - `keyPrefix: "xxxxxxxx"` (전체 키 비노출)
- TTL 정책:
  - `simulate/scenarios`: 24시간
  - `actions`: 24시간 (`includeProducts=true`는 6시간)
  - `monte-carlo`: 7일 (seed/paths 포함으로 재현 가능)

## 캐시 운영(Ops)
- 통합 대시보드: `/ops/planning`
- 페이지: `/ops/planning-cache`
- 확인 항목:
  - 엔트리 수(total/byKind)
  - hit/miss/hitRate 통계
- 액션:
  - `Purge expired`로 만료 캐시 정리
- audit log:
  - `PLANNING_CACHE_PURGE` (정리 건수 기록)

## 스냅샷 없음 처리
- 스냅샷이 없으면 API는 실패하지 않고 기본값으로 계산합니다.
- 이 경우 응답 `meta.snapshot`에 `{ "missing": true }`가 포함됩니다.

## Assumptions Health
- 목적: 투자권유가 아니라 가정 품질 경고를 제공해 계산 왜곡 위험을 낮춥니다.
- 스냅샷 신선도 기준:
  - `fetchedAt` 기준 `45일 초과` → `SNAPSHOT_STALE`(`warn`)
  - `120일 초과` → `SNAPSHOT_VERY_STALE`(`critical`)
  - 스냅샷 누락 → `SNAPSHOT_MISSING`(`warn`)
- 낙관 가정 기준:
  - `investReturnPct >= 10` → `OPTIMISTIC_RETURN`(`warn`)
  - `investReturnPct >= 15` → `OPTIMISTIC_RETURN_HIGH`(`critical`)
- 위험성향 정합성 기준:
  - `riskTolerance=low` + `investReturnPct > 7` → `RISK_ASSUMPTION_MISMATCH`(`warn`)
  - `riskTolerance=low` + `investReturnPct >= 10` → `RISK_ASSUMPTION_MISMATCH`(`critical`)
  - `riskTolerance=high` + `investReturnPct < 4` → `RISK_ASSUMPTION_MISMATCH_LOW`(`info`)
- API 응답(`simulate/scenarios/monte-carlo/actions`)에는 `meta.health`와 `data.healthWarnings`가 포함됩니다.
- `/planning` UI에서는 `critical` 경고가 있을 때 확인 체크(ack) 전까지 실행 버튼(`Run plan`, `Get actions`)이 비활성화됩니다.

## 시나리오/민감도
- 멀티 시나리오 API: `POST /api/planning/v2/scenarios`
- 시나리오는 고정 규칙으로만 생성됩니다.
  - `base`: 최종 가정 그대로 사용
  - `conservative`: 투자수익률 하향, 인플레 상향, 현금수익률 하향
  - `aggressive`: 투자수익률 상향, 인플레 하향
- 모든 % 가정은 `-20 ~ +30` 범위로 clamp합니다.
- 외부 뉴스/트렌드로 자동 조정하지 않습니다.

## 결과 비교(why diff)
- `diffVsBase`는 베이스 대비 차이를 요약합니다.
  - 말기 순자산 변화
  - 최저 현금월/현금저점 변화
  - 목표 달성 수 변화
  - 경고 코드 추가/해소
  - `shortWhy` 드라이버 문장(3~6줄)

## Monte Carlo (확률 레이어)
- API: `POST /api/planning/v2/monte-carlo`
- 목적: 단일 결정론 결과 외에 확률 관점(달성 확률/고갈 확률/퍼센타일)을 제공합니다.
- 핵심 한계:
  - 확률은 모델 기반 추정이며 보장이 아닙니다.
  - 수익률/인플레 분포는 단순화(정규 기반)되어 있습니다.

## 분포/변동성 규칙
- 평균(mean)은 base assumptions를 그대로 사용합니다. (자동 트렌드 예측 금지)
- 투자 변동성(`investVolPct`)은 위험성향 고정 규칙:
  - `low=8`, `mid=12`, `high=16`
- 인플레 변동성(`inflationVolPct`)은 고정 `1.0`
- 월 샘플 clamp:
  - 투자수익률: `-0.95 ~ +2.0`
  - 인플레: `-0.5 ~ +1.0`

## seed / paths 권장
- 기본값: `seed=12345`, `paths=2000`
- API 서버 보호 상한: `paths <= 20000`
- seed를 고정하면 결과가 재현 가능합니다.

## Monte Carlo 예산 가드레일
- 예산 규칙: `paths * horizonMonths <= 8,000,000`
- 초과 시 API는 `BUDGET_EXCEEDED(400)`으로 거부합니다.
- 조정 방법:
  - `paths`를 낮추거나
  - `horizonMonths`를 줄여 계산량을 낮춥니다.

## 성능 주의
- `paths`와 `horizonMonths`가 클수록 실행 시간이 선형 증가합니다.
- 디버그/개발 확인 시 `paths=300~1000`, 운영 확인 시 `paths=2000+`를 권장합니다.

## Action Plan + 후보 매칭
- API: `POST /api/planning/v2/actions`
- 목적: 숫자 결과를 실행 가능한 체크리스트로 변환합니다.
  - 무엇을 할지(Action)
  - 왜 해야 하는지(경고/근거 코드)
  - 어떤 수치를 봐야 하는지(metrics)
  - 주의사항(cautions)
- 중요: 단정 추천이 아니라 후보 비교만 제공합니다.

## finlife 후보 사용
- `includeProducts=true`일 때만 서버에서 내부 finlife API를 조회해 후보를 붙입니다.
- 응답에는 후보 요약(회사/상품/기간/금리범위)만 포함하며, 원문 상세를 통째로 전달하지 않습니다.
- 후보 매칭은 목적별 단순 규칙(기간/금리 우선순위) 기반이며, 최종 선택은 사용자 검토가 필요합니다.

## 프로필/실행 이력 영속화
- 사용자 페이지:
  - `/planning`: 프로필 저장/수정 + run 실행
  - `/planning/runs`: run 목록/상세 + 2개 비교
- 서버 로컬 파일 저장 경로:
  - `.data/planning/profiles/{id}.json`
  - `.data/planning/runs/{id}.json`
- run 저장 원칙:
  - 프로필 본문은 run에 중복 저장하지 않고 `profileId` 참조만 저장
  - outputs는 요약 중심(`simulate/scenarios/monte-carlo/actions`)만 저장
  - profile당 run retention 기본값은 최근 50개 유지

## 로컬 보안/운영 연동
- profile/run API는 local-only 가드가 적용됩니다.
- 생성/수정/삭제 이벤트는 audit log에 기록됩니다.
  - `PLANNING_PROFILE_CREATE/UPDATE/DELETE`
  - `PLANNING_RUN_CREATE/DELETE`
- backup/export-import/restore point 대상에 planning profile/run JSON이 포함됩니다.
- 백업 정책:
  - 필수(A): assumptions latest/history, profiles, runs
  - 선택(B): cache, regression eval report/history (누락되어도 재계산 가능)

## Regression 품질 게이트
- 코퍼스 입력:
  - `tests/planning-v2/regression/corpus/*.json`
- 베이스라인:
  - `tests/planning-v2/regression/baseline/*.json`
- 실행:
  - `pnpm planning:v2:regress`
  - 허용오차: 금액 `max(±1%, ±100,000원)`, 확률 `±0.03`
- 최신 리포트:
  - `.data/planning/eval/latest.json`
  - Ops 통합 뷰: `/ops/planning`
  - Ops 뷰어: `/ops/planning-eval`

## Baseline 갱신 승인
- 자동 갱신은 금지됩니다.
- 갱신은 명시적 confirm 문자열이 일치할 때만 허용됩니다.
  - 형식: `UPDATE_BASELINE planning-v2 YYYYMMDD`
- 명령:
  - `pnpm planning:v2:regress:update -- --confirm=\"UPDATE_BASELINE planning-v2 20260228\"`

## CI 연동
- CI에서 `pnpm planning:v2:regress`를 별도 단계로 실행합니다.
- 회귀 게이트 실패 시 CI 실패로 처리되어 머지를 차단합니다.
