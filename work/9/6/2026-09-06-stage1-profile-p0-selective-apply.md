# 2026-09-06 Stage 1 프로필 P0 선택 반영과 legacy 기간 검증

## 변경 파일

- `src/lib/planning/store/profileStore.ts`
- `src/lib/planning/api/storageErrorResponse.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/app/api/planning/profiles/route.ts`
- `src/app/api/planning/profiles/[id]/route.ts`
- `tests/planning/profileCorruption.test.ts` (신규 전체 파일)
- `tests/planning-v2-api/profile-corruption-route.test.ts` (신규 전체 파일)
- `tests/e2e/error-state-retry.spec.ts`
- `README.md`
- `docs/planning-v2-ops.md`
- 이 신규 작업 기록 1개

## 사용 skill

- `planning-gate-selector`: 저장 읽기·API·호환성·사용자 흐름의 필수 검증 선택.
- `work-log-closeout`: 실제 실행 결과와 보존·인계 근거 기록.
- `planning-storage-integrity`: B의 `.codex/skills/planning-storage-integrity/SKILL.md`를 명시적으로 읽은 지침으로 재사용. A로 복사·등록하지 않았으며 자동 로딩 여부는 미확인.

## 변경 이유

CORE: 저장된 프로필의 손상을 빈 목록·기본값·구형 자료로 감추지 않고, 실패하는 요청에서 원본을 보존한다. 기존 Stage 1 구현을 유지하고 확정된 B 제품 패치와 남은 기간·기한 검증만 반영했다.

A는 `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`, branch `stage1/accuracy-safety-clean-ci-20260902`, 시작 HEAD `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`, 시작 status는 clean이었다.

B 인계 출처는 `/tmp/finance-profile-followup-ft67kvgg/product-handoff.json`과 `product-handoff.diff`다. B HEAD는 `c1cad28d37ad683d9c52b2d6dbcfcf4000530838`, branch는 `fix/profile-corruption-preservation-c1cad28d`다. 인계의 종료 시각은 `2026-09-06T09:15:33Z`, 패치 확정 시각은 `2026-09-06T09:32:05.492607Z`다. 반영 직전에 아래 raw diff SHA-256, 11파일의 현재 B postimage, A 기준 blob/bytes, 신규 테스트 전체 내용, 검증 기록 지문을 직접 대조했다. `git apply --check` 후 작업 트리에만 적용하고 11/11 postimage 일치를 확인했다.

```text
B diff SHA-256: 407836b4cce770a1b1eabe68cd334990fae3acaa67a61e3b3643efb037246153
```

요청·추천 설정은 `gpt-6-astra / high`이며, 현재 Task의 `2026-09-06T09:47:58.813Z` 실행 `turn_context`에서도 model `gpt-6-astra`, effort `high`를 확인했다. 설정 파일이나 모델 선택을 수정하지 않았다.

## 핵심 변경

- B 최초 P0와 startup 보완을 포함한 제품 11파일 전체를 A에 반영했다. 저장 오류 응답, 원본 보존, fresh-process 테스트, 브라우저 오류 재시도와 운영 문서가 포함된다.
- A 추가 소스 변경은 저장 읽기 검증 projection의 `remainingMonths`/`termMonths`, `targetMonth`/`dueMonth` 원본값 검사다. 공개 normalizer·migration 정책·금융 계산은 변경하지 않았다.
- 명시된 원본 필드가 별칭보다 우선한다. 문자열·null·0·음수는 기존 validator로 거부하고, 정상 생략·정상 별칭·1개월·1.5개월의 기존 정규화 결과를 유지한다.
- legacy/partition 및 Vault 켜짐/꺼짐에서 오류 직후 bytes·SHA-256·size·mtime·존재 여부를 비교하고, 새 partition·`.bak` 생성 여부를 검사했다. 실제 startup과 별도 프로세스 재실행 보존도 유지했다.
- README의 보존 안내를 반영하고 운영 문서에 원본 기간 검증과 기존 호환성 한계를 추가했다.

## 검증

모든 아래 제품 검증은 A에서 실행했다. B의 PASS를 A 결과로 대신하지 않았다. 근거 디렉터리는 `/tmp/finance-a-profile-p0-91g9u0lx/`이며 각 `<label>.json`에는 실제 command·exit·시간·제품 11파일의 실행 전후 SHA가, `<label>.log`에는 원문 출력이 있다.

| 검사 | 실제 결과 | 근거 label |
| --- | --- | --- |
| 보완 전 corruption 2파일 | exit 1, 70 failed / 77 passed. 기간·기한 및 별칭 오류와 원본 보존 실패 재현 | `red-durations` |
| 보완 후 직접 영향 11파일 | exit 0, 11 files / 227 tests passed | `focused` |
| `corepack pnpm typecheck` | exit 0 | `typecheck` |
| `corepack pnpm lint` | exit 0 | `lint` |
| `corepack pnpm run test --maxWorkers=4` | 최종 exit 0, 866 files / 3,546 tests passed | `full-test-final` |
| `corepack pnpm build` | exit 0, 246/246 static pages | `build` |
| `corepack pnpm planning:v2:compat` | exit 0, 내부 complete PASS·fast E2E 8/8 | `compat` |
| `corepack pnpm e2e:rc` | exit 0, 47 passed / 2 skipped / 0 failed | `rc` |
| 최종 diff·신규 파일 형식·보존 | 제품 범위·형식 및 B/C/D/PR #300 보존 통과. A index raw SHA 보존은 실패(아래 구분) | `final-preservation` |

직접 영향 검증의 실제 명령:

```sh
corepack pnpm run test tests/planning/profileCorruption.test.ts tests/planning-v2-api/profile-corruption-route.test.ts tests/planning-store.test.ts tests/planning/profileStoreStartupGate.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning/vault-storage-migration.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/trash-route.test.ts tests/planning/ops/backup-api.test.ts tests/planning/migrations/compat-fixtures.test.ts tests/planning-v3-storage-error-api.test.ts --maxWorkers=4
```

정상 v1 fixture의 debt/goal 항목 수, balance 120,000,000·APR 4.2·remainingMonths 220·targetAmount 18,000,000·currentAmount 8,000,000·targetMonth 24·minimumMonthlyContribution 300,000을 검증했다. 생략 시 기존 remainingMonths 36/targetMonth 없음, 정상 별칭 18, 원본 우선순위, 무시되는 잘못된 후순위 별칭, 최소 경계 1과 기존 소수 절삭 결과도 통과했다.

실제 startup 검사에서는 정상 legacy-a와 다른 ID broken-b partition을 요청 전에 배치하고 list/create/upsert/update를 각각 새 프로세스의 첫 operation으로 실행했다. 각 합성 저장소에서 두 프로세스 모두 오류 직후 원본이 유지되고 `.bak`·새 legacy-a partition이 없음을 확인했다. 정상 단건 조회, 신규 저장소, Vault 변환, metadata 복구, namespace·인증·origin·입력 오류, trash·backup·공유 storage 오류 응답도 직접 영향 검증에 포함된다.

Node `v22.23.2`, 최종 pnpm `9.15.9`, Linux Git `/usr/bin/git`를 사용했다. 테스트 worker 4는 Vitest의 지원 옵션이며 B의 자원 경합 경험을 참고해 처음부터 제한했다. 테스트 내용·timeout·보안 assertion을 완화하지 않았다. compat가 같은 제품 상태에서 complete를 실제 실행·통과했으므로 별도 complete 재실행은 생략했다. 설정 guard·모델 smoke·B 검사·live 금융 API·실제 desktop 설치/복원·원격 CI·수동 5분 self-test는 별도로 실행하지 않았다.

검증은 합성 data root와 임시 DB/XDG 경로에서 수행했다. A의 실제 `.data`, 기존 `.next`, `test-results`, 생성형 tsconfig/next-env/tsbuildinfo는 임시 mount로 가렸다. browser wrapper가 별도 포트·distDir·합성 데이터 경로를 배정했다. store/API의 파일 보존 검증과 route.fulfill 합성 오류 응답에 대한 브라우저 UI 검증은 구분한다.

환경 실패와 복구 이력:

- 최초 `corepack pnpm test ... --maxWorkers=2` 호출은 격리 `XDG_CACHE_HOME` 때문에 기존 Corepack의 pnpm 9.15.9 선택을 놓쳐 pnpm 12.3.4를 다운로드하고 자동 의존성 설치를 실행했다. `ERR_PNPM_IGNORED_BUILDS`, exit 1로 종료했으며 제품 테스트는 실행되지 않았다(`red.log/json`). 설치 금지 조건을 위반한 실행 부작용이다.
- 자동 변경된 `pnpm-lock.yaml`, `pnpm-workspace.yaml`은 시작 clean HEAD의 바이트로 복구했다. 변경된 의존성은 scratch의 `unexpected-pnpm12-node_modules/`에 보관하고, dependencies/devDependencies/pnpm 설정과 lockfile이 모두 같은 B의 기존 Linux `node_modules`를 로컬 복사해 A를 복구했다. 추가 설치는 하지 않았다. 원래 A `node_modules` 전체의 바이트 동일성은 증명할 수 없다. 근거는 `dependency-recovery.json`이다.
- 이후 `COREPACK_HOME=/home/xpdlqj/.cache/node/corepack`, `COREPACK_ENABLE_NETWORK=0`, `COREPACK_ENABLE_AUTO_PIN=0`으로 고정했다. pnpm 9의 `test` 옵션 파싱 실패 1회(`red-fixed-environment`, exit 1) 뒤 지원되는 `pnpm run test ... --maxWorkers=N`으로 실행했다.
- 첫 전체 검사와 좁은 `/tmp` bind 재시도는 2파일/22검사에서 owner archive/restore 보안 검사가 실패했다(`full-test`, `tmp-boundary`). full-root bwrap에서 호스트 root 소유자가 UID 65534로 보이는 것이 원인이었다. 호스트 `/tmp`는 UID 0/mode 1777였고 격리 내부에서는 UID 65534였다. 새 namespace root로 임시 상위 디렉터리 소유권을 유지하자 해당 2파일/35검사가 통과했다(`tmp-owner-corrected`). 그 뒤 전체 검사를 다시 통과했다. 제품 및 보안 코드는 바꾸지 않았다. 좁은 성공 기록의 오래된 sandbox 설명 문자열에 대한 정정은 `execution-context.json`에 있으며 최종 전체 기록은 실제 `sandbox_argv`를 포함한다.

최종 제품 산출물:

- `a-product-final.diff`: A HEAD 대비 제품 11파일 전체 diff(신규 테스트 전체 포함). SHA-256 `02d417d2a9bab12825aff786405e288f017c78c0f9ffbd69c488481197c4f959`.
- `a-only-increment.diff`: 확정 B postimage 대비 A 보완 4파일. SHA-256 `f3f92613aa721e89f9a3d4d10f62dc815fdd6b4666346e6a40c352f191eba6e0`.
- `a-product-final.sha256`: 제품 11파일 최종 SHA 목록. 신규 테스트 전체는 `final__tests__planning__profileCorruption.test.ts`, `final__tests__planning-v2-api__profile-corruption-route.test.ts`에도 보관했다.
- `workspace-before.json`, `final-preservation.json`, `a-final-manifest.json`: 작업공간 기준과 최종 보존·검증 연결 근거.

RC의 skip 2개는 인증 전용 E2E 설정이 필요한 `error-state-retry.spec.ts:105`와 production runtime 전용 `smoke.spec.ts:444`다. 이 실행은 기본 development RC이며 해당 조건을 바꾸지 않았다. 47개 통과와 두 미실행 분기를 구분한다. RC WebServer의 종료와 전체 실행 프로세스의 exit 0을 확인했다.

종료 A branch와 HEAD는 시작값을 유지한다. 최종 status는 제품 tracked 9개 수정, 신규 테스트 2개와 이 기록 1개 untracked이며 staged 변경은 없다. B/C/D/PR #300의 branch·HEAD·status·검사 대상 파일 digest·index SHA는 시작값과 일치한다. 기준 JSON을 JavaScript로 전달하며 nanosecond mtime 정수 정밀도가 일부 손실됐으므로, 그 값의 엄격 동등 비교를 파일 변경으로 오판하지 않고 SHA 및 내용 비교로 판정했다.

A index raw SHA는 시작 `2bcd906bdb7d1afd42d78aff27b9c2ec11e89c3410db497ef681ec80c2d778d2`에서 종료 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`로 바뀌었다. mtime은 `2026-09-06T09:55:54.166745Z`다. 최종 `git ls-files --stage`의 4,300개 mode/blob/path는 HEAD tree와 모두 일치하고 cached diff는 비어 있다. 일부 진단 `git diff` 조회에 `GIT_OPTIONAL_LOCKS=0` 적용을 빠뜨려 stat cache가 갱신됐을 가능성이 있으나 정확한 변경 주체·메타데이터 차이는 원본 index 사본이 없어 확정하지 않는다. index 바이트 보존 조건은 충족하지 못했으며, staging 내용 보존과 구분한다. 이를 감추기 위해 index를 재작성하지 않았다. 근거는 `index-exception.json`이다.

```text
B_HANDOFF_ACCEPTED=true
B_PATCH_SNAPSHOT_VERIFIED_LOCALLY=true
A_LOCAL_PRODUCT_PATCH_APPLIED=true
LEGACY_FIELD_VALIDATION=PASS
PRE_STARTUP_PRESERVATION=PASS
A_REQUIRED_GATES=PRODUCT_CHECKS_PASS_PRESERVATION_EXCEPTION
A_PRODUCT_IMPLEMENTATION=IMPLEMENTED_AND_TESTED
ORIGINAL_MAIN_D_MODIFIED=false
B_C_PR300_MODIFIED=false
CONFIG_MODIFIED=false (최종 바이트 기준; 자동 설치로 인한 중간 변경은 복구)
INDEX_MODIFIED=true (A raw bytes; staged 내용 변경 없음)
COMMITTED=false
PUSHED=false
PR_CHANGED=false
MERGED=false
RELEASED=false
```

## 남은 리스크

- 최초 자동 설치 부작용은 위에 공개했다. Git 설정 파일은 복구했으나 원래 A 의존성 디렉터리의 전체 byte-for-byte 보존을 주장하지 않는다.
- A index의 raw byte 보존도 충족하지 못했다. 원본 사본이 없어 정확한 바이트 복원은 불가능하며 제품 검증 통과로 이 보존 예외를 덮지 않는다. 추가 staging·commit·push는 없다.
- 기존 `monthlyPayment=920000`의 계산된 `minimumPayment=783050` 정규화와 `liabilities`만 있는 자료의 debt 항목 누락 한계는 이번에 확장 수정하지 않았다. 전체 legacy 무손실 호환성은 보장하지 않는다.
- 사전 검사 이후 외부 프로세스가 파일을 바꾸는 경쟁 조건이나 쓰기 중 I/O 실패까지 포괄하는 다중 파일 트랜잭션 보장은 없다.
- 사용자 원본 금융 데이터, 실제 설치/복원, live upstream, production 실사용을 검증한 것으로 확대하지 않는다.
