# 2026-05-25 data freshness snapshot refresh

## 변경 파일
- `.data/benefits_snapshot.json`
- `.data/exchange_snapshot.json`
- `.data/finlife_credit-loan_snapshot.json`
- `.data/finlife_deposit_snapshot.json`
- `.data/finlife_mortgage-loan_snapshot.json`
- `.data/finlife_pension_snapshot.json`
- `.data/finlife_rent-house-loan_snapshot.json`
- `.data/finlife_saving_snapshot.json`
- `docs/dart-rules-quality-report.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`
- `scripts/data_freshness_report.mjs`
- `scripts/warm_if_stale.mjs`
- `src/lib/publicApis/providers/housing.ts`
- `tests/data-freshness-report.test.ts`
- `tests/housing-provider.test.ts`
- `tests/warm-if-stale-env.test.ts`
- `work/5/25/2026-05-25-data-freshness-snapshot-refresh.md`

## 사용 skill
- `dart-data-source-hardening`: freshness, 외부 데이터 fallback, 기준 시점 문서가 실제 스냅샷 상태와 맞는지 점검했습니다.
- `planning-gate-selector`: 스크립트, provider, 데이터 소스 e2e 영향에 맞춰 focused test, eslint, typecheck, e2e:data-sources, verify, build를 선택했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 upstream 리스크를 표준 `/work` 형식으로 남겼습니다.

## 변경 이유
- 최신 freshness 보고서가 `total=8, stale=8`로 남아 있어 운영자가 현재 데이터 상태를 잘못 볼 수 있었습니다.
- `warm:if-stale`가 `.env.local`의 EXIM 설정을 읽지 않아 exchange snapshot이 stale 상태로 남았습니다.
- `exchange_snapshot.json`이 `other` source로 분류되어 7일 기준을 쓰고 있었고, 환율 데이터에는 더 짧은 기준이 필요했습니다.
- `MOLIT_SALES_API_URL`이 `RTMSDataSvcAptTradeDev` base일 때도 일반 operation을 붙여 `housing:sales` upstream 404가 발생했습니다.

## 핵심 변경
- `warm_if_stale.mjs`가 `.env.local`, `env.local`, `.env`를 읽도록 보강해 로컬 EXIM 설정으로 stale exchange snapshot을 갱신하게 했습니다.
- freshness report에 `exchange` source 규칙을 추가하고 `exchange_snapshot.json`의 기준을 1일로 분리했습니다.
- FINLIFE, benefits, exchange snapshot을 갱신하고 `docs/data-freshness-report.md`를 `fresh=8, stale=0` 상태로 재생성했습니다.
- housing sales provider가 `RTMSDataSvcAptTradeDev` base에서는 `getRTMSDataSvcAptTradeDev` operation을 사용하도록 수정했습니다.
- env 로딩, exchange report 분류, MOLIT Dev operation 경로를 각각 회귀 테스트로 고정했습니다.
- `verify` 실행으로 schema drift와 DART rules 품질 보고서의 생성 시각 및 결과를 최신화했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm finlife:sync` 통과: saving 59/182, pension 0/0, mortgage-loan 32/110, rent-house-loan 40/80, credit-loan 24/139, deposit 37/146 동기화
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm warm:if-stale` 1차 통과: FINLIFE/benefits는 갱신 또는 fresh, exchange는 EXIM env 미인식으로 skip
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm freshness:report` 1차 통과: `total=8 fresh=7 stale=1`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/warm_if_stale.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm warm:if-stale` 2차 통과: `exchange: wrote .data/exchange_snapshot.json`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm freshness:report` 통과: `total=8 fresh=8 stale=0`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node --check scripts/data_freshness_report.mjs` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/data_freshness_report.mjs --strict` 통과: `total=8 fresh=8 stale=0`
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/warm-if-stale-env.test.ts tests/data-freshness-report.test.ts` 통과: 2 files, 2 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/housing-provider.test.ts` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/warm-if-stale-env.test.ts tests/data-freshness-report.test.ts tests/housing-provider.test.ts` 통과: 3 files, 3 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint scripts/warm_if_stale.mjs scripts/data_freshness_report.mjs src/lib/publicApis/providers/housing.ts tests/warm-if-stale-env.test.ts tests/data-freshness-report.test.ts tests/housing-provider.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc:data-sources` 통과: 1 passed, `housing:sales` 404는 사라지고 live upstream은 403 응답
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 659 files, 2022 tests, freshness `8/8 fresh`, route guard scan PASS
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과: 254 static pages 생성
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- scripts/warm_if_stale.mjs scripts/data_freshness_report.mjs src/lib/publicApis/providers/housing.ts tests/warm-if-stale-env.test.ts tests/data-freshness-report.test.ts tests/housing-provider.test.ts docs/data-freshness-report.md` 통과

## 남은 리스크
- `housing:sales`는 잘못된 operation으로 인한 404는 해소됐지만, 현재 live 공공데이터 응답은 403입니다. 서비스키 권한, Dev API 활용 신청, 기관 측 접근 정책 확인이 필요합니다.
- FINLIFE pension snapshot은 성공적으로 갱신됐지만 현재 configured group 기준 product/option이 0건입니다. fresh 상태와 별개로 연금 데이터 커버리지는 `finlife:probe` 또는 group 확장으로 재확인해야 합니다.
- `docs/schema-drift-report.md`에는 `exchange_snapshot.json` root 추가와 `finlife_deposit_snapshot.json` raw 필드 추가가 non-breaking으로 기록됐습니다. breaking은 0건이지만 downstream raw 필드 의존성이 생기면 별도 계약화가 필요합니다.
- WSL에서 `[next_dev_safe] Windows localhost bridge disabled: spawn powershell.exe ENOENT` 경고가 계속 발생합니다. WSL 내부 e2e에는 영향이 없었지만 Windows 브라우저 브리지 경로는 별도 점검 대상입니다.
- 작업트리에는 이번 라운드 외 선행 변경과 미추적 파일이 많이 남아 있습니다. stage 또는 PR 단위 분리는 별도 정리가 필요합니다.

## 다음 라운드
- `housing:sales` 403을 서비스키 권한, 활용 신청 상태, 운영/개발 API base 차이로 나눠 확인합니다.
- FINLIFE pension 0건이 정상 결과인지 configured group 누락인지 `finlife:probe`로 분리합니다.
- 선행 변경과 이번 라운드 변경을 PR 또는 stage 단위로 나눌 수 있도록 파일 범위를 정리합니다.
