# Finance 프로덕션 빈 본문 — 라우터 계층 분리 조사

- 수행일: 2026-10-10 KST
- 기준: 2026-10-10-finance-production-blank-investigation.md 및 기존 실패 trace/cache-state-comparison.json
- branch / HEAD: main / e296a529f1e3d48c224aee36ca1b9bf65ee0cf44
- 결론: **NOT_COMPLETE. Finance 최초 실패의 근본 원인은 미확정이며 제품 수정은 적용하지 않았습니다. 공개 재현과 React 대조군의 서로 다른 중단 경계를 확인했습니다.**

## 결과와 변경 범위

이번 조사에서 추가한 추적 대상은 이 기록입니다. 독립 앱·계측·trace·결과는 ignored 증거 디렉터리에 보존했습니다.

- [실행 결과 요약](../../local/finance-router-layers-20261010/summary.json)
- [계층별 상태 비교](../../local/finance-router-layers-20261010/evidence/router-investigation/layer-comparison.json)
- [재현 방법 및 관측 한계](../../local/finance-router-layers-20261010/evidence/router-investigation/README.md)
- [전체 명령과 종료 코드](../../local/finance-router-layers-20261010/evidence/router-investigation/executed-commands.json)
- [계측 소스](../../local/finance-router-layers-20261010/evidence/router-investigation/inputs/)
- [독립 앱](../../local/finance-router-layers-20261010/evidence/router-investigation/minimal/)
- [고정 버전 공개 재현](../../local/finance-router-layers-20261010/evidence/router-investigation/public-repro/)

기존 미커밋 DashboardClient.tsx, dashboard-current-state.spec.ts, planning-quickstart-preview.spec.ts의 내용과 기대값을 그대로 유지했습니다. 이 3개와 package/lockfile/Playwright/Next 설정 총 7개 SHA256이 시작·종료 시 일치합니다. 관련 tracked 파일 1,943개도 원본과 실행 사본이 일치했습니다. 원본 기록·실패 trace를 덮어쓰지 않았고 index 변경, commit, push, 배포, 운영 DB·전역 설정 변경은 없습니다.

## 환경과 사용 skill

systematic-debugging, verification-before-completion, using-superpowers, dispatching-parallel-agents, planning-gate-selector, work-log-closeout을 적용했습니다. 읽기 조사는 병렬 분리했고 런타임·빌드·DB·E2E는 메인이 순차 소유했습니다.

Finance는 기존 /tmp/finance-autonomy-20261010-d0bd4l_g의 workspace, Linux dependencies, 테스트 전용 state/DB, run.py와 공식 safe build/desktop launcher를 재사용했습니다. 독립 앱은 별도 bwrap 환경에서 기존 dependencies만 읽기 전용 마운트하며 Finance 소스·DB를 마운트하지 않았습니다.

패키지 pin은 Next 16.2.12 / React·ReactDOM 19.2.3 / Node 22.22.2 / pnpm 9.15.9입니다. 그러나 **실제 App Router 브라우저 renderer는 Next 번들 19.3.0-canary-3f0b9e61-20260317**입니다. compiler alias, 생성된 브라우저 chunk, React 대조군 화면의 React.version을 모두 확인했습니다. 외부 react-dom 19.2.3의 lane 상수를 적용하지 않았습니다. [버전·해시·build ID](../../local/finance-router-layers-20261010/evidence/router-investigation/actual-runtime.json)

Finance 새 build ID는 Th4rzT7bhhPWMBrvqBgBm입니다. 모든 런타임 결과는 격리된 로컬 프로덕션/개발 환경의 합성 데이터이며 배포 운영 환경 검증은 아닙니다.

## 공개 이슈와 적용 가능성

[Next #98066](https://github.com/vercel/next.js/issues/98066)은 Next 16.3.3 / React 19.2.8에서 기본 Link와 force-dynamic 페이지를 사용하고, 대상 RSC fetch를 영구 미해결 Promise로 바꾼 뒤 fetch 함수를 복구하여 재클릭하는 사례입니다. 함수 복구는 이미 만들어진 영구 Promise를 해제하지 않습니다.

[Next #97807](https://github.com/vercel/next.js/issues/97807)은 Next 16.2.6 / React 19.2.8, output:export, Cloudflare Pages에서 payload 요청 hang/reject 및 query가 있는 projects에서 bare projects 이동을 다룹니다. Finance의 서버 프로덕션·즉시 viewport 변경·완료된 page RSC와 조건이 다릅니다.

조회 당시 두 이슈는 open이었고, [연결 PR #97815](https://github.com/vercel/next.js/pull/97815)도 unmerged였습니다. reject 시 MPA fallback 제안은 영구 pending 또는 fulfilled-null 고착의 검증된 수정이 아닙니다. [QuarkOS fork의 변경](https://github.com/QuarkOS/next.js/commit/170dbaf1711b39b4f12e5780cd6b1bcf42c323ea)도 upstream 출시 또는 Finance 수정 근거로 취급하지 않았습니다.

재현 저장소는 [c17b8e61ca83c4d618e073d3e0ca70835ab205ec](https://github.com/alireza-attari/next-staletimes-bfcache-repro/tree/c17b8e61ca83c4d618e073d3e0ca70835ab205ec)로 고정하여 소스를 읽고 보존했습니다. config 주석은 dynamic 0에서 회복한다고 하나 README/실행 코드의 설명은 다르므로 실행 결과를 기준으로 했습니다.

Finance에는 staleTimes 또는 unstable_dynamicStaleTime 사용자 지정이 없습니다. Next 16.2.12의 기본값은 dynamic 0 / static 300초이며, dynamic 0은 일반 navigation BFCache의 신선도 기준입니다. 별도 Segment Cache의 pending prefetch를 없애지 않습니다. 고정 소스에는 Pending entry에서 일반 파생 Promise를 만들고 이를 prefetchRsc로 채택하는 분기가 있으며 dynamic 비제로 조건이 없습니다. 따라서 **Finance에서도 해당 내부 경로는 가능하지만, 특정 실패의 entry가 그 경로에서 왔다는 identity 연결은 미확인**입니다.

- [16.2.12 기본 설정](https://github.com/vercel/next.js/blob/2234717e74ff24cd179d8128fa8af6c46cc4f24e/packages/next/src/server/config-shared.ts)
- [Pending prefetch 경로](https://github.com/vercel/next.js/blob/2234717e74ff24cd179d8128fa8af6c46cc4f24e/packages/next/src/client/components/router-reducer/ppr-navigations.ts#L1036)
- [LayoutRouter deferred 선택](https://github.com/vercel/next.js/blob/2234717e74ff24cd179d8128fa8af6c46cc4f24e/packages/next/src/client/components/layout-router.tsx#L428)

## 독립 실험 결과

| 실험 | 실제 결과 | 판정 범위 |
|---|---|---|
| Finance 원래 전환, 판정 후 계측 | 이전 build 8/8, 새 build 4/4 정상 | 새로운 실패의 lane/identity는 확보하지 못함 |
| Finance 로직 없는 작은 앱 | 기본/off prefetch × A/B/C/D/B응답200ms지연, 10/10 PASS | 실제 본문 가시성·버튼 동작 확인. Finance 로직의 필요성은 미확정 |
| 작은 앱 prefetch-only 영구 hang | 본문 표시, 함수 복구 후에도 정상 | pending prefetch만으로 이 앱은 멈추지 않음 |
| 작은 앱 all-flight / navigation-only hang | 차단 중 본문 없음, 복구·재클릭 후 표시 | 공개 원본의 지속 정지와 다른 결과 |
| 공개 원본, Next16.2.12로 pin, dynamic 미설정(0) | 약78초까지 URL / 유지 | 복구 후 각 클릭에 새 RSC fetch 시도 1회 |
| 같은 공개 원본, dynamic60 | 약78초까지 URL / 유지 | 만료 전 재클릭 0회, 만료 후 1회 |
| React 일반 resolved Promise 초기값 | ready 대조 1 PASS, nested-pending 대조 1 FAIL | 예상과 달리 loading fallback이 표시됨; 실패 가설 보존 |
| React prefulfilled-null 초기값 + pending 자식 | 1 PASS, 자식 해제 전후 차이 확인 | null 선택·빈 본문을 별도 렌더링 의존성만으로 만들 수 있음 |

A는 데스크톱 클릭 후 대기, B는 클릭 직후 모바일 변경, C는 본문 확인 후 모바일 변경, D는 직접 진입·새로고침입니다. 작은 앱은 root connection, cookies/searchParams, layout banner/loading, client component를 유지하고 Finance import를 제거했습니다. default와 off가 모두 통과했으므로 prefetch 변경의 개선 효과를 주장하지 않습니다.

공개 테스트의 exit 0/1 passed는 관찰 절차가 완료됐다는 뜻입니다. navigation 성공을 뜻하지 않습니다. 원본 로그의 ~65초 문구와 달리 실제 최종 관찰은 약78초였습니다. 일부 Flight body 조회는 리소스 소실로 실패했으므로 모든 새 응답의 HTTP body 완료를 확인했다고 주장하지 않습니다.

첫 standalone build는 packageManager 누락으로 Corepack의 차단된 네트워크 조회에서 실패했습니다. standalone packageManager를 기존 9.15.9로 명시한 뒤 성공했습니다. 원본 package/lockfile이나 의존성은 변경하지 않았습니다.

## 서로 다른 렌더링 중단 경계

| 항목 | 기존 Finance 실패 | 고정 버전 공개 재현 | React prefulfilled 대조군 |
|---|---|---|---|
| URL/내용 | /planning, 본문·loading 없음 | /, 기존 home 유지 | 동일 페이지의 probe 본문·fallback 없음 |
| 전체 page 값 | tagged RSC fulfilled → Fragment | 자식 page fulfilled | full Promise fulfilled |
| 확인된 정지 의존성 | 미확인 | target 부모 tagged RSC 109 pending | 의도적으로 미해결한 nested Promise |
| 선택값 | ordinary prefetch fulfilled → null, 형태 관측 | current page는 home RSC 선택 | null prefetch와 객체 identity 일치 |
| root lane | 기존 파일에 없음 | pending=suspended=entangled 1064448, pinged0 | pending=suspended 524288, pinged0 |
| 해제 효과 | 미검증 | 영구 Promise를 해제하지 않음 | nested 해제 후 본문 표시, pendingLanes0 |

공개 재현의 부모 wakeable 109는 첫 캡처와 최종 캡처에 같은 객체이며 root.pingCache의 여러 lane에 연결됐습니다. 자식 page RSC만 완료돼도 부모가 pending이면 render가 진행되지 않는 경계입니다. 원래 주입 fetch와 이 객체의 직접 provenance까지 연결한 것은 아니지만, 부모 pending이 현재 차단점인 증거는 있습니다. 이는 Finance의 active page에서 null prefetch를 표시하는 경계와 다릅니다.

React 대조군은 Next 앱 안의 작은 컴포넌트이며 navigation이나 Segment Cache 변경을 사용하지 않습니다. 초기 full/prefetch Promise의 React status/value를 의도적으로 fulfilled로 설정하고 자식 Promise만 pending으로 유지했습니다. 5초 관찰 후에도 committed 선택값은 prefetch이고 fallback은 0개였습니다. 자식만 resolve하자 본문이 나타났습니다. 첫 실험에서는 이 사전 fulfilled 상태를 만들지 않아 fallback이 표시됐습니다. 두 실험의 코드와 실패 trace를 모두 보존했습니다.

이 대조군은 **full RSC fulfilled가 전체 lazy/client/data 렌더링 준비 완료를 보장하지 않음**을 보여줍니다. Finance에 동일 pending 자식이 있거나 React 스케줄러가 정상이라는 증거로 확대하지 않습니다.

## Finance postmortem 계측과 한계

원래 quickstart의 5초 assertion 전에는 수집기를 실행하지 않았습니다. 이후에만 root pending/suspended/pinged/warm/entangled lanes, committed/alternate Fiber, RSC·prefetch·hook 선택 identity, context/loading, lazy payload/module 상태, 알려진 wakeable의 ping 연결, DOM/rect와 리소스 timing을 읽었습니다. lazy initializer·then·requireModule은 호출하지 않았습니다.

12개 정상 실행은 모두 full RSC 값을 선택했습니다. 그중 8개는 ordinary fulfilled-null prefetch도 갖고 있었습니다. 따라서 null prefetch 존재 자체가 충분조건은 아니라는 기존 결과를 강화합니다. 그러나 이번에는 실패가 없어 기존 실패의 비어 있는 lane·identity·깊은 lazy 자료를 복원할 수 없었습니다.

baseline-v1과 fresh-v2 계측 차이는 보존했습니다. v1은 trace 소스에서 원문을 추출했고 v2는 Set/ping/context/slot/양쪽 도달성 수집을 추가했습니다. alternate는 이전 tree일 수 있으므로 WIP로 단정하지 않습니다. 정상 root pending0인데 alternate childLanes32가 남는 사례도 있었습니다.

관측은 깊이/노드/배열/Map/Set 제한이 있고 잘림 count가 없습니다. Response chunk 일부는 요약만 하여 ping membership이 연결되지 않습니다. 정확한 미완료 pendingProps, retryCache membership, module-local workInProgress/finishedWork는 확보하지 않았습니다. 실패 시 전체 client module 준비나 정확한 background commit 중단 지점은 여전히 미확인입니다.

Segment Cache raw map은 module-local이고 일반 router에 노출되지 않습니다. readSegmentCacheEntry는 LRU 이동·만료 제거를 유발하므로 관찰용으로 호출하지 않았습니다. **Flight 요청 ↔ entry ↔ 파생 prefetch Promise ↔ 선택 hook의 전체 identity 연결은 NOT_VERIFIED**입니다. 원인 미확정 상태에서 node_modules 패치 또는 framework upgrade를 적용하지 않았습니다.

## 새로 실행한 필수 검증

| 검사 | 결과 |
|---|---|
| 기존 8개 파일 단위 테스트 | 98/98 PASS |
| corepack pnpm lint | 전체 대상 PASS |
| corepack pnpm typecheck | PASS |
| corepack pnpm build | 공식 safe build PASS |
| corepack pnpm planning:ssot:check | guard 및 catalog 11/11 PASS |
| 개발 핵심 E2E | 11/11 PASS |
| 프로덕션 핵심 E2E | 4/4 PASS |
| 저장·리포트 reload·재열기·동일 profile/run·빈 목표 복원 | 원래 quickstart 기대값 유지, 개발/프로덕션 통과 |
| git diff --check 및 소스 보존 | PASS |

단위 대상은 dashboard-view-model, planningQuickStart, profileFormModel, workspaceProfileBundle, workspaceQuickStartHandoff, create-run-persistence, simulateMonthly, goalDeadline입니다. E2E는 workers1/retries0, trace on이며 정확한 명령은 linked executed-commands.json 및 run-gates.py에 보존했습니다. 빌드에는 기존 middleware 폐기 경고가 있습니다.

전체 새 trace 45개에서 pageError는 0건입니다. console.error는 총9건으로, 개발8건/프로덕션 보조1건입니다. 의도된503, 요청실패/누락 snapshot/digest 주입과 MOIS·EXIM ENV_MISSING 두400을 원문 응답으로 확인했습니다. 빈 본문 대상 quickstart 및 독립 실험에서는 console.error/pageError가 없었습니다. 전체 콘솔이 무오류였다고 주장하지 않습니다.

- [콘솔 감사](../../local/finance-router-layers-20261010/evidence/router-investigation/console-audit.json)
- [환경 오류 응답](../../local/finance-router-layers-20261010/evidence/router-investigation/env-console-evidence.json)
- [보존 확인](../../local/finance-router-layers-20261010/evidence/router-investigation/final-preservation.json)
- [증거 checksum·마스킹 감사](../../local/finance-router-layers-20261010/evidence-audit.json)

## 판정과 구체적 미확인 항목

- IMPLEMENTED: 격리 계측·독립 대조군·증거 수집. 제품 수정 없음.
- TEST_PASSED: 위 필수 검사. 공개 재현은 navigation 실패를 관찰한 것이며, 첫 React pending 대조의 실패도 보존.
- RUNTIME_VERIFIED: 정상 Finance 흐름, 공개 주입 정지, React pending 자식의 해제 전후.
- SOURCE_APPLIED: 새 제품·정식 테스트 변경 없음. 조사 기록만 추가.
- DEPLOYED: 아니요.
- USER_GOAL_COMPLETE: 아니요. NOT_COMPLETE.

A의 stale prefetch 인과, B의 scheduler 결함, C의 Finance component 필요성, D의 prefetch 변경 효과는 모두 미확정입니다. dynamic0이면 해당 prefetch 경로가 없다는 가설과 full RSC fulfilled만으로 전체 렌더링 준비를 보장한다는 해석은 반박됐습니다. 이번 정상 반복을 원인 해결 또는 수정 후 검증으로 세지 않습니다. 인과가 없어 최소 수정·수정 전후 비교·수정 후30회는 수행하지 않았습니다.

다음 실패에서는 (1) committed null 선택과 full RSC의 실제 identity에 root lane·ping 대상 연결, (2) 미완료 subtree의 pendingProps와 lazy/client/data wakeable 및 source module 대응, (3) Flight chunk에서 raw Segment Cache entry와 파생 prefetch Promise까지의 provenance를 함께 확보해야 합니다. 이미 기록한 정상·공개·React 대조군과 대조하면 부모 pending, 내부 자식 suspension, 예약/commit 유실을 구분할 수 있습니다. 추가 반복만으로 빈칸을 채우지 않도록 이번 정해진 Finance 8+4회와 가설별 대조 후 중단했습니다.
