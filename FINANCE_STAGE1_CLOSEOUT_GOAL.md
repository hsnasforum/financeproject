# FINANCE Stage 1 종료 보완 목표

## 바로 사용할 `/goal` 실행문

```text
/goal 프로젝트 루트의 `FINANCE_CODEX_GOAL.md`, `work/9/1/2026-09-01-stage1-accuracy-safety.md`, 현재 Git 상태와 아래 독립 정적 검수 결과를 기준으로 Stage 1 종료 보완 작업만 진행해 주세요.

이번 작업의 목적은 Stage 1을 다시 전면 구현하는 것이 아니라, 독립 검수에서 `부분 확인`으로 남은 1-1~1-7과 1-10의 완료 조건을 실제 사용자 경로·저장 경로·CI 재현성까지 닫는 것입니다. 이미 `확인됨`으로 판정된 1-8 주거비 기준과 1-9 추천 가중치는 수정하지 말고 회귀 여부만 확인하세요.

각 항목은 `현재 실행 경로 재확인 → 남은 결함 재현 또는 정적 증거 확보 → 최초 원인 수정 → 가장 좁은 타깃 검증 → diff 재검토` 순서로 처리하세요. Stage 2·3 기능, 대규모 UI 개편, 전면 리팩터링은 구현하지 마세요.

현재 Working Tree의 기존 tracked·untracked 변경을 모두 보존하세요. reset, checkout, restore, stash, clean, commit, push를 하지 마세요. git add도 실행하지 말고, 최종 보고에 Git 포함이 필요한 신규·미추적 파일과 사용자가 나중에 실행할 수 있는 정확한 `git add -- ...` 후보 명령만 제시하세요. 기존 변경과 의도가 충돌하면 덮어쓰지 말고 충돌 파일·현재 동작·필요한 결정과 판정을 보고하세요.
```

---

# 1. 현재 판정과 작업 범위

독립 정적 검수 판정:

- `확인됨`: 1-8 주거비 기준, 1-9 추천 가중치
- `부분 확인`: 1-1, 1-2, 1-3, 1-4, 1-5, 1-6, 1-7, 1-10

이번 작업에서는 다음만 수행합니다.

1. 실제 삭제·복원 다이얼로그 사용자 상호작용 테스트 보강
2. FX 통화 배수 일반화 테스트 보강
3. `targetMonth` 저장·재열기 경로 검증 보강
4. 브라우저 설정 백업의 `localStorage` 읽기 실패 처리 수정
5. 상품 제공기관 발견 경로와 전체 페이지 필터 비용·pagination 수정
6. Gov24 `syncing` polling·visibility·unmount·stale response 검증 보강
7. FX provider의 UTC 날짜 fallback 제거
8. freshness canonical 파일과 신규 미추적 의존 파일의 Git 포함·clean checkout 위험 정리
9. 작업 기록 경로 오기와 `Zone.Identifier` 혼입 위험 정리

다음은 수정하지 않습니다.

- Planning Profile / Run / Report 구조 통합
- DART와 회사 검색 통합
- 혜택/Gov24 전체 엔진 통합
- maintenance 이동
- 홈·대시보드 IA 개편
- Planning v3 재분류
- 대형 client 전면 분리
- Stage 3 UI/UX 개편
- 이미 확인된 1-8·1-9 정책 재설계

---

# 2. Stage C0 — 기준점과 의존 파일 재확인

코드 수정 전에 다음을 수행합니다.

1. 현재 브랜치, HEAD, upstream, staged 여부, tracked 변경 수, untracked 파일 수를 확인합니다.
2. 아래 수정 대상 파일의 현재 diff를 읽고 기존 변경을 보존합니다.
3. tracked 소스가 import하는 untracked 로컬 모듈을 재귀적으로 확인합니다.
4. `config/data-freshness-exceptions.json`이 `pnpm data:doctor`와 CI에서 필수인지 다시 확인합니다.
5. 현재 존재하는 테스트가 helper만 검증하는지 실제 사용자·API 경로를 검증하는지 구분합니다.
6. Stage 2·3 성격의 기존 변경은 귀속을 추측하지 말고 건드리지 않습니다.

반드시 확인할 미추적 후보:

```text
config/data-freshness-exceptions.json
src/lib/format/kstCalendarDate.ts
src/lib/publicApis/providers/exchangeNormalization.ts
src/lib/publicApis/fxDataStatus.ts
src/lib/recommend/weights.ts
src/lib/sources/productFreshness.ts
```

위 목록에 한정하지 말고, 현재 tracked 파일에서 직접 또는 간접 import되는 모든 untracked 모듈을 찾아야 합니다.

Stage C0 보고 형식:

```text
- 브랜치 / HEAD / upstream
- staged 여부
- tracked 변경 수 / untracked 수
- tracked → untracked import 목록
- 이번 보완 대상 파일
- 기존 구현 유지 항목
- 현재 자료만으로 확인 불가한 항목
```

---

# 3. Stage C1 — 삭제·복원 확인 다이얼로그 실제 상호작용 검증

## 대상

- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/components/planning/workspace/panels/modalPanel.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlanningTrashClient.tsx`
- 관련 component/E2E 테스트

## 현재 확인된 내용

- 공통 helper는 빈 `confirmText`를 생성합니다.
- 정확한 확인문구 비교 로직은 구현되어 있습니다.
- helper 단위 테스트는 존재합니다.

## 남은 문제

실제 다이얼로그를 열고 다음 사용자 경로를 검증하는 테스트가 없습니다.

- 최초 진입 시 실행 버튼 비활성
- 오입력 시 비활성
- 정확한 입력 후 활성
- 닫기 후 재열기 시 입력값 초기화
- 대상을 바꿨을 때 이전 확인 문자열이 남지 않음

## 작업 요구사항

- 기존 확인 계약을 다시 설계하지 않습니다.
- 실제 UI 상태와 이벤트를 거치는 component test 또는 E2E를 추가합니다.
- 가능한 경우 공통 테스트 helper로 중복을 줄이되, 실제 각 surface가 helper를 연결하는지는 확인해야 합니다.
- 최소 대표 범위는 다음 세 surface입니다.
  1. 프로필 삭제
  2. 실행 기록 삭제 또는 복원
  3. 휴지통 복원·영구 삭제·비우기 중 실제 공통 상태를 사용하는 경로
- 네트워크 요청은 route interception 또는 mock으로 차단하여 실제 데이터를 파괴하지 않습니다.

## 완료 조건

- 버튼 활성 상태가 실제 DOM에서 검증됨
- 닫기·재열기 초기화가 실제 DOM에서 검증됨
- 오입력으로 파괴 요청이 발생하지 않음
- 정확한 입력에서만 요청이 1회 발생함
- 기존 helper 테스트는 유지

---

# 4. Stage C2 — FX `ABC(N)` 일반화와 KST fallback 완결

## 대상

- `src/lib/publicApis/providers/exchangeNormalization.ts`
- `src/lib/publicApis/providers/exchange.ts`
- `src/lib/publicApis/providers/fx.ts`
- `src/lib/format/kstCalendarDate.ts`
- 관련 provider·route 테스트

## 남은 문제

1. 구현은 일반적인 `ABC(N)` 형식을 처리하지만 테스트가 `JPY(100)` 한 사례에 치우쳐 있습니다.
2. `src/lib/publicApis/providers/fx.ts`의 응답 날짜 fallback에 `new Date().toISOString().slice(0, 10)`이 남아 KST 오전에 전날이 표시될 수 있습니다.

## 작업 요구사항

- 통화 배수 parser 자체를 일반 입력으로 검증합니다.
- `JPY` 전용 분기나 특정 통화 하드코딩을 추가하지 않습니다.
- 단위가 없는 통화, 공백이 포함된 `ABC (N)`, 임의의 유효한 3문자 통화와 배수를 검증합니다.
- FX provider의 날짜 fallback을 기존 `formatKstIsoDate()` 또는 같은 canonical KST helper로 통일합니다.
- live/cache/mock provenance와 API 응답 구조를 유지합니다.

## 필수 테스트

- `USD` → scale 1
- `JPY(100)` → 9.12
- 임의 일반화 사례 예: `IDR(100)` 또는 parser 수준 `ABC(1000)`
- 공백 허용 사례: `ABC (100)`
- UTC 날짜와 KST 날짜가 다른 시각의 FX fallback 날짜
- `/api/public/fx` route 결과까지 배수 적용 유지

## 완료 조건

- 일반화 계약이 특정 JPY fixture에만 의존하지 않음
- FX provider에 UTC `toISOString().slice(0, 10)` 날짜 fallback이 남지 않음
- KST 자정 경계 테스트 통과

---

# 5. Stage C3 — `targetMonth` 저장·재열기 경로 검증

## 대상

- `src/components/planning/workspace/panels/shared.ts`
- `src/components/planning/workspace/panels/profilePanel.tsx`
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/lib/planning/ui/profileFormModel.ts`
- 관련 profile form·workspace 테스트

## 현재 확인된 내용

- UI는 목표까지 남은 기간을 숫자형 개월 수로 표시합니다.
- helper는 서로 다른 현재 시각에서도 같은 값을 왕복합니다.

## 남은 문제

helper만으로는 실제 저장 payload, profile hydration, 재열기 후 입력값 유지가 증명되지 않습니다.

## 작업 요구사항

- 현재 canonical 의미인 상대 개월 수를 유지합니다.
- 절대 날짜 schema로 전환하거나 migration을 새로 도입하지 않습니다.
- 실제 저장·hydrate 경로를 거치는 통합 테스트를 추가합니다.
- 테스트는 현재 시각을 바꾼 뒤에도 같은 저장 프로필이 같은 개월 수로 열리는지 확인해야 합니다.
- 가능하면 API를 mock한 component test로 `입력 → 저장 요청 body → 목록/상세 재조회 → hydrate → 입력값 확인`을 검증합니다.
- 전체 브라우저 E2E가 과도하면 최소한 `toProfileJson → 저장 record → hydrateProfileJsonEditorState → profilePanel input` 경계를 연결한 component integration test를 사용합니다.

## 완료 조건

- 저장 요청 body의 `targetMonth`를 명시적으로 단언
- 저장 record를 재hydrate한 뒤 입력값을 명시적으로 단언
- 시스템 시각 변경 전후에 동일한 저장 데이터가 같은 개월 수로 표시됨
- 기존 profile schema와 백업 호환성 유지

---

# 6. Stage C4 — 브라우저 설정 백업 읽기 실패를 `null`로 저장하지 않기

## 대상

- `src/components/BackupClient.tsx`
- `src/lib/backup/backupBundle.ts`
- `tests/browser-settings-backup.test.ts`
- 관련 UI 테스트

## 현재 문제

`localStorage.getItem()`이 예외를 던지면 현재 코드는 해당 키를 `null`로 변환할 수 있습니다. 이 파일을 복원하면 `null`이 설정 삭제 의미로 해석되어, 읽기 실패가 삭제 지시로 바뀔 수 있습니다.

## 작업 요구사항

- 저장소의 `키 없음(null)`과 `읽기 실패`를 구분합니다.
- 읽기 실패한 키를 backup bundle에 `null`로 넣지 않습니다.
- 가장 안전한 기본 동작은 다음 중 하나입니다.
  1. 실패한 키를 bundle에서 제외하고 `누락/실패 N개`를 명확히 알림
  2. UI 설정 수가 적으므로 한 키라도 실패하면 다운로드를 중단하고 오류 표시
- 어떤 방식을 선택하든 성공 메시지만 표시하면 안 됩니다.
- 파일이 실제 다운로드된 이후 오류로 판정하는 흐름을 피합니다. 가능하면 bundle을 완성·검증한 뒤 다운로드합니다.
- 정상적인 `getItem() === null`은 기존처럼 “현재 저장값 없음”으로 표현할 수 있으나, restore에서 삭제 의미를 갖는 계약과 충돌하지 않는지 확인합니다.
- legacy backup의 명시적 `null` 복원 호환성은 유지합니다.

## 필수 테스트

- 정상 문자열 읽기
- 정상 `null` 읽기
- 한 키 `getItem` 예외
- 여러 키 중 일부 실패
- 실패 키가 생성 bundle에 삭제값으로 포함되지 않음
- 사용자 메시지가 성공·부분 실패·중단을 정확히 구분

## 완료 조건

- 읽기 오류가 복원 시 삭제 지시로 변환될 수 없음
- 실패 수가 숨겨지지 않음
- 기존 restore의 적용·제거·무시·실패 집계 유지

---

# 7. Stage C5 — 상품 기관 발견 경로와 전체 페이지 필터 비용 수정

## 대상

- `src/app/products/catalog/page.tsx`
- `src/lib/products/catalogExplorer.ts`
- `src/app/api/products/unified/route.ts`
- `src/lib/sources/unified.ts`
- `src/lib/sources/unifiedTypes.ts`
- source loader query 경계와 관련 테스트

## 현재 확인된 내용

- 알려진 provider·기간·최소 금리를 직접 전달하면 후속 페이지까지 검색합니다.
- URL, API, query key, cursor 조건은 연결되어 있습니다.
- latest-request coordinator는 이미 존재합니다.

## 남은 문제

1. provider chips가 현재 응답 rows에서만 만들어져 뒤 페이지에만 있는 기관을 사용자가 발견할 수 없습니다.
2. 필터가 있으면 모든 source cursor를 처음부터 끝까지 순차 조회합니다.
3. 다음 페이지 요청도 전체 source를 처음부터 다시 순회할 수 있습니다.
4. 최대 페이지·행·시간 제한이 없고 브라우저 abort가 서버 내부 loader 순회까지 전달되지 않습니다.

## 작업 원칙

- 정확성 문제를 되돌려 첫 페이지만 필터링하지 않습니다.
- 필터마다 무제한 전체 순회를 유지하지 않습니다.
- provider 발견을 현재 결과 page에 의존시키지 않습니다.
- 새 외부 API 호출 경로를 추가하지 않습니다.
- 가능하면 저장된 DB/source index에서 provider facet을 경량 조회합니다.
- 필터를 loader/DB query 단계로 내릴 수 있는지 먼저 확인합니다.

## 권장 구현 순서

1. source loader가 provider·termMonths·minRate를 query 단계에서 처리할 수 있도록 기존 query contract 확장 가능성을 확인합니다.
2. FINLIFE와 KDB 저장소에서 가능한 필터는 DB 조건으로 push-down합니다.
3. provider 선택지는 현재 page rows가 아니라 독립 provider facets 또는 저장된 전체 provider index에서 받습니다.
4. push-down이 불가능한 source만 명시적 상한이 있는 bounded fallback을 사용합니다.
5. fallback에는 최대 pages, 최대 rows, 요청 취소, partial 여부를 포함합니다.
6. cursor가 이미 필터된 결과의 다음 위치를 재사용하고 다음 요청마다 page 1부터 전부 다시 읽지 않도록 합니다.

## 금지

- 무제한 `while (true)` 전체 순회를 그대로 두고 UI만 감추기
- provider 목록을 하드코딩하기
- 빈 결과를 숨기기 위해 가짜 provider를 추가하기
- 별도 중복 상품 API를 새로 만들기

## 필수 테스트

- 뒤 페이지에만 있는 provider가 초기 provider 선택지에 나타남
- 해당 provider 선택 후 결과가 반환됨
- 기간·최소 금리 조건도 뒤 페이지 결과를 찾음
- 다음 cursor 요청이 source page 1부터 전체 재조회하지 않음
- 최대 page/row 경계 또는 query push-down 증거
- 요청 취소 시 추가 loader 조회가 중단됨
- source 하나 실패 시 기존 부분 성공 정책 유지

## 완료 조건

- 사용자가 아직 결과에 노출되지 않은 provider도 발견·선택 가능
- 필터 정확성과 비용 경계가 함께 확보됨
- pagination이 필터 결과와 일관됨
- 성능 개선을 위해 unrelated cache/API를 추가하지 않음

---

# 8. Stage C6 — Gov24 요청 lifecycle 통합 검증

## 대상

- `src/components/Gov24Client.tsx`
- `tests/e2e/gov24-request-lifecycle.spec.ts`
- 필요한 경우 latest-request 단위 테스트

## 현재 확인된 내용

- 첫 검색 1회와 ready 상태 무폴링은 구현·E2E가 존재합니다.

## 남은 검증

- syncing 상태에서 제한 polling
- polling 중 ready 전환 시 종료
- 탭 hidden 시 interval과 진행 요청 취소
- 다시 visible 시 즉시 1회 확인 후 필요한 경우 polling 재개
- unmount 시 search/status 요청 abort
- 이전 status/search 응답이 최신 상태를 덮어쓰지 않음

## 작업 요구사항

- 현재 coordinator와 visibility 처리 구조를 재사용합니다.
- 고정 sleep에 의존하는 불안정한 테스트를 피하고 request count·abort·state 표시를 관찰합니다.
- 테스트에서 10초 interval은 통제된 짧은 값으로 대체할 수 있으나 production 상수는 임의 변경하지 않습니다.
- hidden/visible 이벤트를 실제 document lifecycle과 유사하게 발생시킵니다.

## 완료 조건

- syncing → polling → ready → stop 흐름 검증
- hidden 상태에서 요청 증가 없음
- visible 복귀 시 중복 interval 없음
- unmount 후 요청·state update 없음
- stale 응답이 최신 source/status를 덮어쓰지 않음

---

# 9. Stage C7 — freshness canonical 파일과 clean checkout 재현성

## 대상

- `config/data-freshness-exceptions.json`
- `scripts/data_freshness_report.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/package-scripts.md`
- `tests/data-freshness-report.test.ts`
- 현재 tracked → untracked import 파일 전체

## 현재 확인된 내용

- canonical 명령은 `config/data-freshness-exceptions.json`을 요구합니다.
- 파일이 없으면 strict/report 경로가 명시적으로 실패합니다.
- CI는 `pnpm data:doctor`를 실행합니다.
- 예외 만료 직전·만료 시점·만료 후 테스트가 있습니다.

## 남은 문제

해당 파일과 여러 신규 모듈이 미추적이라 clean checkout/CI에 포함되지 않습니다.

## 작업 요구사항

- 예외 파일을 임시 런타임 산출물로 취급하지 않습니다.
- 현재 정책대로 canonical source라면 최종 Git 변경 묶음에 반드시 포함되어야 합니다.
- 이번 작업에서는 `git add`를 실행하지 않습니다.
- 대신 다음을 최종 보고에 정확히 제공합니다.
  1. Git 포함이 필수인 미추적 source/config/test 파일 목록
  2. tracked 파일에서 import되어 누락 시 typecheck/build가 깨지는 파일 목록
  3. clean checkout에서 누락 시 실행 실패하는 config 파일 목록
  4. 사용자가 검토 후 실행할 수 있는 정확한 `git add -- <paths...>` 후보 명령
- 가능하면 temporary clean-room 검증을 수행하되 기존 Working Tree를 건드리지 않습니다.
  - 새 임시 디렉터리 또는 worktree를 사용
  - 현재 Stage 1 관련 파일만 복제·적용
  - 원본 Working Tree에는 reset/stash/checkout/clean을 사용하지 않음
- Stage 1 변경을 기존 변경과 객관적으로 분리할 기준이 없으면 clean-room 전체 재현을 억지로 PASS 처리하지 않습니다.

## 판정 규칙

- 파일이 여전히 untracked이면 1-10을 `확인됨`으로 기록하지 않습니다.
- 코드와 테스트가 준비됐으나 Git 포함만 남았다면 `부분 확인 — Git 포함 대기`로 기록합니다.
- 사용자가 이후 파일을 실제 commit에 포함한 뒤 clean checkout CI가 통과해야 최종 `확인됨`입니다.

---

# 10. Stage C8 — 기록과 불필요한 다운로드 메타데이터 정리

## 대상

- `work/9/1/2026-09-01-stage1-accuracy-safety.md`
- `.gitignore`
- `FINANCE_CODEX_GOAL.md:Zone.Identifier`

## 작업 요구사항

- 작업 기록의 잘못된 경로를 수정합니다.

```text
잘못된 경로:
src/lib/publicApis/schemas/subscriptionFilters.ts

실제 경로:
src/lib/schemas/subscriptionFilters.ts
```

- `FINANCE_CODEX_GOAL.md:Zone.Identifier`는 소스가 아닌 Windows 다운로드 메타데이터임을 확인합니다.
- 사용자의 파일을 임의 삭제하지 않습니다.
- 광범위한 `git add`에서 섞이지 않도록 기존 ignore 정책과 충돌하지 않는 경우 `.gitignore`에 `*:Zone.Identifier` 또는 동등한 패턴을 추가합니다.
- 실제 파일 삭제는 수행하지 않고 최종 보고에 제거 권고만 남깁니다.

---

# 11. 검증 순서

## 각 항목 직후

- 가장 좁은 타깃 Vitest 또는 component test만 실행합니다.
- 실제 네트워크가 필요한 경우 mock/fixture/route interception을 사용합니다.
- 같은 전체 테스트를 반복하지 않습니다.

## Stage C1~C8 완료 후

현재 `package.json`에 실제 존재하는 명령을 확인한 뒤 다음을 한 번 실행합니다.

1. 변경 관련 타깃 테스트 전체
2. `pnpm typecheck`
3. `pnpm freshness:release`
4. `pnpm test`
5. `pnpm lint`
6. `pnpm build`
7. Gov24·FX·상품·파괴 확인창 관련 최소 브라우저 테스트
8. 현재 Stage 1 대상 `git diff --check`

전체 게이트 실패 시:

- 최초 실패 명령과 오류를 그대로 기록합니다.
- 이번 변경과 관련 없는 기존 실패를 임의 수정하지 않습니다.
- 타깃 테스트와 diff로 귀속을 구분합니다.
- 실행하지 않은 검증을 PASS로 기록하지 않습니다.

---

# 12. 완료 판정 기준

## `확인됨`으로 올릴 수 있는 조건

### 1-1
실제 다이얼로그의 빈 값·오입력·정확한 입력·닫기·재열기 테스트 통과

### 1-2
일반 `ABC(N)` parser 테스트와 `/api/public/fx` 경로 테스트 통과

### 1-3
저장 payload·hydrate·재열기까지 `targetMonth` 값 유지 검증

### 1-4
storage 읽기 실패가 bundle의 `null` 삭제값으로 변환되지 않음

### 1-5
provider 전체 발견, 필터 push-down 또는 bounded scan, cursor 재사용 검증

### 1-6
syncing polling, ready 종료, hidden/visible, unmount, stale response 검증

### 1-7
FX provider의 UTC 날짜 fallback 제거와 KST 경계 검증

### 1-10
canonical 예외 파일과 필수 신규 모듈이 실제 Git 변경 묶음에 포함되고 clean checkout CI가 통과

이번 작업에서 `git add`·commit을 금지하므로 1-10은 코드 준비가 끝나도 최종 보고에서 `부분 확인 — Git 포함 대기`가 될 수 있습니다. 이 상태를 억지로 완료로 쓰지 마세요.

---

# 13. 완료 보고 형식

```text
## 핵심 판정
- 1-1~1-10 항목별 확인됨 / 부분 확인 / 확인 불가 / 기존 판단 유지
- Stage 1 전체 승인 가능 여부

## 수정한 문제
- 최초 원인
- 최소 수정
- 실제 사용자·저장·API 경로

## 변경한 파일
- 파일별 변경 이유
- 신규 파일 여부
- Git 추적 여부

## 검증
- 실행 명령
- exit code
- 테스트 수
- 브라우저 요청 횟수 등 직접 증거

## Git 포함 필수 파일
- tracked 소스가 import하는 untracked 파일
- canonical config
- 회귀 테스트
- 정확한 `git add -- ...` 후보 명령

## 유지한 범위
- Stage 2·3 미구현
- 1-8·1-9 정책 유지
- 기존 API·URL·데이터 호환성

## 남은 위험
- clean checkout/CI
- 외부 API 실자격 증명
- 상품 필터 비용 또는 부분 결과

## Git 상태
- branch / HEAD / upstream
- staged
- tracked 변경 수 / untracked 수
- reset·checkout·restore·stash·clean·commit·push 미실행 여부
```

`전체 완료`, `PASS`, `정상`은 위 완료 조건과 실행 증거가 모두 있는 범위에만 사용합니다.
