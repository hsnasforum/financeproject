# 2026-03-11 WSL localhost 최종 복구: IPv4 bind + ::1 bridge

## 변경 이유
- 사용자는 여전히 `http://localhost:3100`이 안 되고 `http://172.20.128.246:3100/`만 된다고 보고했다.
- 이전 `::` bind 시도는 WSL 내부 `localhost`와 `[::1]`은 살렸지만, Windows 측 `localhost` forwarding까지 확실히 보장하진 못했다.
- WSL2에서는 Windows `localhost` forwarding이 IPv4 리스너(`0.0.0.0`/`127.0.0.1`)를 더 잘 따라가므로, 최종 경로는 `0.0.0.0` 유지 + `::1` 보강이 더 안전했다.

## 이번 변경
1. `scripts/next_dev_safe.mjs`
   - WSL 기본 host 후보를 다시 `0.0.0.0 -> 127.0.0.1`로 맞췄다.
   - WSL에서 `0.0.0.0`로 뜨면 `::1:<port> -> 127.0.0.1:<port>` TCP bridge를 추가로 띄우게 했다.
   - 시작 로그에 `[::1]` URL과 bridge 안내를 함께 출력하게 했다.
2. `README.md`
   - WSL에서는 `0.0.0.0` 바인드 + `::1` bridge로 Windows `localhost`와 WSL `localhost`를 같이 지원한다고 안내를 고쳤다.

## 검증
1. `pnpm dev --port 3100 --strict-port`
2. `ss -ltnp | rg ":3100\\b"`
3. `curl http://127.0.0.1:3100`
4. `curl http://localhost:3100`
5. `curl http://[::1]:3100`
6. `curl http://172.20.128.246:3100`
7. `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1`
8. `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3186`
9. `pnpm exec eslint scripts/next_dev_safe.mjs playwright.config.ts`

## 검증 결과
- `pnpm dev --port 3100 --strict-port` 는 `Bind: host=0.0.0.0 port=3100` 으로 올라왔다.
- `ss -ltnp` 기준으로 `0.0.0.0:3100` 에 Next dev, `[::1]:3100` 에 bridge listener가 동시에 떠 있었다.
- `127.0.0.1`, `localhost`, `[::1]`, `172.20.128.246` 네 경로 모두 `200` 응답을 확인했다.
- `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1` PASS
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3186` PASS
- `pnpm exec eslint scripts/next_dev_safe.mjs playwright.config.ts` PASS

## 남은 리스크
- dev shared webpack runtime 로그(`Fast Refresh full reload`, `/planning/reports 500`, `__webpack_modules__[moduleId] is not a function`)는 여전히 남아 있다.
- 다만 이번 라운드 기준으로는 `localhost` 접속 문제와 reports 핵심 흐름 모두 최종 PASS로 닫혔다.

## 다음 라운드 우선순위
1. 필요하면 `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3196` 로 dev runtime 노이즈 재현률을 더 측정한다.
2. PASS 로그 안에 남는 `/planning/reports 500` 과 webpack runtime 오류 시점을 같은 런 기준으로 다시 묶는다.
3. 수동 개발 안내는 `localhost:3100`을 기본으로 유지하고, 외부 기기 확인이 필요할 때만 LAN URL을 보조로 안내한다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
