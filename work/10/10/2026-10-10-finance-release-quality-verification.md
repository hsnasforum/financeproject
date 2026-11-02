# Finance 출시 적합성 검증 및 복구 안정화 — 2026-10-10

## 판정

출시 판정은 보류합니다. 복구 감지 결함을 수정하고 원본에 반영했지만, 전체 출시 게이트의 실패와 Windows 검증 공백이 남아 있습니다. 최초 간헐 빈 본문의 근본 원인을 FIXED로 처리하지 않습니다.

| 항목 | 판정 | 확인 범위 / 남은 조건 |
| --- | --- | --- |
| MITIGATION | PASS | 제목만 남음·이전 Dashboard DOM·실제 정지 주입·재진입·명시적 복구·입력 보호 검증 |
| PRODUCT_QUALITY | PARTIAL | 핵심 입력→저장→실행→리포트 및 RC 통과. 전체 unit/E2E 기존 계약 실패 잔존 |
| RELEASE_GATES | FAIL | 보안 감사, freshness, 기존 unit/golden/debug 계약 불일치 |
| WINDOWS_RUNTIME | PARTIAL | 실제 Windows Chrome 자동 열기·인증·저장·리포트·재시작·탭 재열기 확인. 복구 confirm 완료와 native Windows 설치 미검증 |
| DATA_SAFETY | PASS — 격리 합성 데이터 범위 | 실제 암호화 백업 왕복, 12개 저장 파일 유지, 설치 실패 rollback 및 정상 update 동등성 |
| ROOT_CAUSE | OPEN | Next.js 최초 간헐 오류의 근본 원인 미확정. 이번 정지 주입은 원인 재현이 아님 |

IMPLEMENTED / SOURCE_APPLIED: YES. 해당 범위 TEST_PASSED / RUNTIME_VERIFIED는 아래 실제 결과로 제한합니다. DEPLOYED: NO. 전체 USER_GOAL_COMPLETE / RELEASE_READY: NO.

## 기준선과 보호 범위

- 기준 HEAD: `e296a529f1e3d48c224aee36ca1b9bf65ee0cf44`, branch `main`.
- 이전 autonomy-first-proof, production-blank-investigation, router-layer-investigation, navigation-recovery 기록 및 원시 실패 trace를 보존했습니다.
- 기존 DashboardClient, dashboard-current-state, planning-quickstart-preview 3개는 시작 SHA-256 그대로입니다. 기존 layout 연결도 그대로입니다. recovery component/test는 기존 구현·assertion을 보존하며 보강했습니다.
- package.json, pnpm-lock.yaml, next.config.ts, playwright.config.ts 해시 불변. 버전 1.4.0, Next.js 16.2.12, Node 22.22.2, pnpm 9.15.9 유지.
- 원본 운영 DB·백업·기존 설치본에 접근하거나 변경하지 않았습니다. commit/stage/push/배포/release:prepare/전역 설정 변경은 하지 않았습니다.
- 자동 검사는 기존 `/tmp/finance-autonomy-20261010-d0bd4l_g`의 bwrap, 별도 data root를 사용했습니다. unit DNS/audit는 같은 파일 격리에서 network만 사용했습니다. Windows 상호운용 검토는 별도 설치·HOME·XDG data root에서 공식 런처로 실행했습니다.
- source-preservation.json에 반영 전 drift 검사, 반영 후 원본=검증 사본 해시 및 보호 파일 해시가 있습니다.

## 확인된 결함과 변경 파일

| 파일 | 이번 변경 |
| --- | --- |
| src/components/PlanningNavigationRecovery.tsx | h1·임의 상태 DOM 대신 실제 Planning form 또는 경로별 정상 상태 marker로 도착을 판정합니다. 클릭 직전에 본문/경로를 재확인해 늦게 나타난 입력 화면에서 오래된 복구 버튼이 동작하지 않게 합니다. |
| src/components/planning/PlanningAuthRequiredState.tsx | 인증 안내에 callback 경로 marker를 부여합니다. |
| src/components/VaultLockScreenClient.tsx | Vault 확인 중/잠금 UI에 구별 가능한 상태 marker를 부여합니다. |
| tests/e2e/planning-navigation-recovery.spec.ts | 제목만 남음, 이전 Dashboard DOM, viewport 변경, 키보드/취소, 늦은 본문·입력 및 재소실 회귀를 추가합니다. |
| tests/e2e/planning-release-persistence.spec.ts | 저장 중 복구 취소·재열기, 실제 암호화 백업 export/finalize/preview/replace restore 및 데이터 동등성 검사를 추가합니다. |
| tests/e2e/planning-v2-fast.spec.ts | 닫힌 계산 조건을 실제로 펼치고, 조건부 안내 링크에는 결정적인 stale snapshot fixture를 준비합니다. 기존 assertion은 유지합니다. |
| tests/e2e/planning-desktop-auth.spec.ts | 기존 lazy 보조 정보 로딩을 검사하기 전에 사용자가 details를 펼치는 동작을 추가합니다. 기존 assertion은 유지합니다. |

제목만 남은 경우와 `/planning` URL에 이전 Dashboard DOM이 남은 경우는 변경 전 복구 UI가 나오지 않아 각각 실패했습니다(`risk-red`). 기존 감지가 h1/일반 상태 요소를 정상 본문으로 오판한 것이 직접 원인입니다. 경로별 marker 수정 후 같은 조건이 통과했습니다. 이는 복구 기능 자체의 결함 수정이며 최초 라우터 결함의 원인 설명이 아닙니다.

복구 임계값 10초를 늘리지 않았고, prefetch/라우터/프레임워크/금융 계산/저장 구현을 바꾸지 않았습니다. 자동 새로고침은 없습니다. 기존 한국어 안내·입력 유실 경고·명시적 확인을 유지합니다. source에는 정지 주입 hook, React private API, node_modules 패치가 없습니다.

## 실제 검증 결과

| 검사 | 결과 |
| --- | --- |
| 전체 unit/integration, 912 files / 4,212 tests | 최종 전체 실행 4,206 PASS / 2 FAIL / 4 SKIP. 이 중 non-Git fixture 환경 실패는 별도 2/2 재검사 PASS. 아래 기존 문구 기대값 실패 1개 잔존 |
| 기존 핵심 unit 98개 | 위 전체 실행에서 8개 파일·98개 모두 PASS; core-unit-in-full-run.json |
| 전체 E2E 129개 | 111 PASS / 6 FAIL / 12 SKIP. 실패를 삭제하거나 전체 PASS로 재표기하지 않음 |
| 개발 실패 구간 재검사 22개 | 19 PASS / 2 FAIL / 1 SKIP. backup scope·Dashboard·fast 회귀 통과, debug 설정/상태 계약 실패 잔존 |
| 공식 planning:v2:complete | PASS, fast 8/8 및 report/guide/security/guard/smoke 포함 |
| 공식 e2e:rc | 49 PASS / 2 SKIP |
| 공식 e2e:release:contracts | 실제 production build + 14/14 PASS |
| production 복구 검사 | 10/10 PASS. 정상 이동·11.5초 지연·정지·제목·stale DOM·인증·데이터 오류·모바일/데스크톱·키보드·취소·재진입 포함 |
| production 저장 중 복구 | 1/1 PASS, 저장 1회·취소 후 재열기 4,950,000 유지 |
| production 실제 암호화 백업 왕복 | 최종 1/1 PASS. 프로필/목표/run/report 전체 객체 및 SHA-256 동등 |
| 최신 개발 fixture 3개 | 3/3 PASS |
| 실제 설치본 desktop auth | 최종 3/3 PASS. 비인증 401, OAuth 비노출, one-shot 재사용 거부, 새 브라우저의 정상 bootstrap 및 reload |
| production 보안/노출/CSP | 3/3 PASS: CSP 콘솔 위반 없음, diagnostics 비노출, dev/debug 경로 404 |
| lint / typecheck / build | PASS. 마지막 테스트 변경은 추가 lint/typecheck 재검사 PASS |
| prod smoke / desktop smoke / SSOT / inventory / multi-agent guard | PASS |
| compat | PASS (`--skip-complete`, complete는 별도 최종 통과) |
| postgres readiness | dry-run PASS. 실제 PostgreSQL 배포 검증 아님 |
| 공식 release:verify | FAIL. 첫 private-network 감사 차단 후 네트워크 허용한 감사도 실제 취약성 매칭으로 FAIL. 나머지 gate를 독립 실행했으나 전체 성공으로 합치지 않음 |

최종 복구/데이터 trace 검사에서 page exception 0, 예상하지 않은 console error 0입니다. 데이터 오류 주입 시 의도한 HTTP 500 resource error 1건은 정상 UI 오류 상태 검사의 증거로 구분했습니다.

초기 시험 오류도 보존했습니다. HMR 간섭 trace에는 Fast Refresh 123회와 후속 RSC 요청이 있으며 이를 hard document reload로 표현하지 않습니다. unit과 dev를 순차 실행하자 backup/Dashboard 실패가 사라졌습니다. TMPDIR/Git 경계, EXDEV, fixture DNS, Corepack 버전 선택은 격리 runner에서만 교정했습니다. production CSS 주입의 CSP 차단과 고정 session Cookie가 CSRF/preview Cookie를 덮는 문제는 새 테스트 setup에서 해결했습니다. 보안 정책·guard를 완화하지 않았습니다.

## 데이터 보존과 설치 실험

- 실제 production backup 60,450 bytes. 전후 profile/goals/run/report SHA-256 모두 `635a820ba2b055e776f87bf3b1f948d0edb16a87218c00f7594343db0680dca0`.
- Windows 실제 사용자 흐름에서 만든 합성 profile/목표/run/report 관련 12개 파일은 재시작·탭 재열기·패키지 인증 검사 후에도 집합과 hash 모두 같았습니다.
- 공식 installer로 독립 fixture를 만든 후 stage-copy EIO, stage→target EINVAL을 각각 주입했습니다. 둘 다 exit 1이며 기존 설치·DB·데이터가 보존됐습니다.
- 활성화 실패에서 `original-moved-to-backup → injected-activation-failure → original-restored-from-backup`의 실제 rename 순서가 확인됐습니다.
- 같은 artifact 정상 update는 exit 0. 41,018개 파일/875,219,523 bytes의 경로·hash·mode 및 SQLite·내/외부 합성 marker가 동등했고 잔여 stage/backup은 0개였습니다.
- 설치 fixture SQLite는 schema-only입니다. 금융 데이터의 의미 있는 복원은 별도 실제 backup 테스트가 검증합니다. 실제 사용자 DB·과거 Windows 설치본의 migration/ACL/파일잠금 검증으로 확대하지 않습니다.

## Windows와 검토 패키지

독립 검토 설치: `/home/xpdlqj/finance-review/20261010-release-quality/installed`.
재현 실행기: 같은 디렉터리 상위 `start-review.py` (공식 verify와 launcher 호출, 전용 HOME/data, port 43176). 종료 시 검토용 런처 2개만 종료했고 포트가 닫힌 것을 확인했습니다.

정상 candidate의 production BUILD_ID는 `KD0T4inGzm6qSbBL7K4uH`, 설치본과 일치합니다. artifact checksum은 `6b2f03ef3c01c53f7ebd1528d6c032e8f7e4c7246587e7589155ae8093b02111`입니다. 원래 build `XbryjzKYR8ozutmcDmLfJ`의 PASS를 새 제품 변경의 증거로 대체하지 않았습니다.

실제 Windows Chrome에서 공식 WSL→cmd.exe 경로의 브라우저 자동 열기, session bootstrap, 대시보드→재무진단, 월 수입 4,800,000/목표 24,000,000·12개월 입력, 저장, 실행, 리포트 보관·상세 보기, 앱 재시작 및 탭 재열기를 확인했습니다. 이 흐름의 관측 콘솔 오류는 0개였습니다.

`fault-probe`는 별도 BUILD_ID `iTkORbluGELdtKHeCo-CI`의 TEST ONLY 설치입니다. 정상 인증 후 query 조건에서 제목만 반환하도록 만든 사본이며 candidate/원본에는 포함하지 않았습니다. 실제 Windows Chrome에 복구 안내와 두 버튼이 나타났고 Enter로 confirm이 열렸습니다. 이후 제어 도구가 `Emulation.setFocusEmulationEnabled` timeout을 반환하여 취소·재로딩·홈 이동 완료를 확정하지 못했습니다. 이 단계는 PASS가 아닙니다. 확인 창이 남아 있는 경우 해당 테스트 탭은 사용자가 닫아야 합니다.

이 패키지는 Linux x64/Node ABI 127용 WSL 런타임이며 Windows-native 배포판이 아닙니다. Windows 네이티브 설치, shortcut/OS 설정 변경, 실제 파일 잠금·ACL·shortcut 실패 rollback은 실행하지 않았습니다.

## 출시 전 남은 구체적 항목

1. **deps:audit FAIL**: 매칭 25행/고유 GHSA 21개(Critical 3, High 12, Moderate 9, Low 1). Finance exploit를 재현한 결과는 아니지만 필수 gate 실패입니다. Next/전이 의존성의 보안 갱신과 호환성 검증이 필요합니다. 원인 조사 버전·lockfile 보존 범위에서 임의 전체 업그레이드는 하지 않았습니다. `security-audit-summary.json`에 공식 advisory 링크가 있습니다. Windows-hosted server advisory를 WSL Linux 서버와 동일 조건으로 취급하지 않았습니다.
2. **freshness FAIL**: benefits_snapshot.json 예외 만료. 날짜나 허용 기준을 바꾸지 않았습니다. 승인된 데이터 갱신 또는 예외 정책의 실제 타당성 확인이 필요합니다.
3. **unit 기존 계약 불일치**: tests/planning-reports-page-fallback.test.tsx:417의 이전 문구와 현재 페이지 문구. 원본/HEAD 동일 상태에서도 불일치합니다. 기존 기대값 보존 요청에 따라 바꾸지 않았습니다.
4. **golden 기존 계약 불일치**: case-006만 GOAL_MISSED 추가로 FAIL, 나머지 8개 PASS. 현재 기한 계산·문서·goalDeadline 검사는 late achievement 경고를 요구하고 과거 golden은 이를 포함하지 않습니다. 재무 결과를 바꾸거나 golden을 자동 승인하지 않았습니다. 정확한 달성월은 현행 정규화 report에서 제거되어 이번 기록에 추측하지 않습니다.
5. **전체 debug E2E 계약**: 비로컬 forwarded host의 실제 403 vs 기대 404, 전체 `--debug-pages`와 beginner developer-control 0개 기대의 충돌. 정상/production 노출 검사는 별도 통과했지만 이 전체 suite 실패는 잔존합니다.
6. **Windows 검증**: 실제 Chrome에서 복구 confirm 완료를 재검증할 수 있는 정상 제어 도구/수동 확인, 별도 Windows-native build·설치/업데이트/ACL/shortcut 검증이 필요합니다. 기존 설치본 교체는 하지 않았습니다.
7. **최초 라우터 근본 원인**: ROOT_CAUSE_OPEN 유지. 복구 성공이나 반복 통과로 Next Segment Cache/React deferred render/Finance 로직 중 하나를 확정하지 않습니다.

## 증거 위치

- 공유 가능한 요약/화면/동등성: `work/local/finance-release-quality-20261010/`.
- verification-summary.json, source-preservation.json, build-provenance.json, console-audit.json, core-unit-in-full-run.json, security-audit-summary.json 및 checks/*.result.json.
- raw-evidence-manifest.json: 원시 로그/trace 경로·SHA-256. 원시는 기존 `/tmp/.../evidence`에 보존했습니다. 합성 session/CSRF 값을 포함하는 trace는 공유용 사본으로 복사하지 않았습니다.
- installer 실패 driver/preload/events: 독립 검토 디렉터리의 `install-failure-fixtures/run-e1d16d25/`.
- Superpowers systematic-debugging, test-driven-development, verification-before-completion을 적용했습니다. 테스트/구현 원인 분리 및 정적 독립 검토를 완료했습니다.
