# 2026-03-11 WSL localhost dual-stack 복구 및 reports dev classify 재확인

## 변경 이유
- 사용자 환경에서 `localhost:3100`은 접속되지 않고 `LAN_IP:3100`만 접속된다는 제보가 있었다.
- 현재 환경은 WSL2였고, `getent hosts localhost` 기준 `localhost -> ::1` 이 먼저 잡혔다.
- 기존 `pnpm dev`는 WSL에서 `0.0.0.0`을 우선 선택해 IPv4로만 리슨할 수 있었고, 이 경우 `http://[::1]:3100` 연결은 실제로 실패했다.
- `/planning/reports` dev 병렬 abort 잔여 이슈도 함께 다시 확인할 필요가 있었다.

## 이번 변경
1. `scripts/next_dev_safe.mjs`
   - WSL에서는 host 후보를 `:: -> 0.0.0.0 -> 127.0.0.1` 순서로 바꾸었다.
   - `::`로 뜬 경우 `[::1]` URL과 WSL dual-stack 안내를 함께 출력하게 했다.
2. `playwright.config.ts`
   - dev webServer가 기본적으로 `--host 0.0.0.0`를 강제하지 않도록 바꿨다.
   - 필요할 때만 `PLAYWRIGHT_DEV_HOST`로 host를 덮어쓰도록 정리했다.
3. `README.md`
   - WSL에서 `pnpm dev`가 dual-stack 바인드를 우선 시도한다는 안내를 추가했다.

## 검증
1. `pnpm dev --port 3100`
2. `curl http://127.0.0.1:3100`
3. `curl http://localhost:3100`
4. `curl http://[::1]:3100`
5. `curl http://172.20.128.246:3100`
6. `pnpm exec tsx -e "import config from './playwright.config.ts'; console.log(config.webServer.command)"`
7. `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1`
8. `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3166`

## 검증 결과
- `pnpm dev --port 3100` 는 `Bind: host=:: port=3100` 으로 올라왔다.
- `127.0.0.1`, `localhost`, `[::1]`, `172.20.128.246` 4개 URL 모두 `200` 응답을 확인했다.
- `pnpm exec tsx ...` 결과 Playwright dev webServer command는 `node scripts/next_dev_safe.mjs --webpack --port 3126 --strict-port` 로 확인됐다.
- `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1` PASS
- `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3166` PASS (`3/3`)
- classify PASS 로그 안에서도 `Fast Refresh had to perform a full reload`, `/planning/reports 500`, `__webpack_modules__[moduleId] is not a function` 흔적은 남았지만 최종 spec 실패로는 이어지지 않았다.

## 남은 리스크
- dev shared webpack runtime 노이즈는 로그상 남아 있다.
- 다만 이번 라운드 기준으로는 `/planning/reports` 관련 3회 classify가 모두 PASS라서, 현재 우선순위는 앱 회귀 수정보다 runtime 노이즈 관찰에 가깝다.

## 다음 라운드 우선순위
1. 필요하면 `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3176` 로 반복도를 더 올린다.
2. dev PASS 로그 안에 남는 `__webpack_modules__[moduleId] is not a function` 과 `/planning/reports 500` 시점을 같은 런 기준으로 다시 묶는다.
3. 수동 개발 경로에서는 `localhost:3100` 우선 안내를 유지하고, 외부 기기 확인이 필요할 때만 LAN URL을 추가 안내한다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
