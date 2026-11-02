# 2026-09-06 legacy 부채 월 상환액·liabilities 무손실 호환성 수정

## 변경 파일

작업 루트: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`.

- `src/lib/planning/v2/profileNormalize.ts`: 기존 payment alias 뒤에 `monthlyPayment` 추가.
- `src/lib/planning/v2/loadCanonicalProfile.ts`: debts 미지정 시 liabilities 배열을 migration 입력으로 전달.
- `src/lib/planning/store/profileStore.ts`: legacy raw payment 검증에도 monthlyPayment 추가.
- `tests/planning/v2/legacyDebtCompatibility.test.ts`: 신규 public canonical/record migration 회귀 13개.
- `tests/planning/legacyDebtStorage.test.ts`: 신규 실제 store/Vault 경계 및 fresh-process 회귀 31개.
- `README.md`, `docs/planning-v2-ops.md`: 해결된 두 호환성 한계와 저장 검증 계약 반영.
- 이 종료 기록.

## 사용 skill

- `planning-storage-integrity`: B의 `/home/xpdlqj/code/.worktrees/finance-profile-corruption-preservation-c1cad28d/.codex/skills/planning-storage-integrity/SKILL.md` 원본을 읽어 적용. normalization 뒤 raw 검증, mutation 전 preflight, Vault와 실제 startup, bytes/SHA/mtime 보존을 확인했다.
- `planning-calculation-integrity`: 같은 B 경로의 `planning-calculation-integrity/SKILL.md` 원본을 읽어 적용. public canonical 경로, payment 추정값과 명시값, APR 단위와 기간·목표 데이터 보존을 검증했다.
- `planning-gate-selector`: A의 기존 skill로 focused → 전체 검사 → compat/내부 complete와 build를 선정했다.
- `work-log-closeout`: A의 기존 skill로 이 한국어 종료 기록과 실제 검사/미확인을 구분했다.

skill/config 복사·등록·이관은 하지 않았다. manager가 4단계로 범위를 분해하고 raw 저장 계약과 최종 증분을 읽기 전용으로 검토했다. 구현과 최종 gate는 메인 에이전트가 실행했다.

## 변경 이유

CORE. 시작 branch `stage1/accuracy-safety-clean-ci-20260902`, HEAD `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`와 현재 미커밋 Profile P0·goal allocation·goal deadline 패치를 기준으로 삼았다. 이전 수용된 preservation exception은 재심사하지 않았다.

제품 수정 전 실제 `loadCanonicalProfile`에서 재현한 결과:

| 입력 | 수정 전 실제 결과 | 최종 결과 |
| --- | --- | --- |
| repository `profile-record-v1.json`, monthlyPayment=920000 | minimumPayment=783050 | minimumPayment=920000 |
| liabilities-only, liabilityId=loan-legacy, principalKrw=120000000, ratePct=4.2 또는 apr=0.042, termMonths=220, monthlyPayment=920000 | debts=[] | debts 1개, 원본 ID·금액·APR·기간·상환액 유지 |
| debts와 liabilities 동시 제공 | debts 우선, 빈 debts도 우선 | 유지 |
| 기존 minimumPayment/minimumPaymentKrw/monthlyPaymentKrw | 명시값 유지 | 유지 |
| 모든 payment 생략 | 기존 amortizing 추정값 783050 | 유지 |
| monthlyPayment=0 | 783050으로 대체 | 명시값 0 유지 |
| 정상 schema v2 | 기존 canonical shape | 동일, 재정규화도 동일 |

최초 작성한 v2 테스트는 schemaVersion이 profile 본문에도 남는다고 잘못 기대했다. 실제 계약인 load 결과 envelope의 schemaVersion으로 assertion을 바로잡고, 제품 변경 전 다시 실행한 `canonical-red-confirmed`에서 13개 중 7 passed / 두 결함 관련 6 failed를 확정했다.

`storage-red`는 31개 중 4 passed / 27 failed였다. v1 payment는 실제 store/partition/Vault 경로에서도 추정값으로 바뀌었고, 명시적 문자열·null·음수가 거부되지 않아 원본 파일 또는 저장 트리가 달라졌다. liabilities-only는 public canonical과 store의 plain→partition/Vault conversion에서 모두 debts=[]로 반환됐다. 수정 후 두 경로가 모두 정상 부채를 유지한다.

## 핵심 변경

- payment 우선순위는 `minimumPayment` → `minimumPaymentKrw` → `monthlyPaymentKrw` → `monthlyPayment`다. 기존 세 alias의 우선순위와 0원 의미를 유지하며, 지원 payment가 완전히 생략된 경우의 추정식·반올림 정책도 유지한다.
- migration은 `source.debts === undefined`이고 liabilities가 배열일 때만 liabilities를 사용한다. 기존 debts가 명시된 경우의 precedence를 바꾸지 않는다. APR·기간·repaymentType 정책은 바꾸지 않았다.
- 저장 검증의 `storedValue`는 undefined만 미지정으로 취급한다. 기존 validator의 finite non-negative number 계약과 기존 alias의 null 거부를 실제 테스트로 확인하여 monthlyPayment에도 적용했다. 문자열·null·음수는 StorageCorruptedError이며, 유효한 후순위 alias나 추정값으로 숨기지 않는다.
- repository v1은 balance=120000000, apr=0.042 → aprPct=4.2, remainingMonths=220, minimumPayment=920000을 함께 유지한다. 목표의 targetAmount=18000000, currentAmount=8000000, targetMonth=24, priority=5, minimumMonthlyContribution=300000도 보존한다. 비상금 이름의 기존 Emergency Fund 정규화는 그대로다.
- 정상 plain→partition/Vault conversion과 fresh-process startup/reload가 통과했다. 손상값은 detail/list, legacy/partition, Vault off/on 및 이미 암호화된 payload에서 bytes/SHA/mtime과 파일 목록을 보존했다. 잘못된 입력에서 migration state·.bak·partition·Vault rewrite가 생기지 않는다.

NaN은 유효 JSON 숫자가 아니다. 실제 파일의 NaN token은 JSON parse corruption으로 차단하는 기존 동작을 확인했고, JSON.stringify(NaN)이 되는 null도 supplied payment corruption으로 차단했다. 임의의 새 null 정책이나 NaN 저장 형식을 만들지 않았다.

## 검증

Ubuntu WSL/Linux Node `v22.23.2`, `/usr/bin/git`, 기존 `/usr/bin/corepack pnpm@9.15.9`를 사용했다. 직접/내부 pnpm 버전 모두 9.15.9다. 프로세스 환경에 아래 값을 고정했다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

검사 runner와 증거는 `/tmp/finance-a-legacy-debt-20260906/`에 있다. 기존 runner의 read-only node_modules/Git/config 보호와 scratch data/cache/build 출력 격리를 재사용했다. 설치·update·prepare·dlx·npx·autopin·index 재작성은 실행하지 않았다. 각 label의 `.json`에 실제 argv/exit/시간과 검사 전후 소스/index SHA를 기록한다.

아래 `P`는 `/usr/bin/corepack pnpm@9.15.9`다. 실제 호출 형식은 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-legacy-debt-20260906/run.py <label> <P 뒤 인자>`다.

| 검사 | 결과 | label |
| --- | --- | --- |
| 수정 전 public canonical | 7 passed / 6 failed, 실제 두 결함 재현 | canonical-red-confirmed |
| 수정 전 store/Vault/startup | 4 passed / 27 failed | storage-red |
| canonical·normalization·record migration 5파일 | 30 passed | focused-normalization |
| Profile P0·store·startup·Vault·migration 10파일 | 218 passed | focused-storage |
| goal allocation·deadline·snapshot·DTO 5파일 | 51 passed | goal-baseline |
| `P typecheck` | PASS | typecheck |
| `P lint` | PASS | lint |
| `P run test --maxWorkers=4` | 871 files / 3637 tests passed | full-test |
| `P planning:v2:compat` | PASS. 내부 complete PASS, fast E2E 8/8. complete 별도 반복 없음 | compat |
| `P build` | PASS. 246/246 정적 페이지 생성 완료 | build |

focused-normalization: `tests/planning/v2/{legacyDebtCompatibility,loadCanonicalProfile,profileNormalize,normalizationReport}.test.ts`, `tests/planning/migrations/profileMigrate.test.ts`를 `P run test ... --maxWorkers=4`로 실행했다.

focused-storage: `tests/planning/legacyDebtStorage.test.ts`, `tests/planning/profileCorruption.test.ts`, `tests/planning-v2-api/profile-corruption-route.test.ts`, `tests/planning/profileStoreStartupGate.test.ts`, `tests/planning/startupMigrationGate.test.ts`, `tests/planning/vault-storage-migration.test.ts`, `tests/planning-store.test.ts`, `tests/planning/migrations/{compat-fixtures,manager,runner}.test.ts`를 같은 방식으로 실행했다.

goal-baseline: `tests/planning-v2/{goalAllocation,goalDeadline,goalDeadlineConsumers,simulateMonthly.snapshot}.test.ts`, `tests/planning/v2/resultDto.test.ts`를 같은 방식으로 실행했다. 신규 startup 테스트는 real module을 별도 Node 프로세스에서 import하며, Vitest의 부모 프로세스 mock을 상속하지 않는다. 정상 입력은 startup의 원본 .bak와 재시작 후 전체 부채·목표 값도 확인한다.

UI/route/selector/브라우저 동선 변경은 없어 별도 `e2e:rc`는 선정하지 않았다. compat 내부 complete의 기존 fast E2E는 프로젝트 계약대로 수행한다. build는 공유 canonical/store 로더를 소비하는 Next import 경계 확인을 위해 포함한다.

최종 검사와 보존 대조:

- typecheck 43.17초, lint 63.35초, 전체 test 115.29초, compat 231.09초, build 251.02초로 모두 exit 0이다. `final-review.json`에서 모든 gate의 검사 전후 소스 SHA와 최종 파일의 일치, 검사 전후 index 동일성을 확인했다.
- 이번 snapshot 변경·갱신 명령은 없다. 기존 Profile P0 회귀와 allocation 22개, deadline 엔진 12개·소비자 9개 및 기존 snapshot을 그대로 통과했다.
- 시작 기준 A 4,308개 파일을 대조했다. 허용한 기존 5개 파일 외 변경·삭제는 없고, 새 파일은 테스트 2개와 이 기록이다. 제품 변경은 3개 파일의 alias/입력 선택뿐이다. P0의 profileStore는 payment alias 한 항목을 제외한 전체 본문이 시작값과 같다. P0의 나머지 제품·테스트, allocation/deadline 코드·테스트·기존 기록은 보존했다.
- raw index SHA-256은 시작/종료 모두 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`이며 branch/HEAD도 같다. `git diff --check`가 통과했다. stage/unstage, index 재작성, commit/push/PR/merge 명령은 실행하지 않았다.
- package/lock/workspace/config 파일은 시작 SHA와 같다. node_modules는 검사 중 read-only로 보호했고, `.modules.yaml`, `.pnpm/lock.yaml`, vitest/next/tsc 실행 파일의 SHA와 mtime도 시작값과 같다. 새 dependency/preservation exception은 없다.
- B/C/D/PR300의 시작 branch/HEAD/status/raw index SHA와 추적·미추적 파일 SHA를 각각 다시 대조해 동일함을 확인했다. 비교 파일 수는 B 4,310개, C 4,279개, D 4,438개, PR300 4,301개다.
- 증거는 scratch의 `start.json`, 각 gate의 `.log`/`.json`, `final-review.json`, `legacy-debt-increment.diff`다. 증분에는 이번 변경만 담았으며 기존 수용 예외의 과거 지문으로 되돌리지 않았다.

모든 선정 필수 gate가 최종 제품 소스에서 통과했다. 실제 브라우저 검사는 compat 내부 fast E2E 8개이며, 별도 RC나 수동 self-test를 실행한 것으로 보고하지 않는다.

모델: 사용자 requested 모델/effort는 미지정이다. 작업 권장값은 GPT-6 Astra/high로 안내했다. 메인 세션 effective 모델/effort는 확인 가능한 런타임 도구 결과에 노출되지 않아 [미확인]으로 기록하며, 권장값이나 config를 실행값으로 보고하지 않는다.

## 남은 리스크

- 이번 두 필드와 명시적으로 테스트한 legacy/v2 형태를 검증했다. 미확인 legacy alias·비배열 구조·다른 APR/상환 정책을 자동 발굴하거나 구현하지 않았다.
- 과거 run 재계산, migration 전면 재설계, UI 확장, solver/Monte Carlo, 목표 배분·기한 수정은 없다.
- 실사용 저장 데이터와 배포 환경, 수동 5분 self-test는 검증하지 않았다. 격리된 합성 fixture와 실제 store/Vault/startup 검증 범위로 한정한다.
- `/tmp` 증거는 임시 보관이다. 최종 diff와 이 종료 기록을 함께 확인한다. 이번 두 결함 해결에서 작업을 종료한다.
