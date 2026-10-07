# Finance 전환 전 후속 보완

## 변경 이유

기존 정리 후보 하나를 유지하면서 전환·복원 중단 복구, 현재 입력에 연결된 freshness 판정, 공백 4건과 검토 지문을 보완했습니다. 원본 또는 통합 후보 commit, 원본 clean 전환, 게시, 기존 설치 채택, 실제 DB 변경·restore는 실행하지 않았습니다. Git mutation은 작은 합성 fixture 내부 검증에만 사용했습니다.

## 변경 파일

- `src/components/dart/DartSearchPanel.tsx`: 의미 변화 없이 trailing whitespace 3줄과 EOF 빈 줄 제거. 원본은 보존.
- `scripts/data_freshness_report.mjs`: opt-in `--json-report`로 파일별 strict 결과와 정책 오류를 별도 신규 파일에 기록. 기존 예외·만료·threshold·assertion·입력은 유지.
- `tests/data-freshness-report.test.ts`: fresh/stale 결과, 입력·check-only 보존, 만료 정책 실패, 기존 영수증 덮어쓰기 거부 검증 추가.
- `docs/package-scripts.md`: 새 옵션과 판정 범위 설명.
- 이 closeout. 시작 tree `ed91de4a4bfdb88b005005441465037f93f603df` 이후의 정확한 5개 파일 delta는 정리 root 후속 디렉터리의 `followup-only.patch`로 제공.

후보 밖 `/home/xpdlqj/finance-cleanup-20261007-IXQpy1/pretransition-20261007`에 공통 `transition_engine.py`, 실제 Git 실패 fixture, 새 plan/patch/manifest/review groups와 현재 판정 근거를 준비했습니다. 정리 root의 두 shell wrapper는 이 engine을 호출하며 이전 버전은 `before/`에 보존했습니다.

## 사용 skill

- `planning-gate-selector`, `dart-data-source-hardening`, `work-log-closeout`.

## 핵심 변경

- candidate group commit, 원본 checkpoint ref, stash, local fetch, fast-forward의 intent를 먼저 fsync하고 실제 OID/tree를 대조한 뒤 결과를 기록합니다. candidate의 완료 tip은 불변입니다.
- stash 직후 receipt 전에 중단돼도 operation marker, 이전 stash stack, parent, index/worktree/untracked tree를 대조해 재발견합니다. 원래 staged 신규 파일과 그 파일의 추가 unstaged 수정도 보존합니다.
- rollback은 원래 branch/HEAD/tree/logical index·flags/staged·unstaged patch/status/source manifest 및 연결 worktree를 실제 비교합니다. 임시 복원 파일은 dirfd/no-follow와 파일별 임시명으로 완성한 뒤 게시하며 게시 직후 중단도 재개합니다.
- 기존 refs/stash와 이번 작업이 만드는 backup/ready ref·새 stash를 구분해 보존합니다. 작업 후 .git 전체 byte가 예전과 같다고 주장하지 않습니다. 알 수 없는 dirty·ref·stash·symlink 대체는 덮어쓰지 않고 중단합니다.
- engine은 매 apply/resume에서 현재 wall-clock strict 검사와 offline exception policy 검사를 별도로 실행합니다. 명령/cwd/실행 시각/Node·pnpm/tree/source manifest/input·policy·engine hash/파일별 상태를 기록하며 15분 또는 입력 변경으로 오래된 근거를 거부합니다. 과거 data:doctor exit나 수동 JSON 수정으로 승인하지 않습니다.
- 합성 경계는 checkout뿐 아니라 git-dir/common-dir/alternates/linked worktree도 검사하고 상속 GIT_* 경로 변경을 제거합니다. 테스트가 실제 원본·후보 Git metadata로 넘어가지 않도록 했습니다.

## 검증

- `node --check scripts/data_freshness_report.mjs`: PASS.
- `corepack pnpm exec vitest run tests/data-freshness-report.test.ts`: **18 PASS**. 기존 합산 1,483과 별개의 타깃 실행이며 중복 합산하지 않습니다.
- 변경한 script/test/Dart component의 `corepack pnpm exec eslint ...`: PASS.
- 두 prepared wrapper `bash -n`, Python source parse: PASS.
- `python3 .../pretransition-20261007/test_transition_engine.py`: **13 test methods / 32 시나리오 PASS**. 최종 engine SHA-256 `61214f838a3ba33d90e620bc76afa8054b57395af0c92f85fed4c0ff6ac12ff6`, 실행 동안 engine 지문 불변. 최종 로그 `checks/20261007T071255Z-git-fixtures-final.log`.
- 성공 왕복, 실제 2번째 commit hook 실패, commit 직후 중단, stash 직후 기록 전 중단, 실제 fetch/merge 명령 실패, rollback 5개 중단 위치·재개, staged 신규/수정·unstaged·untracked·ignored·기존 stash·dirty 연결 worktree, 새 사용자 변경 거부, 동일-tree 외부 commit 거부, 외부 Git metadata·환경변수 경로 주입을 포함합니다. 기존 coverage guard 5개를 전체 왕복 검증으로 확대하지 않았습니다.
- 중간 실행 1회는 검사 도중 engine 파일이 바뀌어 bindingUnchanged=false로 차단됐습니다. strict 두 명령 자체는 fresh/exit 0이었고 gate가 실행기 변경을 거부했습니다. 해당 실패 로그도 보존하고 최종 고정본으로 위 fixture를 재실행했습니다.
- 현재 시각의 실제 후보 strict: **fresh 0/stale 8, exit 1**. offline policy: benefits의 만료 예외에서 **exit 1**. 전부 2026-06-22 UTC 생성, 2026-09-30T00:00:00Z 만료입니다. 최종 index 갱신 후 그 tree/manifest에 연결된 영수증을 별도로 남깁니다.
- 기존 `preservation/` 256개 파일, 과거 `checks/` 63개 파일은 이번 시작 이후 수정된 mtime가 없습니다. 보존 archive의 전체 복원/111,696개 검증을 반복한 것은 아닙니다.

## 남은 리스크

- freshness 8개 해결 0. 파일별 소비·DB 완료 evidence·fallback 차이, 후보 전용 신규 DB/root와 공식 명령·부분 실패·복원 승인 조건은 `pretransition-20261007/FRESHNESS_DECISIONS.md`에 기록했습니다. 만료일 연장·예외 삭제·clock/generatedAt 변경 없이 기본 전환 차단을 유지합니다. source-only 유보 전환을 선택하지 않았습니다.
- 이전 1,483 PASS는 최초 128개 파일과 수정 후 3개 파일의 합산 결과입니다. Windows native 4 SKIP, 실제 Windows 기본 브라우저 전달 미실행, backup E2E의 mock 범위, 운영 DB restore 미실행을 유지합니다.
- 이전 build/artifact/install/smoke와 제품 검증은 당시 source 지문의 결과입니다. 이번 제품 delta는 공백뿐이고 freshness CLI/test/docs는 앱 번들 경로에 추가되지 않았으므로 광범위 제품 검증을 반복하지 않았습니다. 기존 artifact를 새 tree 결과로 이름만 바꾸거나 재게시하지 않았습니다.
- 검토용 index는 갱신하지만 실제 후보 HEAD는 시작 base에 그대로 둡니다. 실제 전환 승인은 최종 plan의 정확한 tree와 local commit/checkpoint/stash/fetch/FF 범위를 지정해야 하며 freshness 해소 및 재판정이 선행 조건입니다. 원격 게시·설치·운영 데이터 채택은 별도 범위입니다.
