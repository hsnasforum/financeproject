# Finance dirty 정리 준비

## 변경 이유

원본의 누적 변경과 기존 worktree의 staged/unstaged/untracked를 보존하고, 현재 원격 main 기준의 독립 통합 후보 하나를 검토할 수 있게 준비했습니다. 기존 원본·worktree·설치·사용자 데이터 전환이나 Git 게시는 이번 준비 범위에 포함되지 않습니다.

## 변경 파일

- 후보: `/home/xpdlqj/finance-cleanup-20261007-IXQpy1/candidate`
- 원본 HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, 원격 기준 `d84010413cedc6080248d8f3c711e50cef2f8f22`.
- 경로별 분류·해시·보존 위치는 준비 root의 `classification.json`, 후보 전체 변경 목록과 patch는 `candidate-files.json`, `candidate-review.patch`에 기록합니다.
- 원본 561개 Git-visible 변경과 ignored `src/app/api/dev/benefits/coverage/route.ts`를 포함했습니다. `.gitignore`의 coverage 범위는 루트 테스트 산출물로 한정합니다. `middleware.ts` 삭제와 `src/middleware.ts` 추가를 유지합니다.

## 사용 skill

- `planning-gate-selector`, `codex-agent-rules-maintenance`, `route-ssot-check`, `dart-data-source-hardening`, `work-log-closeout`.

## 핵심 변경

- 원격 #296~#299의 tree 동등 반영과 후속 dirty를 구분했습니다. PR #300의 8개 파일 변경은 후보의 선행 의존성으로 검토 포함했으며 PR 상태를 바꾸지 않았습니다.
- runtime/owner/backup/writer 경계, 목표 하나와 빈 goals 저장, dashboard→진단→저장 리포트, WSL 브라우저 전달 동작, 10/7 경량 하네스를 보존했습니다.
- 실제 3-way 충돌 44개를 해소했습니다. 원격 상품 snapshot/요청 수명과 로컬 canonical 중복 제거를 결합하고, 서로 다른 상품을 의도한 테스트 fixture의 이름을 구분했습니다. 같은 상품의 provider 중복 검증은 유지했습니다.
- 원격 브라우저 백업 테스트를 현재 encrypted server backup + browser settings UI 계약에 맞췄습니다. 추천 snapshot 테스트는 서버가 확인한 owner를 사용합니다. 보안 guard와 assertion을 완화하지 않았습니다.
- CI Windows job에 PR #300 pnpm pin을 보완하고, 기존 Node/Windows job 계약을 검사하도록 테스트를 맞췄습니다. 브라우저 opener의 실행 동작을 유지하면서 주입 함수의 JSDoc 타입을 명시했습니다.
- 12개 저장소의 소스와 4개 독립 common Git 디렉터리를 보존하고, 원본을 참조하지 않는 별도 복원 공간에서 index·refs·stash·소스 대조와 Git fsck를 수행했습니다. related 12개 archive의 111,696개 항목은 archive 내용·mode·링크 지문으로 검증했습니다. 기존 설치를 실행 복원했다는 뜻은 아닙니다.
- 추가 ignored 검증 기록 174개를 보존·복원 대조했습니다. 용도가 불명확한 runtime/DB/env는 내용 복사 없이 원위치 보존·삭제 제외로 등록했습니다.

## 검증

- 변경/충돌 관련 Vitest 131개 파일: 최초 128 PASS, 3 실패 파일 수정 후 해당 3개 모두 PASS. 최종 조합 1,483 PASS, 플랫폼 조건부 4 SKIP. 전체 재실행으로 표현하지 않습니다.
- `corepack pnpm planning:user-scope:check`: 15개 파일, 94 PASS.
- `corepack pnpm planning:ssot:check`: guard 및 11 PASS.
- `corepack pnpm sec:check`, `lint`, `typecheck`, `multi-agent:guard`: PASS. TOML 9개 parse 및 runner `bash -n`: PASS.
- `corepack pnpm build`: 새 결합 제품 소스로 1회 PASS. Node 실제 22.23.2, 요구 22.22.2 차이는 유지·기록했습니다. pnpm 9.15.9와 lockfile을 사용했습니다.
- 공식 desktop build `--no-next-build`, pristine artifact 검증, 신규 독립 install/runtime verify, 공식 desktop smoke(3459): PASS. 기존 설치본에는 적용하지 않았습니다.
- 독립 정상 launcher(3457): middleware HTTP 21 PASS, 실제 broker의 정상 인증 E2E 3 PASS. preinjected cookie 없이 PC/모바일 새 브라우저와 one-shot 재사용 거부를 확인했습니다.
- 독립 합성 데이터 launcher(3458): quickstart 1 PASS. 목표 1개 저장→리포트 재열기→마지막 목표 삭제→빈 배열 저장→재시작을 확인했습니다. 기존 리포트는 목표 1개를 유지하고 저장 기록 11개 파일의 digest가 재열기 전후 같았습니다.
- 상품·Gov24·FX·백업·주거·추천 E2E: 최초 29 PASS/1 FAIL, 현재 서버 owner 계약에 맞춘 추천 테스트 단독 재검사 PASS. 최종 30개 모두 통과한 범위이며 전체 재실행은 하지 않았습니다.
- PC 저장 리포트와 모바일 재무 진단 screenshot을 직접 확인했습니다.
- `corepack pnpm data:doctor`: FAIL. `config/data-freshness-exceptions.json`의 8개 예외가 2026-09-30 만료됐고 첫 benefits 예외에서 종료합니다. schema report는 breaking 0/nonBreaking 1입니다. 생성 보고서는 별도 검사 증거로 보존하고 후보의 기존 보고서를 되돌려 검사 산출물 잡음을 제거했습니다. 만료 예외를 연장하지 않았습니다.
- 최종 원본·기존 worktree·주변 사본 대조 26건 PASS, drift 0. Git 공통 저장소 전체 파일 지문 및 protected 데이터 metadata도 기준과 같았습니다. DB의 논리 일관성을 검사한 것은 아닙니다.
- `git diff --cached --check`는 원본에서 그대로 보존한 `DartSearchPanel.tsx`의 trailing whitespace 3줄과 EOF 빈 줄 1건을 보고합니다. 동작 변경과 무관한 기존 서식은 자동 정리하지 않았으며 diff-check PASS로 표기하지 않습니다.

## 남은 리스크

- freshness 실패는 해소되지 않았습니다. 최종 출시/전체 제품 정상 또는 모든 필수 gate 통과로 선언하지 않습니다. 공식 데이터 갱신 또는 예외 정책에 대한 별도 판단이 필요합니다.
- Windows native 전용 4개 검사는 WSL에서 SKIP됐습니다. 이번 검증에서 Windows 기본 브라우저 실제 전달은 새로 실행하지 않았고, 전달 동작·22개 단위검사·기존 관련 근거를 보존했습니다.
- live 외부 API, 실제 사용자 DB 복원, 기존 설치 업데이트 및 원격 required CI는 미실행입니다.
- artifact manifest의 gitSha는 미커밋 후보의 base SHA입니다. 실제 검토 소스는 별도 전체 source manifest와 staged tree 지문으로 식별합니다.
- 분류 완료/후보 준비와 원본 clean/공식 main/기존 설치 반영을 구분합니다. 후자의 세 작업은 실행하지 않았습니다.
- 원본 .git은 linked worktree 공통 저장소입니다. 기존 폴더 이동/교체 없이 stash 보존 후 승인된 후보로 fast-forward하는 계획과 rollback을 준비 root의 전환안에 별도로 기록합니다. 삭제 승인 적격 목록은 현재 비어 있습니다.
