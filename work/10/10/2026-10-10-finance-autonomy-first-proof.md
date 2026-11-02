# Finance 자율 개발·검증 1차 실증 — 프로덕션 간헐 실패 미해결

## 결과

최종 상태: **NOT_COMPLETE**. 개발 모드의 핵심 흐름과 회귀 검증은 통과했습니다. 프로덕션에서는 최초 핵심 E2E가 페이지 전환 후 본문 부재로 실패했으며, 같은 소스의 재실행은 통과했습니다. 원인이 미확정이므로 최초 실패를 해결됨/PASS로 재분류하지 않습니다.

기준: 2026-10-10 KST, WSL Ubuntu `/home/xpdlqj/code/finance`, `main`, HEAD `e296a529f1e3d48c224aee36ca1b9bf65ee0cf44`. 시작 시 clean. Git 게시·전역 설정·사용자 DB 변경 없음.

## 변경 파일

- `src/components/DashboardClient.tsx`: 기본 닫힌 보조 도구의 다섯 조회를 첫 펼침까지 지연. 닫기/재열기로 요청을 반복하지 않는 sticky 상태. 기존 provider/cache/부분 실패/timeout/unmount 취소 보존.
- `tests/e2e/dashboard-current-state.spec.ts`: 닫힌 패널 요청 없음, 첫 펼침의 데이터 표시, 부분 실패 상세, 재열기 중복 요청 없음 검사 2개 추가. 외부 공급자 성공/503은 이 두 검사에서만 fixture 응답.
- `tests/e2e/planning-quickstart-preview.spec.ts`: 실제 page close/newPage 후 저장 리포트와 프로필 복원, API 전체 profile 동등성, 빈 목표 유지, 선택 프로필/입력값, 실행 기록 수 불변, 모든 새 page의 console.error/pageerror 수집 강화. 저장·계산 API 응답은 실제 앱을 사용.
- 이 종료 기록 및 Git 제외 `work/local/finance-autonomy-20261010-d0bd4l_g/`: 명령/종료 코드, 실패 로그·trace, 최종 화면, 합성 입력의 저장 결과, 소스 해시 보존.

## 사용 skill

- `superpowers:using-superpowers`
- `superpowers:systematic-debugging`: 최초 console 오류와 프로덕션 본문 누락을 별도 원인으로 추적.
- `superpowers:test-driven-development`: 확장 E2E RED → 제품 수정 → GREEN. 실패 기대값이나 테스트 삭제 없음.
- `superpowers:verification-before-completion`: 실제 종료 코드·실행 수·최종 소스 해시를 대조하고 미해결 실패를 유지.
- `superpowers:dispatching-parallel-agents`: 독립 읽기 전용 환경/흐름 조사·검토. 동시 하위 최대 2명, 서버·DB·build는 메인 단일 소유.
- `playwright`, `planning-gate-selector`, `dart-data-source-hardening`, `work-log-closeout`.
- route skill과 prefetch 문서는 미해결 navigation 조사 자료로 읽었으며 route/href/prefetch 설정은 수정하지 않았습니다.

## 변경 이유와 핵심 변경

닫힌 대시보드 보조 패널이 자격 증명이 없는 환율·혜택 API를 미리 호출하여 핵심 진단 흐름에서 console 400 오류 4개가 발생했습니다. 사용자가 실제로 보조 도구를 펼칠 때 기존 조회를 수행하도록 변경했습니다. credential missing만으로 차단하면 기존 유효 cache를 가리므로 API/환경 판정은 바꾸지 않았습니다. 보조 도구를 열고 공급자가 실패하는 경우의 명시적 partial 안내는 유지합니다.

## 실행 환경과 안전 경계

- Codex 자체 정책은 `danger-full-access / never`이며 변경하지 않았습니다. 전체 에이전트 권한이 제한됐다고 주장하지 않습니다.
- 빌드·DB·브라우저·테스트는 `bwrap --unshare-all --new-session --die-with-parent --clearenv`의 mount/PID/user/network 격리에서 실행했습니다. 원본 프로젝트·사용자 HOME·Windows 드라이브·사용자 DB는 내부에 mount하지 않았습니다. 외부 네트워크는 차단하고 namespace 내부 127.0.0.1만 사용했습니다.
- source snapshot과 기존 node_modules 사본을 사용했으며 원본의 .env/DB/.data를 복사하지 않았습니다. 생성물은 task scratch 내부입니다.
- Node v22.22.2 공식 Linux archive의 SHA256 `88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a`를 공식 SHASUMS와 대조하고 task scratch에만 설치했습니다. pnpm 9.15.9/Corepack은 기존 캐시 사본, 재설치·전역 변경 없음.
- SQLite native ABI와 private loopback 확인. dev DB는 `file:/state/database/finance.db`; production wrapper는 매 실행의 private `/tmp/finance-full-e2e-*/database/finance.db`를 생성. Planning 저장 root도 매 E2E 별도 생성. 공식 writer/launcher와 안전 wrapper를 사용했습니다.
- Vitest 최초 기동은 격리 내부 localhost 이름 해석 누락으로 실패. task 전용 hosts 파일을 `/etc/hosts`에 read-only mount하여 해결했으며 호스트 설정은 변경하지 않았습니다.
- 설치본·운영 DB·실제 계정·외부 데이터 동기화는 실행하지 않았습니다. trace 보존 사본의 임시 테스트 세션 cookie는 마스킹했습니다.

## 검증 결과

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 제한된 테스트 실행 및 사용자 데이터 분리 | PASS | bwrap preflight, 별도 SQLite/Planning root, 원본 경로 비노출 |
| 개발 모드 핵심 및 선택 회귀 E2E | PASS | 최종 11/11, exit 0, retries 0 |
| 단위 테스트 | PASS | 8 files, 98/98, exit 0 |
| 변경 파일 ESLint | PASS | exit 0 |
| typecheck | PASS | exit 0 |
| production build | PASS | exit 0 |
| 입력/목표/계산 검증 | PASS | 320만원−170만원=150만원, 1천만원/12개월 올림=833,334원 preview; 입력 목표 1개; 목표 달성 1/1; 기한 후 달성 HTML export 회귀 |
| 저장·새로고침·탭 종료/새 탭 재열기 | PASS | 전체 profile 동등성, 목표 이름/금액/개월 유지, 삭제 후 goals=[], 선택 profile/수입/지출 유지, run IDs 불변 |
| 핵심 흐름 console/pageerror | PASS인 실행 확인 | 개발 최종 및 production 성공 실행에서 오류 배열 []; optional provider failure 검사는 별도 |
| 프로덕션 흐름 안정성 | FAIL / 미해결 | 최초 4개 중 1개 실패. 변경 없는 단독 재실행 1/1 및 3회 반복 12/12 통과. 최초 본문 누락의 근본 원인 미확정 |
| 외부 live 공급자·Windows 설치본·전체 release suite | NOT_TESTED | 이번 격리 로컬 실증 범위 밖 |
| 운영 확대 | BLOCKED | 프로덕션 간헐 navigation 실패 해소 필요 |

## 실패와 수정 이력

1. 기존 quickstart E2E 1/1 PASS였으나 console/새 page 재열기 검증이 부족했습니다.
2. 확장 E2E RED: 저장/재열기/목표 검사는 통과했지만 마지막 strict console 검사에서 400 오류 4개로 exit 1.
3. lazy 보조 패널 RED 2/2: 닫혀 있어도 exchange/benefits 요청이 이미 발생해 exit 1.
4. DashboardClient를 첫 펼침 조회로 수정. 핵심 E2E와 성공 fixture는 PASS. 부분 실패 검사는 기존 닫힌 경고 details를 열지 않아 FAIL. 실제 summary 클릭을 추가하고 가시성 기대값은 그대로 유지.
5. Vitest 최초 환경 FAIL(localhost EAI_AGAIN) → 격리 hosts 매핑 추가 → 98 PASS.
6. 최종 dev 회귀 11 PASS, lint/typecheck/build PASS.
7. production 최초 4개 중 보조 성공/부분 실패/인증 헤더 거부 3 PASS, 핵심 1 FAIL. 리포트 새 탭 재열기까지 성공 후 `/dashboard`의 재무진단 링크를 클릭하면 `/planning` 레이아웃의 배너만 나타나고 본문/정상 loading UI가 없었습니다. assertion timeout 위치는 `planning-quickstart-preview.spec.ts:325`입니다. 실제 navigation RSC는 HTTP 200, 해당 시점 pageerror/console error 이벤트는 trace에서 발견되지 않았습니다.
8. production 사전 조회 중단 대조 1 PASS, 전 요청 그대로 전달 대조 1 PASS. 두 대조 모두 Playwright routing이 timing/HTTP cache에도 영향을 주므로 prefetch 원인이라고 확정할 수 없습니다. 실험은 sandbox test 사본에만 적용한 후 원본 test로 복원했고 제품 설정에 반영하지 않았습니다.
9. 원본 test 그대로 production 단독 1 PASS, 원래 4개를 3회 반복하여 12 PASS. 간헐 실패를 미해결로 보존합니다. 일시 통과를 수정 증거로 사용하지 않습니다.

## 명령과 종료 코드

아래 모든 제품 실행은 task runner 내부에서 수행했습니다. 명령 앞의 runner는 해당 snapshot/state/tools가 존재하는 현재 작업용이며, 경로만 바꿔 사용자 worktree에서 실행하면 동일한 격리를 보장하지 않습니다. 원문 로그와 기계 판독 가능한 결과는 `work/local/finance-autonomy-20261010-d0bd4l_g/evidence/`에 있습니다.

### sandbox-preflight

종료 코드 `0`, 실행 시간 `0.46초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py sandbox-preflight node -e 'const fs=require('"'"'node:fs'"'"'); const cp=require('"'"'node:child_process'"'"'); const net=require('"'"'node:net'"'"'); if(process.version!=='"'"'v22.22.2'"'"')throw Error('"'"'wrong node'"'"'); for(const p of ['"'"'/home/xpdlqj'"'"','"'"'/mnt/c'"'"','"'"'/workspace/finance/.env'"'"','"'"'/workspace/finance/.env.local'"'"','"'"'/workspace/finance/prisma/dev.db'"'"']){if(fs.existsSync(p))throw Error('"'"'unexpected host path: '"'"'+p)} const Database=require('"'"'better-sqlite3'"'"');const db=new Database('"'"':memory:'"'"');console.log('"'"'SQLITE_ABI_OK'"'"',db.prepare('"'"'select 1 as ok'"'"').get());db.close();console.log('"'"'NODE'"'"',process.version);console.log('"'"'PNPM'"'"',cp.execFileSync('"'"'corepack'"'"',['"'"'pnpm'"'"','"'"'--version'"'"'],{encoding:'"'"'utf8'"'"'}).trim());const server=net.createServer(s=>s.end('"'"'ok'"'"'));server.listen(0,'"'"'127.0.0.1'"'"',()=>{net.connect(server.address().port,'"'"'127.0.0.1'"'"').on('"'"'data'"'"',d=>{console.log('"'"'PRIVATE_LOOPBACK'"'"',d.toString());server.close()})});'
```

### database-prepare

종료 코드 `0`, 실행 시간 `1.64초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py database-prepare corepack pnpm prisma:db:push
```

### e2e-baseline

종료 코드 `0`, 실행 시간 `39.26초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-baseline corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts --grep 'planning quickstart previews before applying beginner draft' --workers=1 --retries=0 --reporter=line,json --output=/evidence/e2e-baseline-results
```

### e2e-expanded-red

종료 코드 `1`, 실행 시간 `44.1초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-expanded-red corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts --grep 'planning quickstart previews before applying beginner draft' --workers=1 --retries=0 --reporter=line --output=/evidence/e2e-expanded-red-results
```

### e2e-lazy-red

종료 코드 `1`, 실행 시간 `25.34초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-lazy-red corepack pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --grep 'dashboard secondary tools load on first expansion' --workers=1 --retries=0 --reporter=line --output=/evidence/e2e-lazy-red-results
```

### e2e-target-green

종료 코드 `1`, 실행 시간 `57.65초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-target-green corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/dashboard-current-state.spec.ts --grep 'planning quickstart previews before applying beginner draft|dashboard secondary tools load on first expansion' --workers=1 --retries=0 --reporter=line --output=/evidence/e2e-target-green-results
```

### unit-regression

종료 코드 `1`, 실행 시간 `0.55초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py unit-regression corepack pnpm exec vitest run tests/dashboard-view-model.test.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning-v2-api/create-run-persistence.test.ts tests/planning-v2/simulateMonthly.test.ts tests/planning-v2/goalDeadline.test.ts
```

### unit-regression-hosts

종료 코드 `0`, 실행 시간 `1.77초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py unit-regression-hosts corepack pnpm exec vitest run tests/dashboard-view-model.test.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning-v2-api/create-run-persistence.test.ts tests/planning-v2/simulateMonthly.test.ts tests/planning-v2/goalDeadline.test.ts
```

### eslint-changed

종료 코드 `0`, 실행 시간 `3.1초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py eslint-changed corepack pnpm exec eslint src/components/DashboardClient.tsx tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/dashboard-current-state.spec.ts
```

### e2e-regression-green

종료 코드 `0`, 실행 시간 `104.9초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-regression-green corepack pnpm e2e:pw tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/dashboard-current-state.spec.ts tests/e2e/flow-history-to-report.spec.ts --grep 'planning quickstart previews before applying beginner draft|dashboard secondary tools load on first expansion|planning arrival with profileId|planning quickstart keeps review fallback|dashboard aligns the current profile plan|dashboard rerun double click|dashboard missing snapshot rerun|planning runs and reports pages render|planning reports preserve late goal achievement|planning report detail reads as a saved-result' --workers=1 --retries=0 --reporter=line --output=/evidence/e2e-regression-green-results
```

### typecheck

종료 코드 `0`, 실행 시간 `37.59초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py typecheck corepack pnpm typecheck
```

### build

종료 코드 `0`, 실행 시간 `179.96초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py build corepack pnpm build
```

### e2e-production

종료 코드 `1`, 실행 시간 `22.26초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-production corepack pnpm e2e:pw --runtime production tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/dashboard-current-state.spec.ts --grep 'planning quickstart previews before applying beginner draft|dashboard secondary tools load on first expansion|production desktop session rejects raw identity headers' --workers=1 --retries=0 --reporter=line,/evidence/evidence-reporter.cjs --output=/evidence/e2e-production-results
```

### e2e-production-prefetch-probe

종료 코드 `0`, 실행 시간 `13.42초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-production-prefetch-probe env AUTONOMY_EVIDENCE_LABEL=production-prefetch-probe corepack pnpm e2e:pw --runtime production tests/e2e/planning-quickstart-preview.spec.ts --grep 'planning quickstart previews before applying beginner draft' --workers=1 --retries=0 --reporter=line,/evidence/evidence-reporter.cjs --output=/evidence/e2e-production-prefetch-probe-results
```

### e2e-production-prefetch-control

종료 코드 `0`, 실행 시간 `13.75초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-production-prefetch-control env AUTONOMY_EVIDENCE_LABEL=production-prefetch-control corepack pnpm e2e:pw --runtime production tests/e2e/planning-quickstart-preview.spec.ts --grep 'planning quickstart previews before applying beginner draft' --workers=1 --retries=0 --reporter=line,/evidence/evidence-reporter.cjs --output=/evidence/e2e-production-prefetch-control-results
```

### e2e-production-reproduce

종료 코드 `0`, 실행 시간 `19.39초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-production-reproduce env AUTONOMY_EVIDENCE_LABEL=production-reproduce corepack pnpm e2e:pw --runtime production tests/e2e/planning-quickstart-preview.spec.ts --grep 'planning quickstart previews before applying beginner draft' --workers=1 --retries=0 --reporter=line,/evidence/evidence-reporter.cjs --output=/evidence/e2e-production-reproduce-results
```

### e2e-production-repeat

종료 코드 `0`, 실행 시간 `50.74초`.

```sh
python3 /tmp/finance-autonomy-20261010-d0bd4l_g/run.py e2e-production-repeat env AUTONOMY_EVIDENCE_LABEL=production-repeat corepack pnpm e2e:pw --runtime production tests/e2e/planning-quickstart-preview.spec.ts tests/e2e/dashboard-current-state.spec.ts --grep 'planning quickstart previews before applying beginner draft|dashboard secondary tools load on first expansion|production desktop session rejects raw identity headers' --repeat-each=3 --workers=1 --retries=0 --reporter=line,/evidence/evidence-reporter.cjs --output=/evidence/e2e-production-repeat-results
```

## 남은 리스크와 다음에 필요한 작업

- **프로덕션 최초 빈 본문은 미해결입니다.** 현재 근거는 Planning layout은 도착했지만 child가 없었다는 trace이며, 자동 prefetch/라우터 상태 결합은 가설입니다. 의존성 업그레이드, prefetch 전역 차단, timeout 연장, hard navigation 우회는 근거 없이 적용하지 않았습니다.
- 다음 검증은 같은 production build에서 정상/실패 navigation Flight의 child payload·router state·prefetch 순서를 비교하여 결정적인 최소 재현을 만드는 것입니다. 재현 후 해당 원인만 수정하고 동일 core E2E와 navigation 회귀를 다시 실행해야 합니다.
- Next 공식 문서의 [prefetch 설명](https://nextjs.org/docs/app/guides/prefetching)은 prefetch가 production에서 활성화되고 RSC payload를 경로 단위로 저장하는 일반 동작의 참고 근거입니다. 이번 실패의 원인을 입증하는 자료는 아닙니다.
- 저장 결과는 합성 입력 및 기본/fixture 가정으로 확인했습니다. live 금융 데이터 정확성, 전체 금융 엔진의 모든 경우, 전체 제품 무회귀를 주장하지 않습니다.
- 페이지/탭 재열기는 검증했고 OS 재부팅, 브라우저 프로세스 재시작, Windows 설치본 업그레이드/복원은 미검증입니다.
- `source-sandbox-hashes.json`에서 변경 3파일과 package/lockfile의 원본/검증 사본 SHA256 일치를 확인했습니다. Git stage/commit/push/배포는 수행하지 않았습니다.
