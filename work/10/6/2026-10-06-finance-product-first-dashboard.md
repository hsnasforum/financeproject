# 2026-10-06 Finance 제품 우선 대시보드 마일스톤

## 변경 파일

- 제품: `src/components/DashboardClient.tsx` 한 파일. 계산·저장·인증·백업·API·route 구현은 변경하지 않음.
- 검증: `tests/dashboard-view-model.test.tsx`, `tests/e2e/dashboard-current-state.spec.ts`.
- 운영 지침: `AGENTS.md`, `multi_agent.md`, `FINANCE_ACTIVE_GOAL.md`, `README.md`, 기존 4개 skill, native 역할과 CLI 프롬프트, `.codex/config.toml` 주석, `scripts/run_codex_multi_agent.sh`, `work/README.md`.
- 정확한 delta와 SHA는 `/home/xpdlqj/finance-recovery/product-20261006-203239/delivery-files.json` 및 `delivery.patch`에 보존.

## 사용 skill

- codex-agent-rules-maintenance: 기존 규칙·실제 설정·역할·러너를 대조하고 model/effort/sandbox/approval를 보존.
- planning-gate-selector: 이번 UI/규칙 변경에 필요한 타깃 검증과 종료 build만 선택.
- frontend-skill: 현재 수치와 다음 행동 중심의 정보 구조, 가독성, 대비, 키보드·작은 화면 확인.
- work-log-closeout: 작은 수정마다 일지를 늘리지 않고 이 마일스톤 한 문서에 통합.

## 변경 이유

현재 목표가 무엇인지보다 테스트·역할·보고 절차가 앞서는 충돌을 제거하고, 규칙 수정만으로 종료하지 않기 위해 대시보드의 한 사용자 경험을 실제로 완성했다. 과거 정확성 작업의 모든 잔여 항목을 이번 목표에 합산하지 않는다.

## 핵심 변경

- 현재 월 잉여금과 계산 근거 → 상태별 다음 행동 → 최근 플랜 재열기로 기본 화면을 재구성. 다른 프로필 기록과 현재 프로필 결과, 현재 금액과 미래 추정은 구분.
- 상품·혜택·환율·데이터 상태와 상세 액션을 접힌 보조 영역에 보존. 읽기 실패와 오래된 결과의 경고·재시도는 기본 화면에 남김.
- 기존 재계산의 동일 요청 키·원본 기록 보존·snapshot 실패 처리·리포트/히스토리 연결 유지. 모바일 390px에서 2열 지표와 가로 넘침 없는 화면 확인.
- 개발 중 타깃 검증 / 마일스톤 종료 / 기존 출시 게이트를 구분. CI와 금융·인증·저장 위험 검사는 유지하며 무조건 full test/build/RC를 부르는 중복 규칙 제거.
- 기본은 메인 제작자 단독, 분할 이득이 있을 때만 위임. CLI 멀티 러너는 기본 full 7역할에서 core 3역할로 변경하고 full은 명시 선택으로 보존.
- 새 모델·권한 설정은 적용하지 않음. 문서만 Astra 전환을 목표로 적고 실제 TOML/CLI/guard는 Sol/Terra인 상태를 확인하여 현재 파일 값과 미적용 전환을 구분.

## 검증

- 격리 사본의 최종 `corepack pnpm exec vitest run tests/dashboard-view-model.test.tsx --maxWorkers=2`: 42 PASS, 1.89초(전체 명령 경과).
- 변경 제품·테스트 3파일의 `corepack pnpm exec eslint ...`: PASS, 3.82초.
- `corepack pnpm typecheck`: PASS, 36.59초. 이후 제품 변경은 반응형/focus class뿐이며 최종 build의 TypeScript 검사도 PASS.
- 종료 `corepack pnpm build`: 1회 PASS, 111.54초. 전체 test/verify/RC/complete와 live API는 실행하지 않음.
- 합성 fixture·격리 SQLite·기존 dev wrapper로 실제 브라우저 4흐름 PASS: 현재 프로필/다른 프로필 구분 → 재계산 → 리포트 → 원본 이력 유지; 중복 클릭/유실 응답 재시도; snapshot 유실 시 쓰기 없음; 초보자 입력 → 첫 플랜 저장.
- 마지막 모바일/focus 다듬기 이후 영향받는 첫 통합 흐름만 재실행, 1 PASS / 35.57초. 나머지 세 흐름의 API·저장·요청 처리 코드는 변경하지 않았으므로 이전 통과를 재사용.
- 1440×1000 및 390×844 실제 캡처를 열어 확인. 키보드 Enter로 보조 영역 열기/닫기, 모바일 가로 넘침 없음 확인.
- native TOML 8개와 config 파싱, model/effort/sandbox/approval 설정 보존 확인. skill quick_validate 4개 PASS. CLI bash -n / --help PASS.
- 원본 반영과 원본 guard/타깃 검사 결과는 이 문서 마지막의 적용 결과에 기록.

## 보존과 실패 처리

- 시작 HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, staged 0. 기존 작업은 Git reset/clean/stash/stage/commit 없이 보존.
- 수정 전 소스·설정 4,448항목을 저장소 밖의 `.../product-20261006-203239/baseline`에 보존하고 SHA 일치 확인. 실제 `.env`와 사용자 DB/runtime 자료는 복사·수정하지 않음. 백업은 Git clean/검토 완료를 뜻하지 않음.
- 모든 앱 실행·build·브라우저 fixture는 격리 사본에서 수행. 임시 검증 서버는 종료.
- 첫 focused 실패 1개는 새 레이아웃에서 다른 프로필의 미래 결과 안내 문구가 누락된 것으로, 최근 기록 안내에 구분 문구를 복원해 해결. 금융 수치/보존 assertion은 완화하지 않음.
- 첫 Playwright wrapper는 서버 시작 전 비어 있는 포트의 HTTP preflight가 정체되어 실행 중단(exit 1). 없는 listener 접속 timeout과 자체 listener 접속 성공을 확인한 뒤, 기존 safe dev wrapper로 서버를 먼저 시작하고 공식 external-base-URL 경로로 검증. 앱 인증·runtime guard는 변경하지 않음.

## 남은 리스크

- Finance 전체 출시·기존 설치본 반영·원격 CI·실제 사용자 데이터 및 live API 검증은 이번 완료 범위가 아님. 기존 대규모 미커밋 변경은 그대로 남아 있으며 별도 게시 승인이 필요.
- 사용자의 실제 만족도를 대신 확정하지 않음. 이번에 확인한 것은 대시보드의 구현·핵심 흐름·화면과 제한된 검증.
- Node 실제 v22.23.2와 package engines 22.22.2 경고는 기존 환경 차이로 기록, 의존성/Node를 업그레이드하지 않음.
- native Codex 새 세션의 effective model이나 자동 협업 성능을 실행 검증한 것은 아님. 설정·역할 정합성과 실제 수행한 제품 작업을 구분.

## 다음 라운드

이번 작업은 대시보드 마일스톤에서 종료. 플래닝 입력·리포트의 중복 설명, Git 게시 묶음, 실제 설치본 종합 검증은 후속 후보이며 자동 실행하지 않음.

## 적용 결과

원본 소스에 이번 delta 31파일을 적용하고 사본과 byte 일치를 확인했다. 원본에서 multi-agent:guard PASS, 대시보드 42 tests PASS, scoped git diff --check PASS. HEAD와 index는 시작 상태를 유지하며 기존 변경을 덮어쓰거나 게시하지 않았다. 로컬 마일스톤 완료이며 Finance 전체 출시 완료는 아니다.
