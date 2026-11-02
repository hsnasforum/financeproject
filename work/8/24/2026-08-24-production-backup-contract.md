# 운영 백업·Planning 표시 계약 보완

## 작업 전 정리

- 수정 대상: 사용자 백업 API/화면, 공개 복구 화면, Planning 실행 비교 보고서, 프로필 폼, 추천 점수, workspace 피드백.
- 변경 이유: Public Stable 화면이 production에서 `/api/dev/*` 또는 `/api/ops/*` 404를 호출하고, 사용자 범위·입력/표시 단위·비교 계약이 실제 저장/응답과 어긋나던 문제를 해소한다.
- 계획 검증: focused Vitest, 변경 파일 ESLint, TypeScript, route security scan, current-screens guard. 전체 build/e2e는 마지막 통합 라운드에서 단일 실행한다.

## 무엇이 바뀌었는지

- `/api/settings/backup/*`를 로컬·same-origin·현재 사용자·vault CSRF 경계로 추가하고 암호화 export/preview/restore를 production 설정 화면에 연결했다.
- 복원 요청에 1회용 preview token을 전달하고, 공개 복구 화면에서는 Dev unlock·서버 tmp 삭제·오프라인 명령 실행을 제거했다.
- 실행 비교 HTML이 실제 두 run을 조회해 지표·스냅샷·상태·override 차이를 표시하도록 보완했다.
- 누락 생년을 `1900`으로 바꾸지 않으며, 추천 0~1 점수를 0~100%로 표시한다.
- workspace 피드백을 current-user namespace의 stable API로 전환하고 제목/내용 검증과 안내 문구를 서버 계약에 맞췄다.

## 검증 방법 및 결과

- `corepack pnpm exec vitest run tests/planning/settings-backup-production-boundary.test.ts tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-export-route-service-boundary.test.ts tests/planning-v2-api/runs-report-route.test.ts tests/recommend-results-view-model.test.tsx tests/planning/ui/profileFormModel.test.ts tests/planning/components/planningFeedbackSubmitAction.test.tsx`
  - 6개 파일, 76개 테스트 PASS. 지정 경로 중 현재 존재하는 테스트 파일만 실행되었다.
- `corepack pnpm sec:scan:routes`
  - PASS, mutation 130개 전부 분류됨.
- `corepack pnpm planning:current-screens:guard`
  - 5개 파일, 11개 테스트 PASS.
- `corepack pnpm exec tsc --noEmit --incremental false`
  - PASS.
- 변경 파일 대상 `corepack pnpm exec eslint ...`
  - PASS.

## 남은 리스크와 엣지케이스

- 실제 desktop-local launcher session에서 암호화 파일 다운로드→미리보기→복원 전체 흐름은 최종 production smoke/e2e에서 확인해야 한다.
- 이전 JSON 번들의 서버 파일은 새 사용자 범위 복원에 적용하지 않고, 브라우저 설정만 복원한다. 서버 데이터는 새 암호화 백업을 사용해야 한다.
- 사용자별 stable 피드백은 개발 전용 전역 ops 피드백 목록과 저장 위치가 분리된다. 운영 조회 화면이 필요하면 별도 권한 경계를 설계해야 한다.

## 사용 skill

- `finance-skill-routing`: 이번 batch에 필요한 최소 skill 조합 선택.
- `planning-gate-selector`: API/UI/계약 변경의 focused 및 최종 검증 세트 선택.
- `route-ssot-check`: stable API와 Public Stable/Dev 경계 및 `docs/current-screens.md` 정합성 확인.
- `work-log-closeout`: 변경 파일·실행 검증·잔여 위험을 이 문서 형식으로 기록.
