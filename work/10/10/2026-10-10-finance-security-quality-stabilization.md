# Finance 출시 차단 사항 수정 및 검증 — 2026-10-10

## 판정

- **SECURITY: PARTIAL / BLOCKED** — 고유 GHSA 21건 중 20건, 매칭 25행 중 24행 제거. Critical 3행 모두 제거. 수정 버전 없는 개발 의존성 `braces` High 1건은 남고 공식 감사는 FAIL이다.
- **DATA_FRESHNESS: BLOCKED** — Gov24 공공 지원사업 10,958건을 실제 갱신했다. Finlife 6개 및 환율 1개는 갱신하지 못했다. 7개 만료 예외와 오래된 원본 바이트를 유지했으며 날짜만 변경하지 않았다.
- **TEST_CONTRACTS: PASS** — 리포트 안내 문구, case-006 기한 경고, debug 환경별 접근 계약을 독립 근거로 정정했다. 금융 계산 구현은 변경하지 않았다.
- **RELEASE_GATES: FAIL** — 최종 `release:verify`는 `deps:audit` High 1건에서 exit 1. 별도 `freshness:release`도 FAIL. 후속 출시 게이트 전체 통과를 주장하지 않는다.
- **MITIGATION: PASS 유지** — 최종 빌드 핵심 프로덕션 E2E 24/24, 복구 관련 10개와 저장·재열기·실제 암호화 백업 복원 포함.
- **REMAINING_BLOCKERS** — braces의 공식 수정 또는 검증 가능한 대체, Finlife 정상 JSON 및 환율 유효 원천 자료, 새 빌드의 Windows 실사용 검증. 최초 빈 본문 **ROOT_CAUSE_OPEN**은 별도로 유지한다.

`IMPLEMENTED`, `SOURCE_APPLIED`, 아래 범위의 `TEST_PASSED` 및 WSL 격리 런타임 `RUNTIME_VERIFIED`에 해당한다. `DEPLOYED`, `RELEASE_READY`, `USER_GOAL_COMPLETE`는 아니다. 빈 화면을 FIXED라고 표현하지 않는다.

## 기준선·보존·사용 skill

기준 기록은 `work/10/10/2026-10-10-finance-release-quality-verification.md`와 이전 복구·라우터 조사 기록이다. 원본 main HEAD는 `e296a529f1e3d48c224aee36ca1b9bf65ee0cf44`이다. 기존 미커밋 Dashboard·복구·E2E 변경을 포함한 기준선 SHA를 기록하고 반영 직전 drift를 검사했다. 변경한 14파일 외 보존 대상 24개의 SHA가 동일하다. 이전 실패 trace/독립 재현/성공 증거는 삭제하지 않았다.

사용 skill: Superpowers `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `using-superpowers`, Finance `planning-gate-selector`, `dart-data-source-hardening`, `work-log-closeout`.

기존 `/tmp/finance-autonomy-20261010-d0bd4l_g`의 workspace/state/evidence를 재사용했다. Linux Node 22.22.2, Corepack pnpm 9.15.9, bwrap 파일·PID 격리이며 원본 소스·HOME·사용자 DB를 테스트에 마운트하지 않았다. 공식 외부 조회와 패키지 감사만 네트워크를 허용했다. 필요한 provider 환경값만 메모리로 전달했고 로그는 비밀값을 가렸다. Prisma 스키마/쓰기·복원은 별도 `/state`의 합성 테스트 DB에서만 수행했다.

원본 `node_modules`는 기존 Next 16.2.12를 유지한다. 아래 package/lock 변경의 설치·실행은 격리 사본에서 수행했다. 기존 설치본, 사용자 DB, 백업, 전역 설정은 변경하지 않았다. stage/commit/push/배포/release:prepare를 실행하지 않았다.

## 변경 파일과 이유

| 파일 | 이번 변경 |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | 공식 advisory의 수정 버전으로 최소 범위 갱신 |
| `.data/benefits_snapshot.json` | 공식 Gov24 전 페이지 조회 결과 반영 |
| `config/data-freshness-exceptions.json` | 실제 갱신된 benefits의 만료 예외만 제거 |
| `scripts/warm_if_stale.mjs` | 빈 배열·오류·잘못된 환율/원천 날짜를 새 성공 receipt로 기록하던 결함 수정 |
| `tests/warm-if-stale-env.test.ts` | 잘못된 응답에서 exit 1/이전 파일 바이트 보존, 유효 응답과 env 미설정 계약 |
| `tests/planning-reports-page-fallback.test.tsx` | 의도적으로 변경된 한국어 안내 문구와 기존 링크 계약 반영 |
| `tests/planning-v2/goalDeadline.test.ts` | 독립 현금흐름 계산과 실제 달성/기한 경고 검증 |
| `tests/planning-v2/regression/baseline/case-006.json` | 검증된 `GOAL_MISSED`만 추가, 숫자·generatedAt 불변 |
| `tests/e2e/debug-access.spec.ts` | dev explicit flag 및 dev 403/production 404 실제 화면 계약 |
| `tests/e2e/planning-v2-fast.spec.ts` | 명시적 debug flag에서 JSON 토글 표시 검증; 이전 미커밋 수정 보존 |
| `src/lib/ops/backup/planningOwnerDoctor.ts` | 정상 CSV 거래 ID 16/24자 공통 validator 재사용 |
| `planning/v3/ops/ownerDoctor.test.ts` | 16/24자 호환 및 비정상 ID 거부 회귀 |
| `tests/planning/ops/planning-data-vault-v3-owner-integration.test.ts` | 실제 계좌·CSV·분류 저장 후 export/restore 바이트 동등성 |

복구 컴포넌트·layout·Dashboard·기존 recovery/persistence E2E는 이번 작업에서 변경하지 않았다. 격리 과정의 임시 진단 import는 모두 제거했고 persistence spec SHA가 기준선과 같다. 격리 사본의 선택적 복사 때문에 표시되는 무관한 삭제 파일은 원본에 반영하지 않았다.

## 보안 원문 분석

[advisory-matrix.json](../../local/finance-security-quality-20261010/advisory-matrix.json)에 25행 각각의 GHSA 공식 URL, 현재/변경 버전, 취약 범위, 최초 수정 버전, 직접/전이/개발/런타임 구분과 실제 호출 경로를 기록했다. 고유 21건의 원문 JSON도 같은 증거 폴더 `advisories/`에 보존했다.

| 패키지 | 이전 → 적용 버전 | 실제 사용 경로 |
| --- | --- | --- |
| next / eslint-config-next | 16.2.12 → 16.3.8 | App Router·optimizer·개발 서버 / lint; 이번 advisory 집합의 수정 하한은 16.3.8 |
| sharp | 0.35.3 → 0.35.5 | Next 전이 native 이미지 처리. patched libheif 1.23.5/librsvg 2.63.2 실제 로드·PNG 변환 성공 |
| js-yaml | 4.3.1 → 4.3.2 | 직접 개발 도구 lockfile 감사 및 ESLint 전이 |
| vitest / @vitest/mocker | 4.1.9 → 4.1.11 | 개발 단위·통합 테스트 |
| brace-expansion | 1.1.18/5.0.9 → 1.1.21/5.0.12 | ESLint/minimatch의 glob 처리 |
| fast-uri | 3.1.6 → 3.1.8 | Prisma 개발 도구 → streams → ajv. 그래프 포함과 실제 앱 호출을 구별 |
| source-map-js | 1.2.1 → 1.2.2 | Next/PostCSS·Tailwind·Vite 빌드 |
| baseline-browser-mapping | 취약 2.10.32 제거, 기존 안전 2.11.20으로 통일 | Next/Babel 브라우저 타깃; 안전 버전 다운그레이드하지 않음 |
| braces | 3.0.3 유지 — 미해결 | eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces |

감사 전 Critical 3 / High 12 / Medium 9 / Low 1행, 후 High 1행이다. React 19.2.3은 그대로다.

남은 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)은 `braces <=3.0.3`, 공식 patched version 없음이다. ESLint `settings.next.rootDir` → globSync → brace expansion 경로이며 Finance는 custom rootDir를 설정하지 않는다. 실제 외부 요청이 이 경로에 들어온다는 증거는 없고 최종 standalone에 braces package directory도 없지만, 이 사실을 감사 통과나 모든 내부 코드의 도달 불가능 증거로 확대하지 않는다.

확인한 최신 Next ESLint plugin 16.4.0도 fast-glob 3.3.1을 사용한다. fast-glob/micromatch만 갱신해도 braces 의존은 남는다. brace-expansion/tinyglobby alias 교체는 API·glob 의미가 동등하지 않아 검증된 최소 대안이 아니다. lint 삭제, advisory 무시, 사설 node_modules 패치 없이 BLOCKED로 둔다.

Next advisory별 적용 조건도 분리했다. Finance에 `next/og ImageResponse`, `next/image` 직접 사용, remotePatterns, Pages Router SSG, 루트 catch-all, 해당 metadata route는 발견하지 못했다. WSL Linux 서버 + Windows 브라우저는 Windows-hosted 서버와 다르다. 그럼에도 framework optimizer 내부를 안전하다고 가정하지 않고 수정 버전을 적용했다. 기존 빈 화면 이슈와 보안 패치의 인과관계는 주장하지 않는다.

## 데이터 최신성

8개 원본은 약 109.74일 경과했고 예외 만료는 모두 2026-09-30이었다. 초기 재현용이라는 설명이 있지만 실제 runtime fallback에도 소비되는 저장 자료이므로 순수 테스트 fixture로 간주하지 않았다.

| snapshot | 원본 건수/상태 | 이번 결과 |
| --- | --- | --- |
| benefits | 10,957건 | 공식 Gov24 55/55페이지, 100% 완료, 고유 10,958건 실제 갱신 |
| exchange | rowCount 0, asOf null receipt | 공식 API HTTP 200 JSON `[]`; 유효 환율 없음, 이전 바이트 보존 |
| finlife_deposit | 37 | HTTP 200 HTML, JSON 없음; 보존 |
| finlife_saving | 59 | 동일 실패; 보존 |
| finlife_credit-loan | 24 | 동일 실패; 보존 |
| finlife_mortgage-loan | 32 | 동일 실패; 보존 |
| finlife_rent-house-loan | 40 | 동일 실패; 보존 |
| finlife_pension | 343 | 동일 실패; 보존. 원천 공시 202010/제출 2020-10-31로 수집 시각보다 오래됨 |

benefits generatedAt은 실제 수집 `2026-10-10T09:28:47.889Z`, 내용 SHA `0daafe7c1dcc2e65ca1550f8cb95cf99a014e5d756654ac7d0a18c4dfc89ca8a`이다. 항목 내용 자체가 변경됐고 timestamp만 바꾸지 않았다. 실시간 전체 혜택의 개별 법적 유효성까지 보증하는 것은 아니다.

Finlife 각 sync를 1회씩 실행하고 대표 deposit 응답만 1회 별도 진단했다. 공식 [금융감독원 중단 공지](https://finlife.fss.or.kr/error_kor.html)는 전기설비 점검으로 2026-10-08 18:00~10-10 24:00 전체 홈페이지/금융상품한눈에 중단을 안내한다. 측정 시점과 HTML 응답이 공지와 일치한다. 키가 설정돼 있지만 인증 성공/실패는 판단할 수 없고 공지의 종료 시각은 복구 완료 증거가 아니다.

EXIM은 실행일 토요일에 HTTP 200 빈 배열을 반환했다. 정상 거래일의 날짜가 있는 유효 quote 응답은 확보하지 못했다. 날짜를 추정하거나 이전 영업일로 몰래 변경하지 않았다. 새로운 검증은 모든 row의 성공 상태, 통화, 양수 rate, 유효하고 일치하는 원천 날짜를 요구한다. 날짜 없는 정상 AP01 응답이 별도로 존재한다면 공식 계약을 먼저 확인해야 하며 이번 실행은 그 호환성을 증명하지 않는다.

환율 warm의 수정 전에는 빈 배열/잘못된 응답도 새 generatedAt receipt로 저장해 성공 처리했다. 새 테스트 RED 13개 중 9개 실패를 확인하고, invalid 응답은 exit 1과 파일 바이트 보존으로 수정했다. 유효 dated quote 성공과 env 미설정 skip 계약은 유지한다. HTTP 응답 파싱 오류의 비밀값이 로그에 섞이지 않도록 고정 오류 메시지를 사용한다.

`freshness:release`는 남은 만료 예외에서 FAIL이다. 예외 없는 strict check는 **진단용 별도 실행**이며 1 fresh/7 stale이다. 정책 파일이나 필수 gate를 우회해 PASS로 처리하지 않았다. 금리·한도·상품 조건 6개와 환율은 현재 정확성 확인이 안 되어 출시 차단이다. 남은 7개 snapshot의 SHA는 원본과 동일하다.

## 계약 및 추가 제품 결함의 수정 전후

- **리포트 안내**: RED 6개 중 1개 실패. 10월 7일 `bce4d0e1`의 의도된 문구 변경과 현재 UI를 대조하여 테스트 안내 문구만 변경했다. 제목·empty state·profileId를 유지한 `/planning` 링크 검증을 보존했다. 관련 계약/보안 unit 54 PASS.
- **case-006**: 기존 golden 9개 중 1개 실패. 엔진을 import하지 않는 Python Decimal 50자리 계산으로 `q=1.02^(1/12)`, `F(n)=600000+4100000n−3200000(q^n−1)/(q−1)`를 확인했다. 목표 19,200,000원 대비 18개월 잔액 15,984,218.85원, 부족 3,215,781.15원이다. 22개월 19,165,602.81원, 최초 달성 23개월 19,947,292.78원이므로 18개월 `GOAL_MISSED`가 맞다. 최종 순자산 49,301,222.09원도 독립 검산했다. golden에는 경고 한 개만 추가했다. 이후 9/9 golden 및 공식 개발 E2E 10/10 PASS.
- **debug**: localhost도 개발 + explicit flag일 때만 200; flag 꺼짐은 404, 비로컬 forwarded host는 개발 403, production은 flag와 무관하게 404가 제품/보안 계약이다. production의 실제 not-found HTML 화면을 검증하며 403/404 중 아무 값이나 허용하지 않는다. dev flag off/on 각 2 PASS, production flag on 2 PASS. 초보자 JSON 토글의 flag-on 경로도 실제 3-test run에서 확인했다.
- **추가 백업 제품 결함**: 최초 새 프로덕션 core에서 23 PASS/1 FAIL, 거래 후 backup/export가 HTTP 500이었다. 새 root에서는 단독 백업이 통과했고 거래3→백업1 최소 흐름에서는 재현됐다. 실제 createAccount→CSV import→category override→export unit이 `MANIFEST_V3_SOURCE_SCHEMA_INVALID:v3.transaction-overrides`로 실패했다. CSV ID는 16자, canonical `isTxnId`는 16/24자 모두 허용하지만 backup doctor만 24자로 중복 제한했다. 공통 validator와 trim 불변식 재사용으로 2줄 수정했다. 잘못된 길이·non-hex·공백 ID는 계속 거부한다. 관련 66 PASS, 마지막 실제 파일 복원 동등성 확장 후 6 PASS, 최종 프로덕션 core 24/24 PASS.

임시 Playwright 진단 import의 TS/ESM interop 실패, 첫 private-network native rebuild의 DNS 실패는 검증 도구/환경 실패로 구분하고 증거를 보존했다. 정상 namespace/network 구성의 공식 설치·generate 경로로 해결했으며 금융 계산·복구 실패를 덮어쓰기 위해 기대값을 완화하지 않았다.

## 실제 검증 명령과 범위

모든 제품 실행은 격리 runner 안의 candidate를 대상으로 했다. 정확한 argv/exit/소요시간 67개는 [verification-results.json](../../local/finance-security-quality-20261010/verification-results.json)과 개별 `results/`에 있다. 명령 인자의 파일이 없으면 실행한 것으로 세지 않았다.

| 실제 명령/검사 | 결과와 한계 |
| --- | --- |
| `corepack pnpm deps:audit` 및 최종 `corepack pnpm release:verify` | 각각 FAIL, 최종 공식 release는 audit High 1에서 중단 |
| `corepack pnpm freshness:release --json-output=/evidence/security-quality/freshness-final.json` | FAIL, 7개 expired/stale 자료 유지 |
| `env -u PLANNING_DATA_DIR corepack pnpm run test --maxWorkers=2` | 912 files, **4221 PASS / 4 SKIP**. 기존 핵심 98개는 삭제 없이 99개로 증가 |
| `corepack pnpm planning:v2:regress` | 9 golden PASS 및 개발 fast/full E2E **10 PASS** |
| `corepack pnpm lint` | exit 0, errors 0 / warnings 12. 새 Next lint의 기존 내부 이동 코드 경고; 규칙을 끄지 않음 |
| 변경 warm/debug/goal/backup test와 source `eslint` | delta 및 마지막 통합 test lint PASS |
| 최종 `corepack pnpm typecheck` | PASS |
| `corepack pnpm e2e:release:contracts` | 공식 production build와 release 계약 **14 PASS**, 최종 변경 후 재실행 |
| 최종 `corepack pnpm e2e:pw --runtime production tests/e2e/planning-navigation-recovery.spec.ts tests/e2e/planning-release-persistence.spec.ts tests/e2e/dashboard-current-state.spec.ts tests/e2e/planning-quickstart-preview.spec.ts --workers=1 --retries=0 --trace on --reporter=line --output=/evidence/security-quality-final-production-core-results` | **24 PASS**, 재시도 0 |
| 최종 `corepack pnpm planning:v2:prod:smoke` | PASS, standalone asset·catalog·read-only source 화면·remote 403 |
| 최종 `corepack pnpm planning:v2:desktop:smoke` | PASS, 공식 Linux desktop launcher/session 및 숨김 경계, `--no-open` |
| warm/freshness target | 실제 2파일 **31 PASS**. argv의 존재하지 않는 `tests/fx.test.ts`는 실행 결과로 세지 않음 |
| backup validator/archive/restore/override target | 5파일 **66 PASS** |
| 최종 `vitest run tests/planning/ops/planning-data-vault-v3-owner-integration.test.ts --maxWorkers=1` | **6 PASS**, 실제 writer/restore 바이트 동등성 포함 |

전체 unit 실행은 마지막 backup validator delta 및 baseline-browser-mapping 2.11.20 유지 정정 전이다. 이후 영향 범위의 66개/6개, 최종 typecheck/lint/build/E2E를 실행했다. 최종 소스에서 전체 4,225개를 다시 실행했다고 주장하지 않는다. 네 skip은 desktop-artifact-provenance 2, planningWriterLease 1, planningRuntimeRoot 1이며 PASS로 세지 않는다.

최종 build ID는 **`sjw-O_F1i7CVlfmmpS2oC`**, standalone ID도 같다. Next 16.3.8 / React 19.2.3. package SHA `7f751c7b6fbd23487db03aa974acb6debb25508575133fef6ffba71396d36128`, lock SHA `7878fdcd7c1ebb12eee2967325d003803cfcc2c9e46b4c068e898bd87fc83b81`. 원본 반영 14파일의 SHA가 검증 후보와 같음을 확인했다.

## 브라우저·데이터 보존 증거

최종 24개 trace에서 page exception 0개, console error 12개다. 12개는 명시적인 negative fixture의 400/409/500/503, 요청 abort, crypto digest 오류 주입에 대응한다. 콘솔이 완전히 비었다고 보고하지 않는다. 합성 식별자를 제거한 분류는 [final-production-browser-evidence.json](../../local/finance-security-quality-20261010/final-production-browser-evidence.json)에 있다.

- 복구 재열기 profile/goals/run/report 전후 SHA: `7e06de10fcfa85b4170b22dd07b63eea428d157eace2b02d07b1c4e6e1f2ba1f` 동일, 추가 쓰기 없음.
- 복구 안내 중 저장 1회, reload 확인 취소, 재열기 소득 4,950,000원 유지.
- 실제 암호화 백업 712,222 bytes. restore 후 profile/goals/run/report SHA `e881ae7d9f68b95064d31107cd54505be6dd9573760fc67426bc5d6b27e05baf` 전후 동일.
- 합성 실제 CSV writer의 accounts.json, batch index, batch ndjson, txn override를 export 후 override 내용을 바꾸고 공식 restore했다. committed true, issues 없음, 네 파일 바이트 원상 복원.

[final-data-roundtrip-proof.json](../../local/finance-security-quality-20261010/final-data-roundtrip-proof.json), [source-promotion-proof.json](../../local/finance-security-quality-20261010/source-promotion-proof.json)에 근거가 있다. 원본 사용자 DB를 조회하거나 복원해 얻은 증거가 아니다.

## 남은 차단과 재개 조건

1. `braces` 공식 수정 또는 API/semantics·lint 호환성이 입증된 대체가 필요하다. 현재 승인 범위에서 취약점을 숨기거나 lint를 제거하지 않는다.
2. Finlife 서비스 복구 후 공식 인증 JSON과 원천 공시일을 확보해야 한다. EXIM은 유효한 실제 quote/원천 날짜가 필요하다. 성공 응답 없이 snapshot이나 예외 날짜를 연장하지 않는다.
3. 위 두 차단을 해결한 소스에서 `release:verify` 후속 전체 gate/RC를 완료해야 한다. 이번 release 실행의 중단 이후 단계를 PASS로 추정하지 않는다.
4. 새 dependency/build에 대한 Windows Chrome/네이티브 실사용·설치/업데이트 검증은 이번 작업에서 미실행이다. Linux launcher smoke를 대체 증거로 쓰지 않는다. 기존 Windows 설치본은 바꾸지 않았다.
5. Next 16.2.12에서 관찰한 최초 간헐 빈 본문 근본 원인은 여전히 미확정이다. Next 보안 업데이트나 24회 성공을 근본 원인 해결 증거로 사용하지 않는다.

반복 실패 조건을 다시 조회하는 자동화나 예약 작업은 만들지 않았다. 동일한 실패를 무의미하게 재시도하지 않고 외부/출시 차단을 남긴다. 안전한 로컬 수정은 원본에 반영됐으며 배포·기존 설치본 업데이트는 하지 않았다.

## 증거 위치

- 요약/공식 advisory/독립 검산/원본 반영 SHA: `work/local/finance-security-quality-20261010/`
- 원본 로그 및 trace: `/tmp/finance-autonomy-20261010-d0bd4l_g/evidence/security-quality-*`
- raw 파일의 경로·SHA는 `raw-evidence-manifest.json`. 인증 세션을 포함할 수 있는 trace 원문은 공유용 폴더로 복제하지 않았다.
- 재실행은 기존 bwrap runner의 workspace/state 구조와 source tests를 사용한다. `runners/`는 현재 격리 runner의 안전한 사본이며 다른 디렉터리에서 곧바로 독립 실행되는 배포 패키지는 아니다.
