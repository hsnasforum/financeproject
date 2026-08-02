# 2026-08-02 v1.1.0~v1.4.0 문서화 전용 릴리즈 게시 완료

## 변경 파일

- `CHANGELOG.md`
- `README.md`
- `docs/release-notes.md`
- `docs/releases/financeproject-1.0.5.md`
- `docs/releases/financeproject-1.1.0.md`
- `docs/releases/financeproject-1.2.0.md`
- `docs/releases/financeproject-1.3.0.md`
- `docs/releases/financeproject-1.4.0.md`
- `docs/releases/retrospectives/financeproject-1.1.0.md`
- `docs/releases/retrospectives/financeproject-1.2.0.md`
- `docs/releases/retrospectives/financeproject-1.3.0.md`
- `docs/releases/retrospectives/financeproject-1.4.0.md`
- `package.json`
- `work/8/2/2026-08-02-release-v1-series-candidates.md`

## 변경 이유

- `v1.0.5`에 누적 게시된 역사 기능을 신규 기능처럼 중복 게시하지 않으면서 `v1.1.0`부터 `v1.4.0`까지 단계적으로 확인할 수 있는 실제 태그와 GitHub Release를 준비합니다.
- 각 버전은 직전 실제 태그를 base로 삼고, 패키지 버전·릴리즈 스크립트 기본 버전·공식 노트만 순차 변경합니다.
- 과거 역사 구간 끝 SHA에는 소급 태그를 만들지 않으며, desktop artifact는 각 실제 태그 커밋에서 다시 빌드합니다.

## 사용 skill

- `finance-skill-routing`: 릴리즈 작업에 필요한 최소 skill 조합을 선정했습니다.
- `planning-gate-selector`: 버전·릴리즈 문서 변경에 맞는 검증 세트를 선정했습니다.
- `github:yeet`: 브랜치 게시, draft PR, merge commit과 순차 태그 게시 절차를 점검했습니다.
- `github:gh-fix-ci`: 첫 v1.4.0 Release workflow 실패 로그를 확인하고 work note guard 원인을 분리했습니다.
- `work-log-closeout`: 버전별 변경, 검증 결과와 최종 게시 상태를 기록했습니다.

## 릴리즈 결과

| 버전 | 태그 커밋 | 실제 base | 역사 회고 범위 | 성격 |
|---|---|---|---|---|
| `v1.1.0` | `0bccf0817bb82613c22d0bf0f9fac89af94801ec` | `v1.0.5` | `05c3990c..3de12780` 119개 | 신규 기능 없는 문서화 전용 릴리즈 |
| `v1.2.0` | `236ce42dafb12b49e8aadead0193ae5c64170ae8` | `v1.1.0` | `3de12780..e82f57ea` 86개 | 신규 기능 없는 문서화 전용 릴리즈 |
| `v1.3.0` | `5ff45c5da792d5911874d6c98bdb681b1f56c1b7` | `v1.2.0` | `e82f57ea..8c118d58` 83개 | 신규 기능 없는 문서화 전용 릴리즈 |
| `v1.4.0` | `ede8e48dac67ce691cdc82dee81572402543ff5d` | `v1.3.0` | `8c118d58..5e15a1ae` 63개 | 신규 기능 없는 문서화 전용 릴리즈 |

## 이번 라운드 완료 항목

- 네 후보를 하나의 선형 브랜치에 버전별 개별 커밋으로 구성했습니다.
- 각 버전의 공식 노트와 `v1.0.5` 보존용 회고 노트를 분리했습니다.
- `README.md`, `CHANGELOG.md`, `docs/release-notes.md`, `package.json`과 릴리즈 스크립트 기본 버전을 후보별로 일치시켰습니다.
- 제품 코드, API, 데이터 계약, 런타임 로직, 의존성 및 lockfile은 변경하지 않았습니다.
- 각 실제 태그 비교와 역사 SHA 비교를 별도 링크로 제공해 신규 변경과 회고 범위를 구분했습니다.

## 검증

- `v1.1.0`: 변경 후 `DATABASE_URL=file:./prisma/release.db VITEST_MAX_WORKERS=2 corepack pnpm release:verify` PASS, `DATABASE_URL=file:./prisma/release.db corepack pnpm build` PASS.
- `v1.2.0`: 변경 후 `release:verify` PASS, `pnpm build` PASS. 최초 전체 검증의 환경성 timeout 뒤 관련 테스트 3개 40건을 단독 재현해 PASS했고 worker 2개로 전체 검증을 재실행했습니다.
- `v1.3.0`: 변경 전·후 `release:verify` PASS, `pnpm build` PASS.
- `v1.4.0`: 변경 전 `release:prepare -- --bump=minor` PASS(465초), 변경 후 `release:verify` PASS(541.9초), `pnpm build` PASS(243.3초).
- `v1.4.0` 준비 첫 실행에서 `tests/planning-v3-profiles-api.test.ts` 정렬 테스트 1건이 실패했으나 단독 1회와 별도 반복 20회가 모두 PASS했습니다. 릴리즈 문서 변경과 무관한 wall-clock 동률 가능성으로 분리했습니다.
- 각 후보에서 `git diff --check`와 버전 표면 7곳을 확인했고 제품 코드·의존성·lockfile 변경이 없음을 확인했습니다.
- PR #274의 CI·E2E Smoke·build·desktop provenance gate가 PASS했고 merge commit `3969c116aae8a20f7a414adfa98f39b2d13c6545`로 병합했습니다.
- `v1.1.0`~`v1.3.0` Release workflow와 자산 3종·manifest·공식 본문 검증을 완료했습니다.
- 첫 `v1.4.0` Release workflow `30741121754`는 이 문서에 `변경 파일` 섹션이 없어 `multi-agent:guard`에서 중단됐으며 Release와 자산은 생성되지 않았습니다.
- `corepack pnpm multi-agent:guard`: PASS, 최신 work note의 필수 섹션과 tracked 상태를 확인했습니다.
- 보정 PR #275의 CI 2건·E2E Smoke 3건이 PASS했고 merge commit `bf493bd8f13a2668bd4184844cf079f9b30fbc5e`로 병합했습니다.
- 보정된 `v1.4.0` Release workflow `30741951530`이 PASS했고 target SHA `ede8e48d`, 자산 3종, manifest의 tag·packageVersion·sourceSha와 GitHub digest를 확인했습니다.
- GitHub Release `v1.1.0`~`v1.4.0`의 공식 본문에 실제 태그 비교, 역사 SHA 비교와 태그 고정 회고 링크를 반영했습니다.
- `v1.0.5` GitHub Release 본문도 게시 당시 설명을 유지하면서 네 회고 링크를 실제 `v1.1.0`~`v1.4.0` 태그 경로로 갱신했습니다.
- GitHub latest release API와 릴리즈 목록에서 `v1.4.0`이 Latest임을 확인했습니다.

## 남은 리스크

- `updatedAt` 동률일 때 profile store는 ID 내림차순, API는 ID 오름차순을 사용합니다. 이번 릴리즈 범위 밖의 잠재 일관성 문제이며 별도 후속 수정이 필요합니다.
- 첫 `v1.4.0` 실패 run `30741121754`는 Actions 이력에 남아 있으며, 성공 run은 `30741951530`입니다.
- 이번 네 릴리즈는 신규 제품 기능이 아니라 `v1.0.5`에 이미 포함된 역사 범위를 단계적으로 공개한 문서화 전용 릴리즈입니다.

## 다음 라운드 우선순위

- profile 목록의 동일 `updatedAt` 보조 정렬 방향은 별도 작업에서 store와 API 계약을 통일합니다.
- 다음 버전부터는 후보 커밋 전에 최신 `/work` 문서의 `변경 파일`, `사용 skill`, `검증`, `남은 리스크`, `다음 라운드` 섹션을 먼저 확인합니다.
- v1.1.0~v1.4.0 문서화 전용 릴리즈 작업은 이 기록으로 종료합니다.
