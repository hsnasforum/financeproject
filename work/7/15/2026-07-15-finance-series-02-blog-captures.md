# 2026-07-15 파이낸스 검증 2편 블로그 이미지 캡처

## 변경 파일

- `scripts/capture_finance_series_02.mjs`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/README.md`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-01-stale-snapshot-baseline.png`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-02-refresh-failure-causes.png`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-03-finlife-refresh-scope.png`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-04-freshness-recovery-boundary.png`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-05-empty-exchange-snapshot.png`
- `docs/blog-assets/finance-series/02-data-freshness-recovery/02-06-data-source-user-states.png`
- `work/7/15/2026-07-15-finance-series-02-blog-captures.md`

## 사용 skill

- `finance-skill-routing`: 이번 이미지 작업에 필요한 최소 저장소 skill 조합을 선택했다.
- `planning-gate-selector`: 캡처 스크립트 문법, 실제 재생성, 화면 스모크와 문서 diff 검사를 검증 범위로 선택했다.
- `dart-data-source-hardening`: 외부 데이터의 freshness, fallback, 부분 성공과 사용자 상태 표기를 분리해 검토했다.
- `playwright`: 동일 규격 PNG 렌더링, clipping 검사와 실제 데이터 소스 설정 화면 스모크 확인을 수행했다.
- `work-log-closeout`: 변경 파일, 검증 결과와 남은 원고 리스크를 이 문서에 정리했다.

## 변경 이유

- 파이낸스 검증 2편 원고의 stale 8개 출발점, 갱신 실패 원인, FINLIFE 조건부 갱신, 날짜 기준 복구, 비어 있는 환율 스냅샷과 사용자 상태 문구를 프로젝트 내부 근거로 뒷받침해야 했다.
- 과거 터미널 원본이 없는 기록을 실제 로그처럼 합성하지 않고, 과거 보고서와 `/work` 기록의 범위를 명확히 표시해야 했다.
- 현재 `main` 코드와 원고의 조건부 갱신 설명이 다른 부분을 공개 이미지에서 임의로 맞추지 않아야 했다.

## 핵심 변경

- 2026-06-22 과거 보고서의 8개 행과 `fresh=0/stale=8`을 커밋에서 읽어 IMAGE_01을 생성한다.
- 내부 TypeScript 로더 문제와 외부 FINLIFE timeout을 별도 기록으로 표시해 IMAGE_02를 생성한다.
- 현재 `main`의 FINLIFE 6종과 실제 네 가지 if-stale 조건만 IMAGE_03에 표시한다.
- 복구 보고서의 `fresh=8/stale=0`과 당시 strict 9단계 성공을 날짜 기준 범위로 IMAGE_04에 표시한다.
- 실제 환율 스냅샷의 `asOf=null/rowCount=0`과 UI 세 상태 코드 매핑을 IMAGE_05·06으로 생성한다.

## 검증

- `command -v npx`: PASS (`/usr/bin/npx`)
- Playwright CLI `about:blank` open/snapshot/close: PASS
- `node --check scripts/capture_finance_series_02.mjs`: PASS
- `node scripts/capture_finance_series_02.mjs`: PASS, 6개 PNG 생성
- 근거 assertion: baseline `8/0/8`, ageDays `27.75~27.79`, recovery `8/8/0`, strict 9단계, exchange `generatedAt=2026-06-22T15:58:25.910Z/asOf=null/rowCount=0`, FINLIFE 6종, if-stale 네 조건 PASS
- 로컬 `PORT=3180 corepack pnpm dev` + Playwright `/settings/data-sources`: HTTP 200, 화면 렌더링, `연결 준비됨` 문구 확인 PASS
- 개발 화면 콘솔: React DevTools 안내와 HMR 메시지만 확인, 페이지 오류 없음
- 저장 PNG 6개 원본 렌더링 확인: 글자 잘림, 로딩 중 화면, 팝업, 과도한 여백, 브라우저 UI와 민감정보 노출 없음
- `file docs/blog-assets/finance-series/02-data-freshness-recovery/*.png`: 6개 모두 1200×700 8-bit RGB PNG
- `git diff --check -- scripts/capture_finance_series_02.mjs docs/blog-assets/finance-series/02-data-freshness-recovery/README.md work/7/15/2026-07-15-finance-series-02-blog-captures.md`: PASS
- 확인용 3180 개발 서버는 스모크 종료 후 중지했다. 별도로 실행 중이던 3126 E2E 서버와 테스트 프로세스는 건드리지 않았다.
- Computer Use는 사용자 지시에 따라 사용하지 않았다.

## 남은 리스크

- 원본 터미널 출력이 없어 IMAGE_02는 당시 `/work` 기록을 시각화한 설명 이미지다.
- 현재 `main`의 if-stale 실행 경로에는 “마지막 동기화 실패” 직접 검사가 없다. 원고에서 이를 현재 조건으로 적은 문장은 수정해야 한다.
- 실제 로컬 데이터 소스 화면은 현재 환경에서 모든 카드가 `연결 준비됨`으로 나타났다. IMAGE_06은 세 상태를 실제 동시 화면으로 오해하지 않도록 코드 매핑임을 표시했다.
- 2026-06-22에 복구된 스냅샷이 2026-07-15에도 fresh한지는 이번 원고와 같이 다시 판정하지 않았다.

## 이번 라운드 완료 항목

- IMAGE_01~06 캡처 계획, 근거 대조, Playwright PNG 생성과 원본 검수를 완료했다.
- 자산 README에 파일명, 삽입 위치, 캡션, 대체 텍스트와 표현 경계를 기록했다.

## 다음 라운드 우선순위

- 원고의 조건부 갱신 조건 문장을 현재 `main` 코드에 맞게 수정한다.
- 티스토리 편집 화면에서 실제 본문 폭에 맞춘 축소 렌더링과 대체 텍스트 입력을 확인한다.

## 후속 이미지 수정

- IMAGE_04 오른쪽 제목의 UTC ISO 표기 `2026-06-22T16:07:03Z`를 요청한 표시 형식인 `2026-06-22 16:07:03 보고서`로 바꿨다.
- 원본 시각의 숫자는 유지하고 `T`, 소수초와 `Z`만 화면에서 제거했으며, 기존 복구 수치와 레이아웃은 유지했다.
- Playwright 재생성 전후 SHA-256을 비교해 IMAGE_04만 변경되고 나머지 5개 PNG는 동일함을 확인했다.
- 수정 PNG를 원본 크기로 다시 열어 제목 잘림과 `T`·`Z` 잔존이 없음을 확인했다.
