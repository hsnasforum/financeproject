# 2026-05-30 PublicApisDiagnosticsClient React Compiler 경고 축소

## 변경 파일
- `src/components/PublicApisDiagnosticsClient.tsx`
- `work/5/30/2026-05-30-public-apis-diagnostics-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 구현 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 변경과 `/dev/public-apis` 진단 화면 영향에 맞는 검증 범위를 정했습니다.
- `dart-data-source-hardening`: public/open data 진단 표면의 env 누락, 샘플 실패, 캐시/freshness 안내 영향이 없는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `PublicApisDiagnosticsClient`가 mount 직후 `loadStatus()`를 effect 본문에서 바로 호출하고, `loadStatus`가 첫 `await` 전에 loading/error state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- public APIs 진단 화면의 env 상태, URL wizard, 샘플 호출, 캐시/freshness 안내는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 진단 상태 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약했습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `상태 새로고침`, 샘플 호출 후 상태 재조회, URL wizard, env 스니펫 복사 동작은 변경하지 않았습니다.
- `/dev/public-apis` 경로, `/api/dev/public-apis/status`, `/api/dev/public-apis/sample` API path, env 이름, cache/fetchedAt/expiresAt 표시, 사용자 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/PublicApisDiagnosticsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadStatus()` 초기 effect 호출 지점.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-public-apis-diagnostics-client.json`
  - 1차: 시간 제한으로 결과 미확인.
  - 재실행: PASS. 전체 잔여 경고: 12건 / 9개 파일.
  - 이번 대상 파일 `src/components/PublicApisDiagnosticsClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/url-wizard.test.ts tests/public-apis-sample-molit.test.ts tests/data-source-impact-ping.test.ts`
  - PASS. 3개 파일 / 6개 테스트 통과.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `git diff --check`
  - PASS.
- `pnpm build`
  - PASS. Next.js production build 및 `/dev/public-apis`, `/api/dev/public-apis/status`, `/api/dev/public-apis/sample` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- `/dev/public-apis` 첫 진입 시 진단 상태 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 샘플 호출 성공 여부는 `.env.local`의 public API 키/URL, upstream 응답, 캐시 상태에 의존합니다.
- env 이름, data-source setup, freshness 문구, API 계약을 바꾸지 않아 별도 문서 갱신과 `pnpm e2e:rc:data-sources`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/RecommendHubClient.tsx`입니다.
