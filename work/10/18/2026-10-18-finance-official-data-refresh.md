# 2026-10-18 Finance 공식 데이터 갱신 1단계 (격리 수집·품질 검증·실제 DB 쓰기 준비)

## 현재 상태 (지피티 1호, 2026-10-19 07:25 KST cutoff = 잔여 보완 격리 검사 완료, 최종 원본 검증·게시 전)
- 기준 local HEAD는 37391e29(parent 5fda7dd8), branch checkpoint/finance-review-20261011, 원격 마지막 확인은 901091c8입니다. 아래 상태·계획은 표시된 시점의 기록입니다.
- source B125의 원본 DB 정상 sync·공식 snapshot 7개 승격은 보존하며 이번에는 재수집·DB 갱신을 하지 않습니다.
- snapshotTtlSec 누락·빈값·공백은 정책 2일을 적용하고 명시 60초·clamp·invalid 계약과 공유 rows 파서는 유지했습니다.
- stdout/stderr별 tail로 경고를 감지합니다. .data 누락은 build/artifact-final에서 실패하며 source-input의 runtime 자료는 스캔·삭제하지 않습니다.
- 실제 격리 W 회귀: 수정 전 15개 중 9 FAIL/6 PASS(exit1), 수정 후 8파일 72 PASS/기존 2 SKIP(exit0). W ESLint·정식 tsc --noEmit --incremental false exit0. 원본 Vitest/fulltest/release:verify는 실행하지 않았습니다.
- 136 여정 원시 30 step은 명시 PASS24/FAIL1/기타5입니다. 29개 PASS assertion이 아닙니다. benefits:snapshot-not-stale 당시 exit1 및 옛 report/helper/실패 로그는 보존했습니다.
- 승인 loader의 비밀값은 메모리에서만 대조했습니다. 기존 build production 41 적중파일·artifact189·install188은 환경 없는 W 대응 파일과 바이트 동일했습니다. 긴 값은 고유 2파일·18쌍(이름 중복 제거 후)이며 모두 이전 dev-cache입니다. 22 env 이름행·11 고유 raw값이고 인코딩 변형은 별도로 대조합니다.
- 숫자 전체 면제는 없습니다. 엄격 경로 대조에서 compiler cache 1파일 미대응은 보존하고 공개 고정 문맥·배포 경계를 별도 확인합니다. 이전 dev static의 미대응 숫자 문맥은 현재 production 제공·trace·Git과 구분하며 과거 외부 노출이 없었다고 주장하지 않습니다. .next/dev/cache를 수동 삭제하지 않으며 옛 f2 hits52/exit1은 FAIL 기록 그대로입니다.
- 합성 회귀 5개는 동일 숫자의 새 파일·새 문맥·긴 가짜 키·반복 적중을 거부했습니다. 새 결과에는 실제 값·변수명·해시·적중 경로·snippet을 기록하지 않습니다.
- 변경 파일은 TTL route, next_build_safe.mjs, standalone_privacy_gate.mjs/.d.mts, tests/benefits-search-default-ttl.test.ts, tests/standalone-privacy-gate-regressions.test.ts와 이 기록, 정확히 7개입니다.
- 이 cutoff 이후 기록을 재작성하지 않고 일반 후속 commit → 그 HEAD의 원본 build/typecheck/PW tsc → 새 B125 논리 DB 사본·Planning root로 공식 one-shot 브라우저 → HEAD/public9 artifact·새 설치·managed 2 starts → 비밀 귀속·보호 검증 순서로 진행합니다. 모두 통과할 때만 승인된 정확 branch로 일반 push합니다. 최신 CI·독립 review는 마스터 후속입니다.
- 최종 child exit·HEAD/원격 SHA·실행 결과와 제한은 commit 밖 tmp/finance-final-close-20261019/REPORT.md와 FINAL-RESULT.json에 기록합니다. 이 cutoff는 최종 원본 build/runtime/artifact/push/CI PASS 증거가 아닙니다.
- 기존 work10/10 +12·work10/12·DB·개인 scenario·env·기존 tmp/untracked를 보호합니다. 설치본 CONFIG를 live 성공으로 표현하지 않습니다.


## 이전 상태 기록 (클로드 1호, 2026-10-19 06:20 KST cutoff — 당시 보완 직후이며 현재 상태는 위 절 참조)
- local commit `5fda7dd876fa5661be4d06dfee7d9c2e3c4c5597`(parent `901091c8`, 공식 데이터·FX·카탈로그·패키징 28개 경로)은 push 전입니다.
- 그 HEAD의 원본 production build는 exit 0이었지만, 새 `.next`의 trace·standalone 감사에서 실제 `.env`·`.env.local`·`dev.db`·tmp private DB 사본이 포함되어 FAIL했습니다(130, `tmp/finance-final-20261019/REPORT-02.md`). 아래 "최종 source build 개인정보 포함 차단" 절이 그 원인과 보완입니다.
- 보완은 격리 W에서만 검증했습니다. 원본 재build·원본 runtime·브라우저·desktop artifact·push·CI는 이 기록 commit 이후 단계이며 아직 PASS가 아닙니다. 그 결과는 commit 대상이 아닌 `tmp/finance-privacy-final-20261019/`에 남깁니다.
- 원본 `.next/standalone`에는 130 build의 민감 사본(`.env`, `.env.local`, `dev.db` 등)이 아직 있습니다. Git 대상이 아니며, 원본 재build가 Next의 standalone 재생성으로 그 생성물만 교체합니다.
- 만료 시각은 아래 04:20 기록과 같습니다(환율 receipt 2026-10-19T12:10Z).

## 이전 상태 기록 (클로드 1호, 2026-10-19 04:20 KST cutoff = source B 125 완료 직후)
- **원본에 반영된 것**(아래 "source B 실행과 공식 snapshot 승격" 절, 원시 증거 `tmp/finance-source-refresh-20261019/`)
  - 원본 `dev.db`: 정식 `finlife:sync`로 공식 상품 테이블만 갱신(상품 217·옵션 663·provider 19). 개인·비대상 보호 집합 불변.
  - 비공개 backup: `/home/xpdlqj/code/finance-private-backups/20261019-20261018T191226Z/`(Git 밖, 0700/0600).
  - 원본 `.data` 공식 snapshot 7개 승격(FinLife 5, 혜택 1, 환율 receipt 1). 정식 freshness strict 9/9 fresh.
  - 원본 build 전 E2 보호(123): standalone과 root의 `scenarios/overrides.json` 두 파일이 바이트 동일하여 보존 사본이 필요 없었습니다. 원본 전체 `tsc --noEmit --incremental false`는 exit 0이었습니다(123, 이 기록 commit 전 소스 기준).
  - 다른 작업자 변경의 교차 리뷰: FX credential 로그 마스킹(GPT 119, 리뷰 122 PASS), restart helper 단언 보완(GPT 124, 리뷰 128 PASS).
- **아직 실행하지 않은 것**: 원본 production build, 원본 runtime·브라우저 확인, desktop artifact, commit/push, CI. 이 기록의 commit 이후 최종 통합 증거는 HEAD가 바뀌지 않도록 `tmp/finance-final-20261019/REPORT.md`(commit 대상 아님)에만 남깁니다.
- **만료 시각**: 환율 receipt 2026-10-19T12:10Z, FinLife 2026-10-21T19:12Z, 연금 2026-10-21T18:55Z, 혜택 2026-10-25T11:12Z. 그 뒤의 build·release·push는 freshness gate에서 막히므로 해당 원천을 정식 경로로 다시 수집해야 합니다.
- **소스에 반영된 미커밋 변경**(검증 범위는 각 절 참조):
  - 카탈로그 미준비 상태, 환율 계산기의 EXIM 쌍 호환과 날짜 미지정 정책(클로드)
  - 공개 snapshot 패키징(GPT)과 그 runtime 보완 2건(클로드, 아래 "runtime marker·runtime 기록 보존")
  - FX credential 로그 마스킹(GPT 119: `fetchExternal.ts`, `exchange.ts`, `fx.ts`, `tests/fetch-external-redaction.test.ts`, `tests/fx-credential-redaction.test.ts`)
- **정정(115/116의 잘못된 전제 철회)**: 저는 107·115에서 "production 앱이 scenario 설정을 standalone `.data/scenarios`에 저장한다"고 판단했습니다. 이 판단은 틀렸습니다. launcher가 `PLANNING_SINGLE_USER_MODE=true`를 넘기면(`planning_v2_desktop_launch.mjs:446`) namespace가 활성화되므로(`namespace.ts:27-28`), production의 scenarios는 Planning root(`users/default/scenarios`)에 저장됩니다(`library.ts:121-122`). production 시작도 namespace나 single-user 설정 없이는 거부됩니다(`next_prod_safe.mjs:256`). 따라서 저장소 이전은 필요 없습니다. 원본 `.next/standalone/.data/scenarios/overrides.json`의 1파일 비교는 123에서 끝났습니다(위 E2).
- 기준: `/home/xpdlqj/code/finance`, branch `checkpoint/finance-review-20261011`, HEAD = origin = `901091c8853e2161effbb18af097880760fe919e`, staged 0
- 보존: `work/10/10` +12, `.data/planning-debug-access-check/`, `__meta/`, `work/10/17/`, 기존 `tmp/` 파일. 원본 `.data`는 승격한 7개 외(연금 2개, 보조 파일, 하위 디렉터리) 변경이 없습니다. `dev.db`는 B의 정식 sync로만 바뀌었습니다(inode 유지, sidecar 0).
  - 원본 `.data` 9개 snapshot hash와 `dev.db`(크기·mtime·hash) 동일 확인은 최초 S0/A 단계 당시의 기록입니다. 근거는 당시 세션의 명령 출력이며 tmp에 원시 파일은 없습니다(DB hash 값은 기록하지 않습니다). 120 단계에서는 DB 크기·mtime·inode만 확인했으며, DB hash 재검사나 byte 불변을 주장하지 않습니다.
- 기록 작성: Gemini 작업자는 이 라운드에서 쓸 수 없다고 기록되어(마스터), 이 기록은 클로드가 원시 증거로 확인한 기술 사실만 반영했습니다.

## 이전 상태 기록 (2026-10-19 03:45 KST 시점 — source B 125 이전이며 현재 사실이 아닙니다)
- (당시) 원본에 아직 하지 않았던 것: `dev.db` 쓰기(B 단계), 비공개 backup, 원본 `.data` 승격, 원본 production build, commit/push, CI. 이 중 앞의 셋은 B125에서 끝났습니다.
- (당시) 격리 수집 완료(W): FinLife 5종, Gov24 혜택, 환율 receipt(asOf 2026-10-16, 수집 2026-10-18T12:10Z).
- 원래 단계의 할 일 목록(2026-10-18 20:16 KST 시점): 원본 `dev.db` 쓰기와 비공개 backup 생성, 원본 `.data` snapshot 승격과 환율 수집, commit/push와 CI 확인. 앞의 둘은 B125에서 끝났습니다.

## 변경 파일
- `work/10/18/2026-10-18-finance-official-data-refresh.md`(이 기록, 신규)
- 최종 source build 개인정보 포함 차단(2026-10-19 06:20 KST, 5fda7dd의 후속): `next.config.ts`, `scripts/standalone_privacy_gate.mjs`·`.d.mts`(신규), `scripts/next_build_safe.mjs`, `scripts/next_prod_safe.mjs`, `scripts/planning_v2_desktop_build.mjs`, `src/app/api/dev/backup/import/route.ts`, `src/app/api/dev/recovery/reset/route.ts`, `tests/standalone-privacy-gate.test.ts`(신규), `tests/desktop-artifact-provenance.test.ts`
- 공식 데이터 승격(B125, 2026-10-19 04:15 KST): `.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`, `.data/finlife_mortgage-loan_snapshot.json`, `.data/finlife_rent-house-loan_snapshot.json`, `.data/finlife_credit-loan_snapshot.json`, `.data/benefits_snapshot.json`, `.data/exchange_snapshot.json`. `dev.db`, 비공개 backup, tmp 증거는 Git 대상이 아닙니다.
- 사용 흐름 결함 2건 수정(아래 "카탈로그 준비 상태·환율 키 호환", 20:43 KST까지):
  - `src/app/products/catalog/page.tsx`
  - `src/lib/publicApis/providers/fx.ts`
  - `src/lib/dataSources/registry.ts`
  - `tests/catalog-empty-state.test.tsx`(신규), `tests/fx-exim-credential.test.ts`(신규)
  - `tests/public-api-provenance.test.ts`(EXIM env 초기화만 추가)
- runtime marker·기록 보존(2026-10-19 03:45 KST): `scripts/public_snapshot_assets.mjs`, `scripts/public_snapshot_assets.d.mts`, `tests/public-snapshot-assets.test.ts`(GPT 신규 파일에 클로드 보완). tmp: `safe_path.mjs`, `b_pathguard.test.mjs`, `make_pre105_copies.mjs`와 `*.pre105.mjs` 3개(증거용 이전본), fixture·stub·runner guard, `.gitignore`. `tmp/finance-runtime-gap-repro-20261018/privacy-runtime-restart-check.mjs`, `privacy-logs/20`~`23`
- 환율 계산기 날짜 미지정 정책(21:39 KST): `src/lib/publicApis/providers/fx.ts`, `tests/fx-default-date.test.ts`(신규), `tests/fx-ap01-contract.test.ts`(기존 단언 1건의 입력을 명시 날짜로 유지)
- 최초 S0/A 단계 당시에는 `tmp/finance-data-refresh-20261018/` 아래 새 파일만 만들었고 소스·원본 `.data`·DB·Git은 바꾸지 않았습니다.
  - `.gitignore`: 격리 workspace(`workspace/`)를 부모 저장소 status에서 제외
  - helper
    - `s0_env_db_check.mjs`: 키 존재 여부와 launcher 방식 DB·root 해석(읽기 전용)
    - `run_isolated.mjs`: 원본 env를 기존 loader로 메모리에만 읽어 W에서 공식 script를 실행하고 출력을 가림
    - `a_quality_check.mjs`: Phase A 품질 판정
    - `b_db_guard.mjs`: inspect·backup·measure·compare·logical
    - `b_guard_selftest_fixture.mjs`: disposable DB 전용 seed·변조
  - 로그 `01`~`13`, Phase A 산출 `a-snapshots/`(6개), disposable DB `db-a/`·`db-test/`, 격리 workspace `workspace/`(HEAD export와 자체 node_modules)

## 실행 결과
- **S0 키 확인**(`01-s0-env-db-check.json`, 값은 출력하지 않음)
  - 있음: `FINLIFE_API_KEY`, `FINLIFE_TOPFIN_GRP_LIST`(=020000), `MOIS_BENEFITS_API_KEY`·URL(https, `api.odcloud.kr`), `EXIM_EXCHANGE_API_KEY`·URL(https, `oapi.koreaexim.go.kr`), `FSS_PENSION_API_KEY`
  - **없음: `KEXIM_API_KEY`**
  - (정정, 21:05 KST) 위 `01` 판정은 env 파일만 읽은 결과였습니다. 그래서 "화면이 예시 데이터를 표시한다"는 당시 문장은 상속 환경과 실제 화면을 확인하지 않은 단정이었습니다. 실제 child 환경(상속 process env + env 파일, override:false)으로 다시 판정한 결과(`33-s0-env-final-child.json`)도 `KEXIM_API_KEY`·`KEXIM_FX_API_URL`은 상속과 파일 모두 없음이고, EXIM 키·URL과 다른 수집 키는 파일에서만 있음이었습니다. 화면 표시는 runtime에서 확인하지 않았습니다.
  - 이후 환율 계산 코드를 EXIM 쌍 호환으로 바꿨습니다(아래 절). 소스와 단위 테스트에만 반영됐고, 실행 중인 앱·build·설치본에는 적용되지 않았으며 live 응답도 확인하지 않았습니다.
- **원본 앱 DB**(launcher와 같은 해석): `/home/xpdlqj/code/finance/dev.db`
  - 일반 파일, canonical, 저장소 안, 688,128 bytes, sidecar 없음
  - schema ok, FinLife identity `ready`
  - `prisma/dev.db`(0 bytes)는 실제 대상이 아닙니다.
  - Planning root: `/home/xpdlqj/.local/share/PlanningV2/vault`. writer lease와 instance lock은 없습니다.
- **W 준비**(`02`~`04`)
  - `git archive 901091c8`을 W에 풀었습니다. 실제 env·DB 파일은 없습니다(tracked 예시 파일 2개만 있음).
  - `pnpm install --frozen-lockfile --offline`은 의존성 연결을 마쳤지만, postinstall `prisma generate`가 `DATABASE_URL` 미설정으로 exit 1이었습니다.
  - 격리 절대 URL을 주고 `prisma:generate`(exit 0)와 `prisma:db:push`(exit 0)를 실행했습니다.
- **Phase A 수집**
  - FinLife(`05`): `finlife:sync` 5 kind, CHILD_EXIT_CODE 0
  - Gov24(`06`): `gov24:sync:if-stale`, `run sync (stale_snapshot)` 후 done, CHILD_EXIT_CODE 0
- **Phase A 품질**(`07-a-quality.json`): `pass: true`

  | 원천 | 수집 시각(UTC) | 건수 | 품질 |
  |---|---|---|---|
  | FinLife 예금 | 2026-10-18T11:12:02Z | 39개 / 옵션 158 | source finlife, fallback false, 완료율 1, 잘림 false, 그룹 020000, marker 0, 공시월 202609 |
  | 적금 | 11:12:00Z | 59 / 178 | 동일 |
  | 주담대 | 11:12:01Z | 34 / 108 | 동일 |
  | 전세대출 | 11:12:01Z | 41 / 80 | 동일 |
  | 신용대출 | 11:12:01Z | 44 / 139 | 동일 |
  | 혜택(Gov24) | 11:12:30Z | 10,969건(이전 10,958, +11) | 완료율 1, 잘림 false, pagination 의심 false, 55쪽×200 |

  - 격리 DB 완료 증거 5행: 모두 `complete`, `provenance=live`, `resultCode=OK`, snapshot 시각 일치
  - 비밀값 scan: 21개 값 × 13개 파일 검사, 검출 0
- **B1/B2 원본 DB 읽기 검사**(`08`)
  - 사용 프로세스 0, fd 보유자 0, lease 없음
  - integrity ok, FK 위반 0
  - 상품 217개(kind별 44·39·34·41·59), ExternalSourceSnapshot 6행(finlife 5, datago_kdb 1), ExternalProduct 25행
  - 개인 테이블(User·Account·Session·VerificationToken·UserProfile·Favorite·PlannerSnapshot) 모두 0행
  - 검사 전후 파일이 같았습니다.
- **Phase B helper 검증**(disposable DB만 사용)
  - backup API 사본(`09`): byte는 다르고 논리 동일성(schema·전 테이블)은 PASS. 그래서 증거 문구는 "논리 동일 사본"으로 씁니다.
  - 리허설(`10`·`11`): 합성 개인 행을 seed한 사본에 실제 `finlife:sync`를 실행했습니다. 보호 집합 14개가 모두 불변이었고, 상품 id·identity·Favorite FK가 유지됐으며, integrity·FK가 정상이었습니다(`pass: true`).
  - 변조 탐지(`12`): 프로필 변경, 상품 삭제, 다른 source 행 변경, identity 변경 4건이 모두 exit 1로 탐지됐습니다.
  - 리허설 sync는 공식 API를 한 번 더 호출했고, W의 `.data`를 새 수집분으로 덮었습니다. Phase A 산출은 `a-snapshots/`에 보존했습니다.
- **비공개 backup 위치**(`13`, 2026-10-18 20:16 KST 당시): `/home/xpdlqj/code/finance-private-backups`는 당시 없었고, 상위 경로는 Git 저장소가 아닙니다. 이 root는 B125에서 만들어졌습니다(위 현재 상태).

## 카탈로그 준비 상태·환율 키 호환 (클로드 1호, 2026-10-18 20:43 KST)
- **카탈로그**:
  - 결함: 결과가 0건이면 원인과 상관없이 "검색 결과가 없습니다 / 필터 초기화"를 보여 줬습니다. 첫 응답이 오기 전에도 같은 문구가 보였습니다.
  - 판정 근거: freshness만으로는 구분할 수 없습니다. 상품 DB가 비어 있어도 번들 snapshot의 기준 시각이 freshness에 잡히기 때문입니다(`sources/status.ts:123-131`). 기관 facet은 검색어와 필터를 무시하고 해당 kind에 상품이 있는 기관만 돌려줍니다(`unifiedLoaders.ts:723-744`, `unified.ts:1220-1239`).
  - 수정: 현재 질의의 응답이 있고, 상품 0건이며, facet이 complete 상태로 비어 있고, partial 사유가 없으면 "공식 상품 자료가 아직 준비되지 않았습니다"를 보여 줍니다. 공개 화면 `/settings/data-sources`로 연결하고, CLI나 개발용 버튼은 안내하지 않습니다.
  - 상품이 있는 상태의 검색 0건은 기존 "필터 초기화"를 유지합니다. 첫 응답 전에는 loading 상태를 보여 줍니다.
- **환율 계산기**(`fx.ts`):
  - `KEXIM_API_KEY`가 있으면 기존처럼 KEXIM URL을 씁니다.
  - KEXIM 키가 없으면 `EXIM_EXCHANGE_API_KEY`를 `EXIM_EXCHANGE_API_URL`(`resolveExchangeBaseUrl`로 https 검증)과 짝으로만 써서 같은 AP01(`authkey`/`data=AP01`/`searchdate`) 요청을 보냅니다. key parameter 이름은 `EXIM_EXCHANGE_KEY_PARAM`입니다.
  - URL이 없거나 잘못되면 요청을 보내지 않습니다. 기존 정책대로 mock(`env-missing`) 또는 CONFIG를 돌려줍니다.
  - KEXIM 요청이 실패해도 EXIM 키로 다시 시도하지 않습니다. provenance에는 키와 URL을 넣지 않습니다.
- **설정 화면**(`registry.ts`): EXIM 키·URL 설명에 "환율 계산에도 사용"을 적고, `KEXIM_API_KEY`를 선택 항목(있으면 우선)으로 표시합니다.
- **공식 참조**: data.go.kr 3068846 페이지에서 제공기관이 한국수출입은행이고 새 host가 `oapi.koreaexim.go.kr`(2026-04-30 수정)인 것은 마스터가 확인했습니다. 상세 서비스 페이지는 502라 인증 계약 전체를 웹으로 다시 확인하지는 못했습니다. 동일 계약이라는 판단은 코드 대조에 근거하며, 실제 live 확인은 아직 하지 않았습니다.

## Phase B helper v2 (GPT review91 반영, 클로드 1호, 2026-10-18 21:05 KST)
- 원본 `dev.db` 쓰기, 실제 외부 backup, `.data` 승격, 공식 수집기 재호출은 하지 않았습니다. 검증은 `db-test/`의 disposable DB와 test 전용 backup root(`private-test-root/`)에서만 했습니다.
- 이전 helper는 `run_isolated.v1.mjs`, `b_db_guard.v1.mjs`, `s0_env_db_check.v1.mjs`로 보존했고, "이전 문제" 증거로만 씁니다.
- 보완(모두 `tmp/finance-data-refresh-20261018/`):
  - `run_isolated.mjs` v2: 계획 검증(`planRun`)을 spawn(`runPlan`)과 분리했습니다.
    - tmp mode(기본): 정규화된 경로와 canonical 포함 관계를 확인하고, script는 허용 목록(`finlife:sync`, `gov24:sync:if-stale`, `warm:if-stale`+날짜 인수)만 받습니다.
    - source mode: `--mode=source --target=<dev.db> --confirm-source-write=<dev.db>`가 모두 정확해야 하고, `finlife:sync`만 인수 없이 허용합니다.
    - traversal, symlink, 다른 DB·script·인수, 기존 log는 spawn 전에 거부합니다.
  - `secret_redact.mjs`: 최종 child env(상속 포함)로 secret 목록을 만들고, 원문·url-encoded 값과 query key를 가립니다. 시작 header와 오류에도 적용하고, chunk가 나뉜 줄도 줄 단위로 합친 뒤 가립니다.
  - `b_db_guard.mjs` v2: inspect, backup, measure, compare 모두 sidecar, integrity, FK, schema, identity가 준비되지 않으면 exit 2로 멈춥니다(fail-closed).
    - backup: 승인 root만 허용합니다. 새 0700 run dir을 만들고 0600 파일을 `wx`로 예약한 뒤, 같은 inode에 SQLite online backup을 받습니다. 이후 논리 동일성을 확인합니다. 기존 run과 기존 파일은 재사용하거나 덮어쓰지 않습니다.
    - measure: private 0600 새 파일에 digest를 저장합니다.
    - compare: B snapshot에서 기대 상태를 계산합니다(persistence와 같은 순서, last-wins). Provider는 id→code·createdAt이 불변이어야 하고, feed 밖 Provider는 전체 행이 불변이어야 하며, feed Provider 이름은 정확히 일치해야 합니다. feed 상품은 kind·이름·provider·raw·옵션 집합이 일치해야 하고, feed 밖 대상 상품과 그 옵션은 불변이어야 합니다. 개인·비대상 보호 집합은 기존대로 유지합니다.
  - `b_quality_check.mjs`: 정확한 DB 1개와 그 B snapshot 디렉터리 1쌍만 검사합니다. complete·live·OK, evidence `snapshotGeneratedAt`과 snapshot 일치, source, fallback, 완료율 0.95 이상, 020000, 잘림 false, attempt 0, 상품·옵션 수, secret 0을 봅니다. `--since` 이전 snapshot이나 evidence(Phase A·리허설 혼합)는 거부합니다.
  - `b_coordinator.mjs`: preflight(앱 프로세스, DB fd 보유자, 두 control root의 lease·lock, attempt marker) → readiness → backup → measure → 재확인 → sync → compare → quality 순으로 진행하고, 첫 실패에서 멈춥니다. lock 삭제, DB 초기화, migration, restore, 승격 코드는 없습니다. source mode는 이번에 실행하지 않았습니다.
  - `test_sync_stub.mjs`(test 전용): Phase A 공개 항목을 실제 `finlife_persistence` 코드로 disposable DB에 넣습니다. persistence가 replay가 아닌 provenance를 모두 `live`로 기록하므로, 그 DB의 `live` 표시는 실제 수집 증거가 아닙니다.
  - `s0_env_db_check.mjs`: 키 판정을 실제 child 환경 기준(상속·파일·최종 bool)으로 바꿨습니다.
- self-test: `node --import tsx --test b_selftest.test.mjs`. 최종 `35-b-selftest-final2.log`는 12/12 통과, exit 0입니다.
  - 이전 문제 증거:
    - v1 runner는 `file:${HERE}/../../dev.db`를 통과시켰습니다.
    - v1은 env 파일 키만 가렸습니다.
    - v1 inspect는 FK 위반과 sidecar에도 exit 0이었습니다.
    - v1 compare는 feed 밖 Provider 변경을 pass로 판정했습니다.
  - v2 차단:
    - runner의 unsafe 계획 18종이 spawn 0회로 거부됐습니다.
    - 합성 상속 secret(원문·encoded·chunk 분할·query)이 log에 0건이었습니다.
    - FK 위반, sidecar, schema 불일치가 fail-closed로 멈췄습니다.
    - backup의 기존 run 재사용(EEXIST, 기존 파일 hash 유지), 미승인 root, 준비 안 된 DB(디렉터리 미생성), 잘못된 run 이름이 거부됐습니다.
  - positive: 개인 합성 행, feed 밖 Provider·상품을 넣고 feed Provider 이름을 바꾼 합성 sync에서 compare와 quality가 모두 pass였습니다.
  - negative 8건: 기존 4건(프로필, 상품 삭제, 다른 source, identity) + 새 4건(feed 밖 Provider, feed 밖 상품 옵션, feed Provider 이름, feed 옵션). identity 1건은 readiness(IDENTITY_NOT_READY)에서, 나머지 7건은 compare에서 멈췄습니다.
  - quality: 실제 live 리허설 쌍(`db-test/rehearsal.sqlite`와 W `.data`)은 pass였습니다. A snapshot과 섞은 쌍, since 이후가 아닌 쌍, snapshot에 secret이 들어간 경우는 fail이었습니다.
  - coordinator test mode: 7단계 end-to-end pass였습니다. summary에 행 내용은 없습니다.
  - 중간 시도 `30`·`31`의 실패(fixture의 FINLIFE raw 형식 미비, schema 검사 순서, readiness에서 먼저 멈춘 identity 사례)는 로그로 보존했습니다.
- secret scan:
  - `34`: hit 1건. 짧은 6자리 숫자 env 값(`DEV_ACTION_TOKEN`)이 self-test의 합성 문자열 일부와 우연히 겹친 것이었습니다(값은 출력하지 않음).
  - 합성 문자열을 바꾼 뒤 `36-secret-scan-final.json`: 13개 값 × 110개 파일, hit 0.
- `.gitignore`(이 폴더): `db-a/`, `db-test/`, `private-test-root/`를 부모 저장소 status에서 제외하도록 추가했습니다.

## 환율 공식 수집·계산기 provider 실응답 (클로드 1호, 2026-10-18 21:11 KST)
- 원본 `.data`, DB, 소스는 바꾸지 않았습니다. W의 `.data/exchange_snapshot.json`과 이 폴더의 로그, 작은 runner `fx_live_check.mjs`만 썼습니다. 앱 서버, build, desktop은 실행하지 않았습니다.
- **환율 receipt 수집**(`40-fx-warm-exchange-20261016.log`, runner v2 tmp mode)
  - 명령: `warm:if-stale -- --exchange-only --exchange-date=20261016`
  - 출력: `exchange: wrote`, CHILD_EXIT_CODE 0. 공식 API 호출은 1회입니다.
  - receipt: `generatedAt 2026-10-18T12:10:11.058Z`, `asOf 2026-10-16`, `rowCount 23`. `validateEximExchangeRows`가 요청일 기준으로 모든 row가 `result=1`일 때만 쓰므로, 2026-10-16을 실제 공시일로 확정했습니다.
  - freshness 기준이 1일이므로 이 receipt로 승격하려면 push와 CI preflight가 **2026-10-19T12:10Z 이전**이어야 합니다. 넘기면 다시 수집해야 합니다.
- **계산기 provider 실응답**(`41-fx-provider-live.json`, W의 동결 소스93 `fx.ts`를 provider 단위로 직접 호출. 앱·build 실행 아님)
  - 최종 child env: `KEXIM_API_KEY`·`KEXIM_FX_API_URL` 없음, EXIM 키 있음, EXIM URL은 https `oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`, `EXIM_EXCHANGE_KEY_PARAM` 없음(기본 `authkey`)
  - 요청 2회: 둘 다 같은 host+path, parameter 이름 `authkey`·`data`·`searchdate`, HTTP 200
  - 관측은 mock fallback을 끄고(`PUBLIC_APIS_FALLBACK_TO_MOCK=0`) 했습니다.
  - 20261016: `ok`, provenance `live`, `degraded:false`, asOf 2026-10-16, 출처 한국수출입은행. USD 1,348.5 / JPY(1엔) 8.5302 / EUR 1,512.14. 요청한 CNY는 AP01 응답 단위에 없어 결과에 없습니다.
  - 날짜 미지정(오늘 KST 20261018, 일요일): `NO_DATA`("해당 날짜 환율 데이터가 없습니다."). 앱 기본값인 mock fallback 켜짐 상태에서는 코드상 `mock`(`degradedReason: upstream-failure`, `[예시]`)으로 표시됩니다. 이 부분은 runtime 화면으로 확인하지 않았습니다.
- **주말 기본 입력 증상(보고만, 코드 수정 없음)**
  - 대시보드 기준 환율 `/api/public/exchange`는 `NO_DATA`이면 최대 7일 전까지 조회합니다(`src/app/api/public/exchange/route.ts:139-153`).
  - 계산기 `/api/public/fx`(`route.ts:33,58`)와 provider는 요청일만 조회합니다. provider 계약 테스트도 "이전 영업일을 추론하지 않음"을 고정합니다(`tests/fx-ap01-contract.test.ts:110-118`).
  - 그래서 주말·휴일이나 공시 전에는 같은 화면에서 기준 환율은 live, 계산기는 예시로 갈릴 수 있습니다.
  - 최소 해법 후보(제품 결정 필요): (a) 날짜가 지정되지 않았을 때만 `/api/public/fx` route가 exchange route와 같은 제한된 `NO_DATA` 이전일 조회를 하고, 실제 asOf를 표시하는 방안. (b) 계산기가 기준 환율 응답의 asOf를 날짜로 넘기는 방안.
- **보호 확인**
  - secret scan(`42-fx-secret-scan.json`): 13개 값 × 6개 파일, hit 0
  - HEAD `901091c8`, staged 0, 원본 `.data` 9개 hash와 `dev.db`(688,128 bytes, mtime) 그대로, 동결 소스·테스트 6개 diff 그대로
  - W의 FinLife 5개(리허설 수집분)와 혜택 snapshot은 그대로입니다. `a-snapshots/` 6개 hash도 그대로입니다.
  - 원본 작업 트리에 생긴 `next.config.ts`, `scripts/next_build_safe.mjs`, `scripts/next_prod_safe.mjs`, `scripts/planning_v2_desktop_build.mjs`, `tests/desktop-artifact-provenance.test.ts` 변경은 다른 작업자(P1)의 것이며, 제가 만든 것이 아닙니다.
- **구분**(2026-10-18 21:11 KST 당시)
  - 환율 receipt는 당시 W에 있는 승격 후보였고 원본에 승격하지 않은 상태였습니다. B125에서 현재 live 기본 asOf(2026-10-16)를 다시 확인한 뒤 승격했습니다.
  - 당시에는 원본 B 단계의 FinLife 최종 snapshot이 없었고, W의 FinLife 5개는 리허설 수집분이라 승격 대상이 아니었습니다. B125의 sync가 W의 5개를 새로 썼고, 그 파일을 승격했습니다.

## 환율 계산기 날짜 미지정 정책 (마스터 결정 반영, 클로드 1호, 2026-10-18 21:39 KST)
- **결정**: 날짜를 지정하지 않으면 가장 최근의 실제 공시값을 씁니다. 공시가 없는 날만 이전일로 넘어가고, 범위는 기존 `/api/public/exchange`와 같은 최대 7일입니다. 명시한 날짜는 기존처럼 그 날짜만 1회 조회합니다.
- **흐름 확인**
  - `src/app/api/public/fx/route.ts:33,58`은 날짜가 없으면 `""`를 그대로 provider에 넘깁니다(오늘로 강제하지 않음). route는 수정하지 않았습니다.
  - UI 호출부(`DashboardClient.tsx:147`, `FxToolClient.tsx:38`)는 둘 다 날짜 없이 호출합니다. 그래서 이 정책이 실제 대시보드·FX 도구 흐름에 그대로 적용되고, UI 수정은 필요 없습니다.
  - FX 도구는 응답 item의 `asOfDate`를, 대시보드는 provenance `asOf`를 표시합니다.
- **변경**(`src/lib/publicApis/providers/fx.ts`만)
  - 날짜가 없으면 오늘(KST)부터 7일 전까지 8개 후보를 만듭니다. 기존 `shiftKstIsoDate`를 써서 exchange route와 같은 KST 달력 규칙을 따릅니다.
  - AP01이 **row를 하나도 내지 않은 날**(body가 null 또는 빈 배열)만 다음 후보로 넘어갑니다.
  - 인증, 쿼터, 네트워크, 형식 오류와 "row는 있으나 요청 통화가 없음"은 즉시 멈춥니다. 마지막 후보까지 비어 있으면 `NO_DATA`이고, 이후는 기존 mock·CONFIG·오류 정책 그대로입니다.
  - 단일 날짜 요청은 `fetchQuotesForDate`로 추출했습니다. 응답 판정 규칙(NO_DATA, SCHEMA_MISMATCH)과 EXIM/KEXIM 쌍 우선순위(93)는 바꾸지 않았습니다.
- **테스트**
  - 신규 `tests/fx-default-date.test.ts`(test-only 가짜 시계: 일요일 2026-10-18 12:00 KST, 합성 AP01 payload, test-only 키) 11건:
    - 날짜 미지정: 18·17일 빈 응답 후 16일 live, asOf 10-16
    - 명시 일요일: 1회, NO_DATA 유지. 기본 mock 정책이면 1회 후 `mock`(upstream-failure)
    - 명시 금요일: 1회 성공
    - 8일이 모두 비면 8회에서 멈추고 NO_DATA 또는 mock
    - 인증 오류, schema 오류, 네트워크 오류: 다른 날짜를 시도하지 않음
    - 요청 통화가 없는 날: 이전일로 넘어가지 않음
    - 키 없음: 요청 0회, CONFIG
    - route 날짜 미지정: items와 provenance의 asOf가 10-16
    - 키 값 비노출
  - `tests/fx-ap01-contract.test.ts:110-118` 기존 단언은 날짜 미지정을 "오늘만 조회"로 고정하고 있어 마스터 결정과 충돌했습니다. 삭제하지 않고, 같은 제목·같은 기대(요청 1회, 이전 영업일 추론 없음)를 명시한 오늘 날짜(`20261011`) 입력으로 유지했습니다. NO_DATA 단언을 하나 추가했고, 날짜 미지정 정책은 새 파일에서 검사합니다.
- **검증**(W에 변경 파일만 동기화, `env -u DATABASE_URL`, Node 22.22.2)
  - 수정 전(`50-fx-default-before.log`): 새 정책 3건 실패(날짜 미지정 이전일 조회, 7일 상한, route asOf), 나머지 21건 통과, exit 1
  - 수정 후(`51-fx-default-after.log`): 관련 12파일 115건 통과, exit 0
  - `52-fx-default-static.log`: eslint 3파일 exit 0, `tsc --noEmit --incremental false` exit 0
- **실응답**(`53-fx-default-live.json`, W의 수정 provider를 단위 호출. 앱·서버·build 아님. mock fallback 끔)
  - KEXIM 키 없음, EXIM 쌍 `oapi.koreaexim.go.kr`
  - 요청 3회(20261018, 20261017, 20261016), 모두 HTTP 200
  - live, asOf 2026-10-16, USD 1,348.5 / JPY 8.5302 / EUR 1,512.14
  - secret scan `54`: 13개 값 × 10개 파일, hit 0
- **보존**
  - W receipt(`generatedAt 2026-10-18T12:10:11.058Z`, asOf 10-16, 23행)는 다시 수집하지 않았습니다.
  - 원본 `.data` 9개, `dev.db`, `work/10/10` +12, catalog·registry·provenance 변경, `run_isolated`·v2 DB helper는 그대로입니다.
- **미확인**: 소스 앱의 화면(대시보드·FX 도구)에서 실제로 asOf가 표시되는지는 확인하지 않았습니다(통합 후 runtime 검증 대상).

## runtime marker·runtime 기록 보존과 helper 경로 guard (클로드 1호, 2026-10-19 03:45 KST, 회의 116 결정)
- **변경**
  - `scripts/public_snapshot_assets.mjs`·`.d.mts`: runtime 준비(source, managed)는 공식 9개와 알려진 attempt 5개 **이름만** 검사합니다(`assertManagedSnapshotEntries`). 앱이 남긴 그 밖의 항목(temp, scenario 등)은 읽지도 지우지도 않습니다. artifact build의 exact 9 검사(`planning_v2_desktop_build.mjs:709`)는 그대로입니다.
  - `syncSourceAttemptState`: root marker가 유효하면 기존처럼 mirror합니다. root marker가 없을 때 generated(runtime) marker는 원칙적으로 보존합니다. **root 공식 snapshot의 `meta.generatedAt`이 marker의 `updatedAt`보다 엄격히 늦을 때만** 지웁니다. 시각이 같거나, 잘못됐거나, 없거나, marker 자체가 무효면 지우지 않습니다. launcher에서 DB는 읽지 않습니다.
  - 전제 확인: snapshot만 쓰는 `runFinlifeSnapshotSync`(`syncRunner.ts:302`)는 test에서만 호출됩니다. 운영에서 FinLife snapshot을 쓰는 경로는 CLI `finlife_sync`와 runtime `persistentSync` 둘 다 persistence 전체 sync를 거칩니다(DB → snapshot → 완료 증거 → marker 제거, `finlife_persistence.mjs:300-345`).
  - helper(`tmp/finance-data-refresh-20261018/`): `safe_path.mjs`(모든 조상·최종 경로의 symlink, realpath, 종류, `nlink===1`, dot segment, 루트 밖 거부). fixture와 stub이 쓰기·import 전에 이 검사를 씁니다. `run_isolated.mjs`는 기존 tmp DB의 hardlink를 거부합니다. source coordinator의 target, backup, 행 보호, quality pair는 바꾸지 않았습니다.
- **검증**
  - 수정 전 `70-marker-before.log`: 새 marker case 3건 실패(T1 fetch 실패 보존, T2/T3 db·snapshot·completion·running 보존, T7/T9 무효·근거 부족 보존), 16건 통과, exit 1. 이전 runtime 패치의 수정 전 결과는 `60`(4건 실패)입니다.
  - 수정 후 `71-marker-after.log`: 6파일 60건 통과, exit 0(`public-snapshot-assets` 19건 포함; `standalone-runtime-assets`, `planningDesktopInstallState`, `planningDesktopEnvironment`, `finlife-sync-attempt-marker`, `finlife-snapshot-storage`). `72`: eslint·tsc exit 0.
  - build가 있는 GPT privacy-workspace(이제 운영 소유자는 클로드)에 helper와 test만 동기화했습니다(`privacy-logs/20`: 원본 8파일 = W 바이트 동일, managed 설치본 helper = 원본).
    - `privacy-logs/21`: `public-snapshot-assets`, `desktop-artifact-provenance`, `standalone-runtime-assets` 39건 통과(기존 skip 2건), exit 0. collection W의 `61`·`64`에서 실패했던 builder 2건은 이 build 환경에서 통과했습니다.
    - `privacy-logs/22`(source)·`23`(managed): 공식 launcher를 one-shot으로 띄우기 전에 standalone `.data`에 합성 runtime 항목 3개(atomic temp, scenarios/overrides, FinLife failed marker)를 두었습니다. 둘 다 정상 기동했고 공개 snapshot을 응답했으며, 3개 항목이 바이트 동일하게 보존됐습니다. source는 freshness에 marker가 반영됐습니다(`stale` + "동기화가 완료되지 않았습니다"). cleanup은 정상이었고, 제가 만든 항목만 확인 후 제거했습니다(결과 `privacy-restart-check-*-results.json`).
  - helper 음성 회귀 `73-pathguard-tests.log` 3/3 통과:
    - pre105는 db-test symlink를 통해 밖의 sentinel에 쓰고, cwd symlink로 밖에 snapshot을 쓰고, hardlinked DB를 받았습니다.
    - 현재본은 file·ancestor·cwd symlink, hardlink, dot segment, 루트 밖 경로를 쓰기·import·spawn 전에 거부했고, sentinel은 불변이었습니다.
    - `74`: 기존 self-test 12/12 통과.
  - `dev.db`는 크기·mtime·inode만 확인했습니다(내용 hash는 금지라 하지 않음): 688,128 bytes, 동일.
  - secret: env 값 기반 scan은 이번에 금지돼 실행하지 않았습니다. 대신 새 로그·결과에서 query 인증값, Bearer, session cookie, 긴 hex token 패턴을 검사했고 0건이었습니다(패턴 한정 검사).
- **한계**
  - root에 CLI 실패 marker가 있는 동안에는 runtime 성공 뒤에도 재시작 때 root의 실패가 다시 mirror됩니다. 다음 CLI 성공으로 풀립니다.
  - CLI가 runtime 실패보다 먼저 수집을 시작해 성공한 경우, 시각 비교 때문에 marker가 보존됩니다(보수적 방향). 다음 CLI 성공으로 풀립니다.
  - runtime 경로 검증은 합성 항목 기준이고, 실제 in-app refresh 실패를 재현한 것은 아닙니다. Windows는 미검증입니다.

## source B 실행과 공식 snapshot 승격 (클로드 1호, 2026-10-19 04:12~04:18 KST, 배정 125)
- 원시 증거: `tmp/finance-source-refresh-20261019/`(`REPORT.md`, `01`~`09`, `logs/`)와 `tmp/finance-data-refresh-20261018/logs/20261019-20261018T191226Z-{sync.log,summary.json}`. 새 tmp는 `.gitignore`(`*`)로 commit 대상이 아닙니다.
- **사전 확인**(`01-preflight.json`)
  - HEAD `901091c8`, staged 0, work/10/10 numstat `12 0`
  - `finlife_sync.mjs` import closure 9개와 package·lock·prisma 파일은 W와 원본이 바이트 동일했습니다.
  - DB fd 보유자 0, 앱 프로세스 0, prod·dev control root의 writer lease·instance lock 없음, attempt marker 0
  - 앱의 DB 해석 경로가 target과 같았고, 일반 파일·single link·canonical·sidecar 0이었습니다. integrity ok, FK 0, schema ok, identity ready
- **source B**(`logs/02-b-coordinator.log`): `node --import tsx tmp/finance-data-refresh-20261018/b_coordinator.mjs --mode=source --target=/home/xpdlqj/code/finance/dev.db --confirm-source-write=/home/xpdlqj/code/finance/dev.db --run-name=20261019-20261018T191226Z`
  - preflight → ready → backup → measure → writer 재검사 → `finlife:sync`(exit 0, since 2026-10-18T19:12:27.149Z) → compare → quality, 모두 PASS
  - backup: 논리 동일, 예약 inode 유지. byte 비교는 false(SQLite online backup의 page 배치 차이)
  - compare: 보호 집합 14개 unchanged, provider·product 문제 항목 0, favorite dangling 0, feed 상품 217
  - quality: 5종 모두 complete·live·OK, snapshot과 일치
  - DB 파일 inode 유지, sidecar 0. lock 삭제·초기화·migrate·restore 없음

  | kind | 상품 | 옵션 | generatedAt(UTC) |
  |---|---:|---:|---|
  | saving | 59 | 178 | 2026-10-18T19:12:45.615Z |
  | mortgage-loan | 34 | 108 | 19:12:46.384Z |
  | rent-house-loan | 41 | 80 | 19:12:46.662Z |
  | credit-loan | 44 | 139 | 19:12:46.888Z |
  | deposit | 39 | 158 | 19:12:47.586Z |

- **환율 기본 날짜 확인**(`04-fx-default-live.json`): 원본의 FX 3파일(104+119)을 W에 바이트 동일하게 복제하고 관련 폴더 diff 0을 확인한 뒤 provider 단위로 호출했습니다(앱·서버 아님). KST 10-19 04:14에 19→18→17→16 조회, 모두 HTTP 200, live, degraded false, asOf 2026-10-16. 새 공시일이 없어 기존 정식 receipt를 승격했습니다.
- **승격 7개**(`05-promotion-manifest.json`): 모든 검사를 쓰기 전에 마친 뒤, before 사본 보존 → staging → atomic rename 순으로 바꿨습니다. `.data`에서 바뀐 항목은 정확히 7개이고 권한 644를 유지했습니다.
  - FinLife 5: 위 B의 W 파일(Phase A·리허설 파일은 거부 조건으로 배제)
  - 혜택: Phase A `a-snapshots/benefits_snapshot.json`(07 sha 일치, 10,969건, generatedAt 2026-10-18T11:12:30.637Z)
  - 환율: 정식 receipt(generatedAt 2026-10-18T12:10:11.058Z, asOf 2026-10-16, rowCount 23)
- **사후 확인**(`06`·`07`·`08`·`09`)
  - `node scripts/data_freshness_report.mjs --strict --check-only --exceptions=config/data-freshness-exceptions.json --json-report=<tmp>`: total 9, fresh 9, exit 0(docs 쓰기 없음)
  - snapshot schema(helper 조합 검사): managed entry 9, FinLife validator·혜택 loader·환율 receipt 형태 통과
  - 승격된 `.data` 기준 compare 재실행 PASS, integrity·FK 정상
  - runtime용 논리 사본 `private-after/dev.after.sqlite`(0700/0600, 원본과 논리 동일)
  - 실제 secret 값(최종 child env 13개, 인코딩 변형 15개)을 메모리에서만 비교: 47파일과 REPORT에서 hit 0
- 정책 거부 1회: overlay 실패 시에도 FX 검사를 이어 가는 명령 조합이 거부되어, 실패하면 멈추는 순차 실행으로 바꿨습니다.

## 최종 source build 개인정보 포함 차단 (클로드 1호, 2026-10-19 06:20 KST, 협의 131~135 합의 구현)
- 원시 증거: `tmp/finance-privacy-final-20261019/`(`.gitignore` `*`, commit 대상 아님). 130 실패 build의 원시 로그와 감사는 `tmp/finance-final-20261019/`에 그대로 둡니다.
- **원인(설치된 Next 16.3.8 소스와 소규모 합성 재현으로 확인)**
  - webpack route trace는 각 모듈의 변환 소스를 nft로 분석합니다(`next-trace-entrypoints-plugin.js:280-286`).
  - nft는 `process.cwd()` 기반 정적 경로식이 디렉터리를 가리키면 그 디렉터리 전체를 glob합니다. 이때 그 안의 링크를 따라갑니다.
  - `backup/import` route의 `fs.mkdirSync(path.dirname(<cwd>/tmp/backup_restore_point.json))`와 `recovery/reset`의 `path.join(process.cwd(), "tmp")`가 원본 tmp 전체(27,494개)를 끌어들였습니다. tmp 안의 repo-root 링크를 따라가 루트의 `.env`·`.env.local`·`dev.db`와 루트 디렉터리 자체까지 들어갔습니다(`r1-nft-reasons-2.json`, 130 nft의 route별 집계).
  - Next는 `.env`·`.env.production`을 trace와 무관하게 standalone에 복사합니다(`next/dist/build/index.js:327-346`).
  - Next는 trace 복사 실패를 경고만 남기고 exit 0으로 끝냅니다(`next/dist/build/utils.js:1080-1100`).
- **보완**
  - `next.config.ts`
    - route trace 제외에 `.data`·`tmp`·`work`·`__meta`·`.claude`·`.dist`·`.git`·루트 `.env*`·`env.local`·DB 파일을 추가했습니다.
    - `next-server` 키는 기존 `.data`만 둡니다. 이 키의 패턴은 root-relative 부분 문자열로 적용되어서(`collect-build-traces.js:86-97,185-216`), 1차 W 회귀에서 `./work/**/*`가 Next 자체 `next/dist/lib/framework/*`를 지웠습니다. 되돌린 뒤 next-server trace(node_modules 2,026개)가 130 원본과 같아졌습니다.
  - 두 dev route: 작업 디렉터리를 함수 호출로 얻어 tracer가 tmp 디렉터리를 정적으로 평가하지 못하게 했습니다. runtime 경로는 같습니다(`r2-nft-p2-patch.json`, 수정 후 trace에 tmp·env·db 0).
  - 신규 `scripts/standalone_privacy_gate.mjs`
    - trace 목록 감사: 프로젝트 루트·디렉터리 항목·프로젝트 밖·private class
    - standalone 감사: 실제 env·DB·tmp 계열·private 경로·standalone 밖 링크, `.data`는 공식 9개(+attempt marker)만
    - Next가 만든 정확한 `standalone/.env`만 제거합니다. 일반 파일·single link·원본과 다른 inode일 때만 지우며, `.env.production`이 있으면 지우지 않고 FAIL합니다.
    - BUILD_ID에 묶인 receipt를 발급하고 확인합니다.
  - `scripts/next_build_safe.mjs`
    - build 시작 때 이전 receipt를 무효화합니다.
    - "Failed to copy traced files" 경고가 나오면 build를 실패시킵니다.
    - gate와 공식 9개 준비가 모두 성공한 뒤에만 receipt를 발급합니다.
  - `scripts/next_prod_safe.mjs`: 선택된 dist(분리 dist 포함)와 next-start fallback 모두 receipt가 있어야 시작합니다. managed 설치는 기존 설치 identity 확인(설치 시 checksum 검증)을 따르고, 개인 managed root는 다시 스캔하지 않습니다.
  - `scripts/planning_v2_desktop_build.mjs`: 복사 전 source standalone 입력 감사, checksum 전 staged artifact 최종 감사를 추가했습니다. 최종 artifact의 외부 링크는 0개여야 합니다.
- **검증(격리 W = HEAD 5fda7dd archive + 이 보완, 자체 node_modules 사본, 합성 canary만 사용)**
  - 수정 전 재현(P2를 되돌림 + tmp의 repo-root·외부 링크): build exit 1, receipt 없음, launcher 기동 거부(exit 1, bootstrap·lease·lock 없음)
  - 수정 후 build exit 0: gate 통과, receipt 발급, `standalone/.env` 제거, 독립 감사 c2 PASS, 합성 canary 9종 hit 0(위험 링크가 있어도 trace되지 않음)
  - source 2회 기동: 공식 launcher, one-shot 진입. server cwd = standalone. root env loader가 합성 key를 전달했고(CONFIG 아님), graceful 종료(코드 128 = writer bootstrap의 신호 종료 계약, 8초 graceful window 안), writer·lease·lock 0
  - desktop artifact: 입력·최종 감사 통과, artifact 외부 링크 0, canary 0. disposable 설치 후 managed 2회 기동 PASS(설치본에는 source env가 없어 CONFIG)
  - 단위 테스트: gate 11건과 desktop provenance 21건(신규 2건 포함) 통과. 영향 범위 17파일 중 2차 실행의 무관한 timeout 3건은 단독 재실행 27/27 통과. 변경 파일 eslint exit 0, typecheck exit 0
- **미검증**: 원본 재build와 그 감사, 원본 runtime·브라우저 실사용, 원본 artifact·설치, Windows, CI

## 사용 skill
- 이번 보완에 실제 적용: superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion, planning-gate-selector, work-log-closeout.
- 없음

## 검증
- 위 실행 결과의 각 줄은 `tmp/finance-data-refresh-20261018/`의 원시 로그와 JSON에서 확인한 값입니다.
- 최초 S0/A 단계 당시에는 제품 test, build, runtime, release gate를 실행하지 않았습니다. 이후 격리 검사·runtime 결과는 위 해당 시점 절의 기록이며 원본 runtime·release 완료를 뜻하지 않습니다.
- 최초 S0/A 단계 당시의 보존 확인은 `git diff`(work/10/10 +12만 있음), staged 0, `.data` 9개 hash, `dev.db` 크기·mtime·hash였습니다. 최신 120 단계의 DB 확인은 크기·mtime·inode에 한정되며 내용 hash는 다시 읽지 않았습니다.
- 카탈로그·환율 수정 검증(격리 workspace W에 변경 파일만 동기화, `env -u DATABASE_URL`, Node 22.22.2):
  - 수정 전(`20-before-tests.log`, HEAD 소스 확인): 새 회귀 3파일 31건 중 6건 실패, exit 1
    - 카탈로그 4건: 미준비(필터 없음·있음), 번들 시각만 있는 빈 DB, 첫 응답 전
    - FX 2건: EXIM-only 계약, EXIM key parameter
    - 보호 조건(KEXIM 우선, 잘못된 URL 차단, 키 없음 정책, 재시도 없음)과 기존 동작은 수정 전에도 통과
  - 수정 후(`21-after-tests.log`): 관련 22파일 168건 통과, exit 0. 범위는 새 회귀 2파일, provenance, catalog explorer·snapshot store, FX AP01·data status, 대시보드 신뢰 회복, 접근성 계약, data source 상태·ping, exchange 오류 코드, schema drift, metadata 계약, `tests/planning/catalog`
  - `22-after-static.log`: 변경 6파일 eslint exit 0, `tsc --noEmit --incremental false` exit 0
- 원본 full test, build, runtime, 브라우저 확인은 이번에 실행하지 않았습니다.

## 남은 리스크
- (현재, 2026-10-19 06:20 KST cutoff)
  - 원본 재build 감사와 원본 runtime·artifact 확인 전에는 build 개인정보 차단이 원본에서 PASS라고 말할 수 없습니다. 원본 `.next/standalone`에는 130 build의 민감 사본이 남아 있습니다(Git 대상 아님, 재build로 교체).
  - production standalone은 이제 원본 tmp의 사용자 피드백·restore point 등을 포함하지 않습니다. 해당 화면은 runtime에 standalone 쪽에 새로 쓰인 값만 보입니다.
  - `next-server` trace는 `.data`만 제외하고, 나머지는 gate가 사후 감사로 막습니다.
- (2026-10-19 04:20 KST cutoff)
  - 환율 receipt가 2026-10-19T12:10Z에 만료됩니다. 승격은 끝났지만 push와 CI freshness preflight가 그 뒤라면 정식 warm 경로로 다시 수집해야 합니다(평일 공시는 KST 11시경).
  - 원본 production build, 원본 runtime·브라우저, desktop artifact·설치본, Windows, CI는 미실행입니다.
  - 원본 `.next/standalone/.data`는 아직 이전 public snapshot입니다. 다음 build의 public snapshot 복사 단계에서 바뀌어야 합니다.
  - 환율 계산기 asOf의 앱 화면 표시는 미확인입니다(provider 단위 live만 확인).
- (2026-10-19 03:45 KST 당시 기록)
  - 기본 `.next`는 `collectIsolatedBuildDistDirs`(`next_artifact_prune.mjs:139-155`)의 수집 대상이 아니므로 해당 preflight가 기본 `.next/standalone/.data`를 삭제한다고 볼 수 없습니다. Next 실제 build의 삭제 여부는 미검증입니다. 당시 선행 조건이던 E2 1파일 비교는 123에서 끝났습니다(두 파일 바이트 동일).
  - 당시 진행 중이던 FX credential 로그 마스킹은 GPT 119로 반영됐고 122에서 교차 리뷰를 마쳤습니다.
  - 공개 snapshot 패키징(trace 제외, 공식 9개 복사)은 GPT가 구현했고, runtime 보완은 위 절에 있습니다.
- (이전 시점 기록, 2026-10-18)
- `KEXIM_API_KEY`가 없는 현재 환경에서 환율 계산은 이제 EXIM 키·URL 쌍으로 같은 공식 API를 호출하도록 고쳤습니다. 실제 live 응답과 화면 표시는 아직 확인하지 않았습니다(runtime 검증 미실행).
- 카탈로그 미준비 판정은 기관 facet이 complete일 때만 동작합니다. facet 조회가 실패하면 기존 "검색 결과 없음"과 partial 안내가 그대로 나옵니다.
- production standalone이 build 시점의 `.data` 복사본을 읽는 문제와 개인 로컬 자료가 tracing에 포함되는 문제(P1)는 이번 범위가 아니라서 그대로 남아 있습니다. (이후 GPT가 패키징으로 보완, 위 현재 항목 참조)
- 환율 receipt는 수집 후 1일 기준입니다. 연금 snapshot 2개는 2026-10-21T18:55Z 이후 stale이 됩니다.
- B 쓰기는 writer lease를 거치지 않습니다. coordinator는 실행 직전과 sync 직전에 앱 프로세스, DB fd, lease·lock이 없는지 다시 확인합니다. 다만 sync 도중 앱이 새로 시작되는 것까지 막지는 못합니다.
- (2026-10-18 당시) coordinator source mode, 실제 외부 backup root 생성, 원본 DB backup·measure·sync는 당시 실행 전이었습니다. B125에서 실행했고, backup이 예약한 같은 inode에 써졌음을 원본에서도 확인했습니다.
- 상품 transaction 뒤의 완료 증거·snapshot 기록 단계에서 실패하면 상품 변경은 남습니다. 이때는 같은 sync를 다시 실행해야 합니다.
- 설치본(desktop artifact) 데이터 전달은 이번 범위가 아니며 확인하지 않았습니다.

## 다음 라운드
- (현재, 06:20 KST) 이 보완을 5fda7dd의 후속 commit으로 남긴 뒤 원본 재build → c2 감사·실제 secret 값 메모리 비교 → 공식 launcher·브라우저 실사용 → desktop artifact·설치·managed 기동 순서로 진행하고, push와 CI는 최종 리뷰 후 별도로 진행합니다.
- (04:20 KST 당시 계획) 최종 통합: 이 기록과 승인된 경로만 local candidate commit → 그 HEAD로 원본 production build·typecheck → trace·standalone 감사 → 공식 launcher·브라우저 실사용 확인 → desktop artifact·disposable 설치 확인. 결과는 `tmp/finance-final-20261019/REPORT.md`에 남깁니다.
- push는 최종 독립 리뷰 뒤 별도 배정으로 하고, 이어서 CI를 확인합니다. 환율 receipt 만료(2026-10-19T12:10Z) 뒤라면 push 전에 정식 경로로 receipt를 다시 수집합니다.
- (2026-10-18~19 당시 계획, 완료) source B 한 번 실행, after 사본 논리 동일성, B FinLife 5개와 A 혜택 snapshot 승격, 원본 build 전 E2 1파일 비교는 B125와 123에서 끝났습니다.
