# 2026-10-06 Finance 입력 목표 보존 — Astra Ultra / Sol Max 제품 시험

## 변경 파일

- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `src/components/planning/workspace/panels/profilePanel.tsx`
- `src/lib/planning/ui/profileFormModel.ts`
- `tests/e2e/planning-quickstart-preview.spec.ts`
- `tests/planning/ui/profileFormModel.test.ts`
- `USER_GUIDE.md`
- 이 기록. 이전 완료 기록과 `FINANCE_ACTIVE_GOAL.md`는 보존했다.

## 사용 skill

- finance-skill-routing: 필요한 최소 스킬 선택.
- planning-gate-selector: 영향받는 입력·저장 소비 경로와 실제 사용자 흐름 검사 선택.
- playwright: 실제 브라우저 재현, API 조회, 재열기와 화면 확인.
- work-log-closeout: 이번 전달 단위를 기록 하나로 정리.

## 변경 이유

대시보드에서 재무 진단으로 들어가 월 실수령 320만 원, 고정지출 170만 원, 전세자금 1,000만 원/12개월만 입력했다. 초안 설명은 목표 1개였지만 실제 저장에는 비상금·목돈·은퇴 목표가 추가되어 총 4개가 들어갔다. 다시 연 리포트에는 입력하지 않은 은퇴 목표 미달이 나타났고, 초보자 폼에는 원래 전세자금 목표가 보이지 않았다. 실제 브라우저와 회귀 테스트 실패로 확인한 문제다.

## 핵심 변경

- 프로필 로드와 초보자 모드 진입에서 목표를 자동 추가하지 않는다. 실제 목표 목록을 두 모드에서 함께 표시하고 기존 추가·수정·삭제 action을 사용한다.
- 마지막 목표 삭제 후 다시 불러오면 기본 비상금이 생기던 동일 유형의 문제도 해결했다. `goals: []`를 그대로 보존한다.
- 기존 목표·리포트는 자동 정리하지 않는다. 계산 엔진, 금융 가정, API·저장 형식, 인증·owner, route, launcher와 모델 설정은 변경하지 않았다.
- 목표 입력란의 모바일 줄바꿈을 보정하고 사용 안내를 갱신했다.
- 메인은 원인 판단·수정·통합·최종 검증, Sol 하위 작업은 독립 조사와 읽기 전용 검토를 담당했다. 같은 파일의 병렬 수정은 없었다.
- 현재 세션과 두 직계 하위 작업의 실제 `turn_context`에서 메인 `gpt-6-astra/ultra`, 조사·검토 각각 `gpt-6.1-sol/max`를 확인했다. 모델별 비용·속도·우열 비교는 하지 않았다.

## 검증

- WSL Ubuntu의 Linux Git, Node 22.23.2, Corepack pnpm 9.15.9를 사용했다. engines의 Node 22.22.2 차이 경고는 유지했다.
- 수정 전 브라우저 저장/API 조회/리포트 재열기에서 목표 4개를 확인했다. 목표 1개 assertion을 추가한 E2E는 실제 4개 때문에 실패했다. 빈 목표 왕복 assertion도 수정 전 기본 비상금 1개가 반환되어 실패했다.
- `corepack pnpm exec vitest run tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStartGate.test.tsx tests/planning/ui/profileFormModel.test.ts tests/planning/reports/stableReportScenarios.test.tsx tests/planning/ui/targetMonthInput.test.ts --maxWorkers=2`: 6 files / 54 tests PASS.
- 변경 TS/TSX 5파일에 `corepack pnpm exec eslint` 실행: PASS.
- 격리 dev 서버에서 `corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts --workers=1 --retries=0`: 3 PASS. 기본 흐름, profileId 재진입, hash 확인 불가 시 이력 안내를 포함했다. 모바일 목표 배치 변경 후 첫 흐름을 재검증하여 PASS.
- 목표 1개 UI/API 저장, 리포트 목표 행 1개, 새로고침과 프로필 재진입, 미저장 상태 없음, 임시 목표 추가·삭제, 마지막 목표 삭제·저장·재열기 후 빈 배열, 기존 run ID 보존을 확인했다.
- 수정 전 만든 합성 프로필의 기존 목표 4개는 수정 후에도 그대로 표시·조회되었다.
- 1440×1000과 390×844 브라우저 캡처를 열어 확인했다. 모바일 가로 넘침 검사, 키보드 상세 열기·닫기, 저장 결과와 리포트 이동을 확인했다.
- 첫 build는 최종 diff에서 목표 외 부채 footer의 동반 class 변경을 발견해 중단했다. 해당 변경을 baseline으로 복원한 최종 소스의 `corepack pnpm build`: PASS(TypeScript 포함).
- production 자동 webServer는 서버 실행 전 loopback 연결 확인에서 정체되어 중단했다. 제한 시간 probe도 timeout을 확인했고, 공식 launcher를 먼저 실행하는 경로로 변경했다.
- 첫 launcher가 개발 사본의 외부 node_modules 링크를 `better-sqlite3 package escapes the app root`로 거부했다. guard를 유지한 채 동일 버전 의존성을 사본 내부에 복사했고, 의존성 경로 변경 후 production build를 다시 실행하여 PASS했다.
- 공식 `corepack pnpm start --port=3382`로 격리 production 서버 실행 후, `E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3382 corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts --runtime=production --grep 'previews before' --workers=1 --retries=0`: 1 PASS(12.0초). 테스트 세션 인증으로 대시보드 → 재무 진단 → 저장 → 리포트 재열기 → 마지막 목표 삭제 → 빈 목록 저장·재열기를 확인했다.
- Sol 검토에서 빈 목표 복원 문제를 발견하여 반영했다. 최종 목표 UI/안내 delta 재검토에서 추가 actionable 결함은 없었다.
- 원본 4,406파일의 시작 SHA/백업과 이번 delta·로그·모델 실행 근거를 `/home/xpdlqj/finance-recovery/astra-sol-product-20261006`에 보존했다. 실제 .env와 제품 DB를 사본으로 가져오지 않고 합성 SQLite/Planning root만 사용했다.
- 원본 반영 전 drift 없음, 6파일 반영 후 검증 사본과 byte 일치, 범위 밖 baseline과 Git index 보존을 확인했다. `corepack pnpm worktree:scope -- <이번 파일>`과 Linux Git scoped `diff --check`를 실행했다. 기존 main HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`을 보존했다.

## 미실행 검증

전체 test/RC/release gate, 원격 CI, 실제 사용자 재무 데이터, live 외부 API, 기존 설치본 교체와 Windows 네이티브 실행은 수행하지 않았다. 기준 데이터 누락 안내를 확인했으며 live 데이터 검증으로 표시하지 않는다.

## 남은 리스크

- 현재 로컬 소스에 반영했다. 기존 독립 검토 설치본은 그대로이며 commit·push·배포는 하지 않았다.
- 이미 저장된 추가 목표와 리포트는 자동 수정하지 않는다. 필요한 경우 목표 목록에서 직접 확인·삭제하고 새 진단을 저장해야 한다.
- 합성 입력으로 확인한 해당 사용자 흐름의 완료이며 Finance 전체 정확성이나 출시 완료를 뜻하지 않는다.

## 다음 라운드

이번 목표는 여기서 종료한다. 설치본 업데이트나 게시가 필요하면 해당 범위의 별도 요청에서 진행한다.
