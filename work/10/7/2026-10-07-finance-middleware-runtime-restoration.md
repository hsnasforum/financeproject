# 2026-10-07 Finance standalone middleware 보호 복구

## 변경 파일

- `middleware.ts` → `src/middleware.ts`: 기존 사용자 구현을 유지하며 Next 발견 위치로 이동, 상대 import 수정.
- `tests/middleware-discovery.test.ts`, `tests/middleware-security.test.ts`: 실제 Next 정적 발견·matcher 추출과 production/인증 회귀 검사.
- `tests/planning/auth/authConfigContract.test.ts`, `tests/planning/deployment/planningDeploymentPolicy.test.ts`: middleware 소스 경로 갱신.
- `package.json`: lint/verify의 사라진 루트 파일 인자 제거. `src` 검사에 새 middleware 포함.
- `scripts/planning_v2_desktop_build.mjs`: 불필요해진 루트 middleware optional copy 제거. 기존 `src` 전체 복사 유지.
- `docs/current-screens.md`, `docs/package-scripts.md`, 이 기록.

## 사용 skill

- finance-skill-routing: 이번 runtime/route 작업에 필요한 최소 스킬 선택.
- planning-gate-selector: 타깃 보안·인증 검사와 격리 build/install/runtime 검증 선택.
- route-ssot-check: production-hidden feedback 및 Ops local-only 계약 확인.
- work-log-closeout: 실제 수정·검증·보존 결과를 한 기록으로 정리.

## 변경 이유

Next 16.2.12의 실제 `next/dist/build/index.js`는 `pagesDir || appDir`의 부모에서 middleware/proxy를 찾는다. 이 저장소는 `src/app`을 사용하지만 구현은 루트에 있어 기존 standalone manifest에 middleware가 등록되지 않았다. 따라서 피드백 관리 페이지 200, HTML 보안 헤더 누락, 비loopback Host의 Ops 정보 노출이 발생했다. Planning route/currentUser의 직접 인증과 사용자 범위 검증은 별도로 존재한다.

기존 middleware convention을 그대로 사용해 `src`로 이동했다. Next 16의 deprecation 경고는 남지만 지원되는 경로이며, Node runtime으로 바뀌는 proxy 전면 마이그레이션은 이번 범위가 아니다. [Next 공식 convention 문서](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)와 설치된 16.2.12 소스·최종 manifest를 대조했다.

## 핵심 변경

- 기존 CSP·보안 헤더·production feedback 404·Ops local-only 정책을 실제 runtime에 연결했다. Next 정적 extractor가 읽지 못하는 `PREFETCH_MATCHER` 참조는 matcher 안의 리터럴과 `satisfies MiddlewareConfig`로 바꿨다.
- `/ops/:path*`, `/api/ops/:path*`도 명시 matcher로 지정했다. `next-router-prefetch` 또는 `purpose: prefetch`를 보내 가드를 건너뛰는 경로를 닫았다. 피드백의 기존 명시 matcher는 유지했다.
- middleware 활성화로 정상 Auth.js 분할 쿠키가 거부되지 않도록 숫자 suffix의 세션 신호를 인식한다. 실제 세션 검증은 기존 route/currentUser가 계속 담당하며 빈 값·유사 이름은 거부한다.
- desktop 무세션 401은 기존 currentUser와 같은 공식 launcher 재실행 안내를 반환한다. 인증 정책, one-shot broker, default identity, writer/data root, OAuth/provider/secret 및 금융·화면 구현은 수정하지 않았다.
- Sol Max `reviewer` 1명을 읽기 전용으로 사용했다. 발견한 직접 회귀를 반영한 최종 정적 리뷰는 명시적 문제 없음. 모든 쓰기·build·package·install·runtime·port·브라우저 검증은 메인이 단독 소유했다.

## 검증

판정: **요청한 A–E 범위 확인됨**. Finance 전체 출시 판정은 아니다.

기준 branch `main`, HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`. 대규모 기존 dirty 상태를 기준으로 별도 해시를 저장했다. 환경은 Linux/WSL, Node 22.23.2, Corepack pnpm 9.15.9, Next 16.2.12다.

### 타깃 검사

- 수정 전 `corepack pnpm exec vitest run tests/middleware-discovery.test.ts`: 실제 발견 위치에 파일이 없어 실패 재현.
- `corepack pnpm exec vitest run tests/middleware-discovery.test.ts tests/middleware-security.test.ts tests/planning/auth tests/planning/deployment/planningDeploymentPolicy.test.ts tests/planning/deployment/planningDesktopBrowser.test.ts tests/planning/deployment/planningDesktopSessionServer.test.ts tests/planning/deployment/planningDesktopEnvironment.test.ts tests/security-route-capability-matrix.test.mjs tests/dev-local-request.test.ts --maxWorkers=2`: **23파일 339개 PASS**.
- 최종 쿠키 회귀·타입 명시 반영 후 `corepack pnpm exec vitest run tests/middleware-discovery.test.ts tests/middleware-security.test.ts`: **2파일 44개 PASS**. 위 결과와 중복되는 테스트를 별도 총합으로 세지 않았다.
- `corepack pnpm exec eslint src/middleware.ts tests/middleware-discovery.test.ts tests/middleware-security.test.ts tests/planning/auth/authConfigContract.test.ts tests/planning/deployment/planningDeploymentPolicy.test.ts scripts/planning_v2_desktop_build.mjs`: PASS. 마지막 테스트 타입 변경 후 앞의 3파일 lint도 PASS.
- `node --check scripts/planning_v2_desktop_build.mjs`: PASS.
- `corepack pnpm planning:user-scope:check`: **15파일 94개 PASS**.
- `corepack pnpm planning:ssot:check`: guard 및 **5파일 11개 PASS**.
- `corepack pnpm sec:check`: PASS. route scanner `devRoutes=38`, `opsRoutes=39`, `prodHiddenPages=7`, `mutationMethods=133`, `classified=133`.
- 초기 sandbox 실행은 loopback `EPERM` 및 child-process 출력/산출물 관련 24개 실패가 있었다. 승인된 격리 테스트를 sandbox 제한 밖에서 실행한 위 결과는 모두 통과했다. assertion·guard를 완화하지 않았다.

### 격리 build/package/install

증거 디렉터리: `/tmp/finance-middleware-20261007-u52o0ol0`. `candidate`, `artifact`, `installed`, `runtime-state`를 분리했으며 원본 `.next`와 기존 검토 설치를 빌드 대상으로 쓰지 않았다.

- `candidate`에서 `corepack pnpm build`: 최종 compile·TypeScript·254개 페이지 생성·standalone 생성 PASS. 로그 `build-matched.log`.
- 사본 준비 중 잘못된 cwd로 동기화가 실패해 시작된 준비 빌드는 중단했다. 이후 첫 완주 빌드의 소스 대조에서 기존 `.gitignore`의 `coverage/` 규칙에 걸린 `src/app/api/dev/benefits/coverage/route.ts` 누락을 찾았다. 원본은 변경하지 않고 사본에 포함해 위 최종 빌드를 수행했다. 제품·운영 소스 **1,807개 hash 일치, drift 0**.
- `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=/tmp/finance-middleware-20261007-u52o0ol0/artifact`: PASS. 공식 패키저에는 원본 Git metadata의 읽기 경로만 제공했다. manifest의 Git SHA는 기반 commit이며 미커밋 결과 전체의 commit ID로 표현하지 않는다.
- `corepack pnpm planning:v2:desktop:install -- --from=/tmp/finance-middleware-20261007-u52o0ol0/artifact --to=/tmp/finance-middleware-20261007-u52o0ol0/installed --skip-install --skip-shortcuts`: PASS. checksum 검증 **40,931파일**, `preserved=0`. 의존성 다운로드·바로가기 설치 없이 새 설치 내부 SQLite만 준비했다.
- build → standalone → artifact → installed의 middleware manifest·실행 bundle·BUILD_ID·middleware source hash가 모두 일치한다. 근거 `artifact-registration.json`.

등록 근거:

```text
middleware-manifest.json: middleware["/"]
sortedMiddleware: ["/"]
files: server/edge-runtime-webpack.js, server/src/middleware.js
matcher count: 5
manifest SHA-256: 93ed55b41979b1ac76328681f5216de1f53eed83443fe3eece871553fbecc79c
BUILD_ID: rqFxEHTRTUvu4EAqn8aGl
```

### standalone HTTP·desktop 인증

`python3 /tmp/finance-middleware-20261007-u52o0ol0/runtime-check.py`가 새 설치의 공식 launcher를 production/standalone, loopback 3417에서 실행했다. 정상 launcher에는 E2E 세션 토큰·OAuth/secret을 주입하지 않았으며 독립 XDG data root와 새 설치 DB를 사용했다. HTTP **21개 검사 PASS** (`http-results.json`).

| 요청 | 실제 결과 |
| --- | --- |
| `/feedback/list` | 404 |
| `/feedback/middleware-check-id` | 404 |
| `/api/feedback/list` | 404 유지 |
| 위 3개 경로 + 두 종류 prefetch 헤더 | 모두 404 |
| `/planning` | 200, CSP·X-Frame-Options DENY·nosniff·Referrer-Policy 및 나머지 보안 헤더 확인 |
| HTML nonce | CSP nonce와 실제 script nonce 일치, unsafe-inline/eval 없음 |
| 비loopback Host `/ops/about` | 403, dataDir 노출 없음 |
| 동일 Host + 두 종류 prefetch 헤더 | 모두 403 |
| 무세션 `/api/planning/v2/profiles` | 401, desktop 재실행 안내 |
| 무세션 `/api/settings/backup/status` | 401 |
| `/api/dev/doctor`, `/dev`, `/debug/unified`, `/dashboard/artifacts` | 모두 404 |

- 동일 정상 launcher에 외부 앱 URL을 연결해 `corepack pnpm e2e:pw tests/e2e/planning-desktop-auth.spec.ts --runtime=production --workers=1 --retries=0 --output=/tmp/finance-middleware-20261007-u52o0ol0/browser-results`: **3 PASS**. 사전 쿠키 주입 없이 정상 bootstrap, fresh browser 2회, dashboard/planning 진입·hydration·reload·보호 API 200·default identity·nonce 재사용 403, 무세션 복구·signin bookmark 복구를 확인했다.
- 브라우저는 WSL Chromium. 1440px dashboard와 390px planning viewport 캡처를 직접 열어 확인했다. 외부 데이터 자격 증명을 넣지 않은 새 데이터 공간의 일부 보조 정보 미확인 안내는 성공한 live 동기화로 표현하지 않는다.
- `corepack pnpm planning:v2:desktop:smoke -- --app-dir=/tmp/finance-middleware-20261007-u52o0ol0/installed --port=3418 --timeout-ms=90000`: **PASS**. 별도 임시 DB/root에서 bootstrap 재발급, 보호 API, profile/run/report/export 및 production-hidden 경계를 확인했다.
- 정상 runtime 로그의 `UntrustedHost=0`, `MissingSecret=0`. 세션 token/cookie/one-shot URL은 결과에 기록하지 않았다. 소유 launcher만 종료했으며 **3417·3418 포트 종료 확인**.

### 기존 변경 보존

- 기준 소스 **4,488개**(Git 대상 4,487개 + 위 ignored route) 대조에서 이번 범위 밖 변경 **0개**.
- 기존 환경 파일·DB·검토 설치 manifest 등 보호 파일 **23,468개 hash 모두 일치**. HEAD·Git index도 일치한다. 근거 `preservation.json`.
- `corepack pnpm worktree:scope -- <이번 변경 경로>` 및 scoped `git diff --check`: PASS. `.codex`, AGENTS, multi_agent 지침, lockfile, 기존 인증·browser handoff·writer/data root 구현을 보존했다.
- stage·commit·push·deploy·release 및 기존 설치본 업데이트는 하지 않았다.

## 남은 리스크

- **미실행 검증:** 이번 라운드의 실제 Windows Chrome 자동 열기/WSL handoff 재실행, Windows 네이티브 설치, 실제 OAuth 로그인, live 외부 API, 전체 RC/release·원격 CI. WSL browser handoff 코드는 변경하지 않았고 관련 타깃 회귀 검사는 통과했다.
- Next middleware convention deprecation 및 Node engines 22.22.2 대비 실행 Node 22.23.2 경고는 남는다. convention/Node 업그레이드는 이번 범위가 아니다.
- 기존 설치본은 의도적으로 보존했으므로 그 설치본의 미등록 middleware가 자동으로 복구되지는 않는다. 이번 성공 근거는 수정 소스로 만든 위 독립 설치본이다.
- 일반 API prefetch는 기존 matcher와 route 인증·local guard를 유지한다. 이번에 prefetch에서도 명시 보호한 표면은 feedback 및 Ops다.

## 다음 라운드

이번 A–E 검증 범위의 필수 잔여 항목은 없다. 기존 설치 반영·정식 릴리스·실제 Windows 재검증은 별도 요청과 승인 범위에서 진행한다. 임시 증거와 패키지는 위 `/tmp` 경로에 있으며, 테스트 서버는 종료했다.
