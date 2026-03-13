# 2026-03-11 e2e dev hmr cli closeout

## 수정 대상 파일
- `scripts/playwright_with_webserver_debug.mjs`
- `scripts/e2e_parallel_flake_classify.mjs`
- `package.json`
- `README.md`
- `docs/planning-v2-setup-playbook.md`

## 변경 이유
- 자동화 리스크는 닫혔지만, dev HMR 포함 경로를 다시 재현할 때 매번 `E2E_DISABLE_DEV_HMR=0` env를 기억해야 했다.
- 이 방식은 쉘마다 문법이 달라 운영자가 같은 절차를 안정적으로 재사용하기 어렵다.

## 무엇이 바뀌었는지
- Playwright 런처에 `--dev-hmr` CLI 플래그를 추가해 dev HMR websocket을 다시 허용할 수 있게 했다.
- 병렬 classify 러너도 같은 `--dev-hmr` 플래그를 받아 dev 재현 조건을 스크립트 수준에서 고정할 수 있게 했다.
- `package.json`에 `pnpm e2e:rc:dev-hmr`, `pnpm e2e:parallel:classify:dev-hmr` 스크립트를 추가했다.
- README와 setup playbook은 env 직접 입력 대신 새 스크립트를 기본 안내로 바꿨다.

## 검증 명령
- `pnpm e2e:rc`
- `pnpm build`
- `pnpm e2e:parallel:classify:dev-hmr -- --runs=1 --mode=development --skip-build --dev-port-base=3326`

## 결과
- release gate와 build는 계속 PASS였다.
- 새 dev HMR 재현 스크립트도 실제 classify 경로에서 `pass=1/1`로 동작했다.
- raw dev HMR 조건에서는 `Fast Refresh had to perform a full reload` 로그가 다시 보였지만, 이번 검증에서는 모든 대상 흐름이 PASS였다.
- 운영자가 쉘 문법 차이 없이 같은 재현 절차를 다시 실행할 수 있게 됐다.

## 남은 리스크
- 현재 자동화 기준으로 남은 재현 리스크는 확인되지 않았다.
- [가정] 수동 브라우저에서 일반 개발 HMR을 더 줄이고 싶다면, 그 축은 Playwright guard가 아니라 앱 쪽 dev runtime 최적화로 별도 다뤄야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
