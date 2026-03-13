# 2026-03-11 WSL localhost:3100 경로 정리와 reports dev abort 완충

## 변경 이유
- WSL 환경에서 사용자는 `localhost:3100` 접속은 실패하고 LAN IP `:3100`은 접속된다고 보고했다.
- 현재 `pnpm dev` 래퍼(`scripts/next_dev_safe.mjs`)는 WSL에서 기본 host 후보를 `0.0.0.0` 우선으로 골랐다.
- 같은 라운드에서 `/planning/reports` dev parallel flake는 단독 PASS / prod PASS인데도 shared dev runtime에서 `page.goto("/planning/reports") -> net::ERR_ABORTED`가 잔존했다.
- 로컬 `.wslconfig`는 `localhostForwarding=true` 였고, 기존 `3100`에는 이미 `pnpm dev --port 3100` 프로세스가 떠 있었다.

## 이번 변경
1. `scripts/next_dev_safe.mjs` 에서 WSL 기본 host 후보를 `:: -> 0.0.0.0 -> 127.0.0.1` 순서로 바꿨다.
2. 같은 스크립트에서 `host=::` 일 때 `http://[::1]:PORT` 와 LAN URL을 같이 안내하도록 보강했다.
3. `tests/e2e/flow-history-to-report.spec.ts` 에 `net::ERR_ABORTED` 1회 재시도 helper를 추가해 shared dev HMR abort만 좁게 흡수했다.
4. `playwright.config.ts` 는 dev webServer host를 env 기반으로 유지하되 기본값은 기존과 같은 `0.0.0.0`으로 둬 현재 셸의 bind 제약과 충돌하지 않게 했다.

## 원인 정리
- `localhostForwarding=false` 같은 WSL 전역 설정 문제는 아니었다. 실제로 `/mnt/c/Users/HS/.wslconfig` 에 `localhostForwarding=true` 가 있었다.
- 사용자 증상에 더 가까운 원인은 저장소 기본 dev host가 WSL에서 IPv4 wildcard(`0.0.0.0`) 우선이었다는 점이다.
- 이번 수정 뒤 `pnpm dev --port 3104` 출력은 `Bind: host=:: port=3104` 와 `Open (same env): http://[::1]:3104` 를 표시해 기본 선택이 dual-stack으로 바뀐 것을 확인했다.
- [가정] Windows 브라우저에서 `localhost` 경로가 흔들리고 LAN IP는 붙는 현상은 WSL localhost bridge보다 IPv4-only bind 영향이 컸을 가능성이 높다.

## 검증
1. `pnpm exec eslint scripts/next_dev_safe.mjs playwright.config.ts tests/e2e/flow-history-to-report.spec.ts`
2. `env PORT=3105 PLAYWRIGHT_DEV_HOST=0.0.0.0 pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1`
3. `env PORT=3106 PLAYWRIGHT_DEV_HOST=0.0.0.0 pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`
4. `pnpm e2e:parallel:report-flake:prod`
5. `pnpm dev --port 3104` 출력 확인 (`Bind: host=:: ...`, `Open (same env): http://[::1]:3104`)

## 검증 결과
- `eslint` PASS
- `flow-history-to-report` 단독 PASS (`PORT=3105`)
- `dart-flow` 단독 PASS (`PORT=3106`)
- `pnpm e2e:parallel:report-flake:prod` PASS (`4 passed`)
- `pnpm dev --port 3104` 는 Next lock 때문에 완전 기동까지는 못 갔지만, host 선택이 `::` 로 바뀐 것과 `localhost/[::1]/LAN` 안내 출력은 확인했다.

## 남은 리스크
- 현재 셸은 일부 포트 bind에서 `EPERM` 제약이 있어 `pnpm e2e:parallel:classify -- --runs=3 --mode=development ...` 를 이번 라운드 끝까지 재실행하지 못했다.
- 따라서 `reports` dev parallel flake가 완전히 0이 됐다고 단정하진 않는다. 다만 단독 spec과 prod parallel은 모두 PASS다.
- `localhost:3100` 증상은 이미 떠 있는 기존 dev 서버를 재시작해야 새 `::` 기본값이 적용된다.

## 다음 라운드 우선순위
1. 사용 중인 `3100` dev 서버를 재시작한 뒤 Windows 브라우저에서 `http://localhost:3100` 과 `http://<WSL-IP>:3100` 을 둘 다 다시 확인
2. bind 제약이 없는 셸에서 `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3105` 재실행
3. 그래도 `/planning/reports` abort가 남으면 test retry가 아니라 prewarm 또는 compile fan-out 축소로 한 단계 더 좁히기

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
