# 2026-10-18 프로필 편집 경합 보강

## 목표와 기준
- 목표: Planning workspace 프로필 편집에서 늦게 도착한 상세·목록·저장 응답이 현재 선택, 새 입력, 저장 대상을 되돌리거나 섞지 않게 합니다.
- 기준: `/home/xpdlqj/code/finance`, branch `checkpoint/finance-review-20261011`, HEAD `e474aeba6b47570e2a85f56dc14ce5f23e92a51d`. 커밋은 하지 않았습니다.
- 보존: 기존 dirty 파일(`work/10/10/2026-10-10-finance-remaining-release-validation.md` +12)과 미추적 `.data/planning-debug-access-check/`, `__meta/`, `tmp/`, `work/10/17/`은 건드리지 않았습니다.
- 2호 작업 파일: 같은 작업 트리에서 2호가 수정 중인 dashboard·package·auth·`tsconfig.playwright.json`·`vitest.config.ts` 등은 손대지 않았습니다.
- 결정 사항(마스터):
  - 저장 중에 입력이나 선택을 잠그지 않습니다.
  - 서버 PATCH revision 확장은 범위 밖입니다.
  - create/duplicate에서는 사용자가 이동했거나 계속 입력했으면 현재 선택과 입력을 유지하고, 변화가 없을 때만 새 프로필을 선택합니다.
- 이 기록은 처음에 `work/10/18/finance-profile-race-hardening.md`로 만들었다가, 대상 파일이 없음을 확인한 뒤 현재 이름으로 옮겼습니다.

## 변경 파일 (파일별 내용)
- 이 기록의 4개 파일(아래와 끝의 "저장 완료 안내 P3 보완")은 모두 `2026-10-18-finance-git-closeout.md` "커밋 1"(`bd0133b4`)의 26개 경로에 들어 있습니다.

`src/components/planning/workspace/useWorkspaceProfileBundle.ts`:
- **선택 동기화**: 선택 ref를 선택하는 시점에 바로 갱신하고, 선택 세대(generation)도 함께 올립니다.
- **상세 응답**: 아래 조건을 모두 만족할 때만 반영합니다. 같은 선택·세대·epoch의 중복 요청은 한 번만 보냅니다.
  - 요청한 id와 현재 선택이 같다.
  - 선택 세대가 그대로다(A→B→A도 거부됨).
  - 데이터 epoch가 그대로다(저장·삭제가 확정되면 올라감).
  - 최신 상세 요청 순번이다.
- **목록 응답**:
  - 최신 요청 순번만 성공·실패·finally를 처리합니다.
  - 선택은 **응답을 반영하는 시점에** 다시 정합니다. 요청 이후 사용자 선택이나 내용 편집이 있었으면 요청 당시 id(예: 새 복제본 C) 대신 현재 선택을 유지합니다.
  - 선택이 실제로 옮겨질 때는 사용자 선택과 같게 처리합니다. 편집 표시를 해제하고 새 프로필 값을 불러옵니다.
- **편집 판정**:
  - 이전 form·name snapshot(effect 갱신) 대신 내용 편집 버전 ref를 씁니다. form, 이름, JSON 초안, JSON Apply, 샘플, 빠른 시작 적용이 동기적으로 이 값을 올립니다. 포커스는 올리지 않습니다.
  - hydrate는 요청 이후 내용 편집이 있으면 stamp, cache, dirty 표시를 바꾸지 않고 건너뜁니다.
- **저장 후처리**:
  - 저장 응답 시점에는 후속 목록에서 선택할 id와 dirty 해제 여부만 정합니다(`resolveProfileSaveFollowUp`).
  - 완료 알림은 후속 목록을 반영한 **뒤** 실제 선택과 미저장 입력 여부로 정합니다(`resolveProfileSaveCompletionNotice`).
- **SSR 초기 이름**: SSR로 받은 프로필이 있으면 `profileName` 초기값을 그 이름으로 둡니다.

그 밖의 파일:
- `tests/planning/ui/workspaceProfileBundle.test.ts`: 판정 helper 테스트입니다. 기존 6개와 신규 5개, 총 11개입니다.
- `tests/e2e/planning-profile-races.spec.ts`(신규): 실제 서버 응답을 받은 뒤 전달만 늦추는 회귀 테스트 15개입니다. 그중 JSON 초안 2개는 `--debug-pages`에서만 실행됩니다.
- `playwright.config.ts`: `testIgnore`에 `**/.claude/worktrees/**`, `**/work/local/**`를 추가했습니다. 두 경로는 오래된 `tests/e2e` 사본입니다. `work/local` 사본은 helper import가 깨져 있어, 필터 없는 `--list` 전체를 실패시키고 있었습니다.
- `profilePanel.tsx`는 수정하지 않았습니다.

## 검증
실행 방식:
- 2차 검증은 `tmp/finance-usability-20261018/run.sh`로 실행했습니다(`wsl.exe -d Ubuntu --exec bash run.sh <log> <command>`).
- 로그 끝의 `CHILD_EXIT_CODE`와 도구 반환 exit를 함께 확인했습니다.
- 1차 로그의 `EXIT=` 줄은 바깥 셸이 `$?`를 먼저 확장한 값이라 무효입니다. 자세한 정정은 `tmp/finance-usability-20261018/LOG-NOTES.md`에 있습니다.

### 1차(id6)
- **변경 전**:
  - 경합 7건이 실패했습니다: 상세 지연 후 B 선택, A→B→A와 옛 상세, PATCH 중 편집, 저장 중 B 이동, create 중 B 이동, 옛 목록 성공, 옛 목록 실패.
  - `e2e-before.log`는 8 failed였고, 명령은 실패(exit 1)했습니다. 이 중 3건은 테스트 대기 결함이었고, 보정 후 `e2e-before2.log`는 2 failed / 2 passed, 명령 실패(exit 1)였습니다.
- **변경 후**:
  - races 9 passed, `--repeat-each=3`에서 27 passed. 두 로그 모두 실제 exit는 보존되지 않았고, 근거는 Playwright 요약과 ELIFECYCLE 부재입니다.
  - 회귀 묶음은 **42건 중 36 passed / 6 failed로 전체 명령이 실패(exit 1)**했습니다. 실패 6건은 모두 `.claude/worktrees/*` 사본이었고, 정식 경로 18건은 통과했습니다.

### 2차(리뷰 id8 보완), 실제 exit 보존
- **변경 전 재현**(id6 소스, `r2-before-new.log`, `r2-before-json.log`): 둘 다 CHILD_EXIT_CODE=1, 도구 exit 1.
  - 복제 후속 GET 중 편집: 선택이 C로 바뀜.
  - 생성 후속 GET 중 편집: 선택이 C로 바뀜.
  - 초기 상세 요청: 2회 발생(기대 1회).
  - JSON 유효/무효 초안: PATCH 후 덮어써짐.
  - 해제 직후 편집 테스트는 변경 전에도 통과해, effect 지연은 재현되지 않았습니다. 그래도 snapshot을 동기 ref로 바꿔 구조적으로 제거했습니다.
- **Playwright 수집**:
  - 변경 전 필터 없는 `--list`: `Total: 0 tests in 0 files`, exit 1(`work/local` 사본 import 오류).
  - 변경 전 정식 경로 고정 필터 `^/home/xpdlqj/code/finance/(tests/e2e|e2e)/`: 158 tests / 33 files, exit 0.
  - 변경 후 필터 없는 `--list`: 158 tests / 33 files, exit 0. 정렬 목록 diff가 동일했고, 사본은 0건입니다(`list-before-canonical.txt`, `list-after.txt`).
- **변경 후**:
  - vitest `--dir tests/planning/ui workspaceProfileBundle`: 1 file, 11 passed, exit 0.
  - ESLint(변경 4파일): exit 0.
  - E2E: races, `planning-v2-fast`, `planning-release-persistence` 저장 테스트를 `--grep-invert "real encrypted backup"`으로 실행. 24건 중 22 passed / 2 skipped(debug 전용), exit 0.
  - E2E `--debug-pages`: JSON 초안 2건과 PATCH 중 편집 1건, 3 passed, exit 0.
- **기본 `corepack pnpm typecheck`: 미완료(exit 2)**. 남은 오류는 이전 빌드 생성물 `.next/types`의 `src/app/api/finlife/pension/route.js` 참조 3건(TS2307)입니다. 소스 오류는 0건입니다. 중간에 생긴 소스 오류 1건(`loadProfiles` 반환 타입과 controller의 `Promise<void>` 계약 불일치)은 원래 시그니처로 되돌려 해결했습니다. 생성 타입 재생성과 build는 통합 단계로 남겼습니다.
- 실행 뒤 남은 dev server·playwright 프로세스와 `.next-e2e-*`·`/tmp/finance-full-e2e-*`가 없음을 확인했습니다. 기존 `.data`와 사용자 DB에는 쓰지 않았습니다.

## 사용 skill
- 없음

## 남은 리스크 (미확인 포함)
- 서버 PATCH는 last-writer-wins입니다(여러 탭 동시 저장). 범위 밖입니다.
- 프로필을 바꾸면 이전 프로필의 미저장 입력을 버리는 기존 동작은 유지됩니다. 선택된 프로필이 목록에서 사라져 선택이 강제로 바뀌는 경우에도 미저장 입력을 버립니다.
- 포커스만 해도 같은 프로필의 hydrate를 막는 기존 동작은 유지됩니다.
- 기본 typecheck 통과, build, 전체 E2E, desktop 실기는 2호 변경이 끝난 뒤 통합 게이트에서 확인해야 합니다.

## 저장 완료 안내 P3 보완 (클로드 2호, 앱 재개 후)
- 결함: 완료 안내의 `hasUnsavedEdits`가 저장 요청 시점 이후 전역 content version이 바뀌었는지만 봤습니다. 그래서 다음 순서에서 "아직 저장되지 않았습니다. 저장을 한 번 더 누르세요"가 나왔습니다.
  - A를 X로 저장(응답 보류) → B 선택 후 편집 → A로 복귀(B 편집 폐기) → 응답과 후속 목록 조회 완료
  - 이때 화면 A와 서버는 모두 X였습니다.
  - 원인은 프로필을 바꾸면 이전 편집을 버리는 계약인데도 version을 되돌리지 않은 데 있습니다.
- 변경: `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
  - `selectionContentVersionRef`를 추가했습니다. 기존 계약상 편집을 버리는 두 지점(`selectProfileId`, `loadProfiles`의 `selectionMoves`)에서 그 시점 content version을 기록합니다.
  - `hasUnsavedProfileEditsAfterSave = current !== max(dispatch, selection)`을 완료 안내 계산에만 씁니다.
  - focus(local-edit flag), 선택 generation, data epoch, 목록 순번, detail dedupe, hydrate 차단, JSON 초안 보존, create/duplicate 후속 선택, `Promise<void>` 계약은 바꾸지 않았습니다.
- 테스트
  - `tests/planning/ui/workspaceProfileBundle.test.ts`: 경계 6건을 추가했습니다(B 폐기 / 복귀 후 Y / 보류 중 Y / 저장 전 편집만 / B 유지 편집 / 이전 규칙).
  - `tests/e2e/planning-profile-races.spec.ts`
    - "returning to A after dropping a B edit does not ask to save A again"를 추가했습니다.
    - JSON 초안 테스트에 미저장 안내 표시 assertion을 추가했습니다.
  - 처음 작성한 `toHaveCount(0)`는 안내가 4.5초 뒤 자동으로 사라질 때 통과해 버려서, 수정 전 소스에서도 통과했습니다(`02-before-e2e-p3-copy.log`). 안내 요소 전체 문구가 정확히 일치하는지 보는 방식으로 바꿨습니다.
- 검증(로그 `tmp/finance-resume-20261018/`, Node 22.22.2, 자식 exit 기록)
  - 수정 전(격리 복사본 old 소스)
    - unit: 4 failed / 23 passed, exit 1 (`01-before-unit-copy.log`). P3 unit 실패는 helper 미존재 형태입니다.
    - E2E: 1 failed, exit 1 (`03-before-e2e-p3-copy-fixed-assertion.log`). 실제 문구는 "프로필을 수정했습니다.↵저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다…"였습니다.
  - 수정 후(복사본에 소스 동기화, development)
    - races spec 16건 중 14 passed / 2 skipped(debug 전용), exit 0 (`05-after-e2e-profile-races-dev-copy.log`)
    - `--debug-pages`: 실제 Y 유지·P3·JSON 초안 2건, 4 passed, exit 0 (`06-…`)
  - 원본
    - unit 7 files 99 passed, exit 0 (`07`)
    - eslint 0 errors(기존 warning 1건), exit 0 (`08`)
    - `corepack pnpm typecheck` exit 0 (`09`)
    - Playwright tsc exit 0 (`10`)
- E2E는 격리 복사본에서 일회용 `/tmp` data root와 쓰지 않는 DB URL로 실행했습니다. 실행 후 data root를 삭제했고 남은 프로세스는 없습니다.
- 앱 쓰기 승인: 이번에는 정상 응답했습니다. 이전 1800초 timeout은 재발하지 않았습니다.

## 다음 라운드
- "남은 리스크"의 통합 게이트 항목은 이후 `2026-10-18-finance-usability-integration.md`에서 실행했습니다: 기본 typecheck `40` exit 0, 원본 build `39`, 격리 복사본 full test `37` exit 0, desktop smoke `16`(type-only 수정 전 소스).
- 전체 E2E는 그 통합 기록에도 실행 기록이 없습니다(미실행).
- 서버 PATCH last-writer-wins는 범위 밖으로 남깁니다.
