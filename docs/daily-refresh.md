# Daily Refresh

## 로컬 실행

```bash
pnpm daily:refresh
```

- 기본 순서:
  - `pnpm warm:if-stale -- --exchange-only` (환율 snapshot만 확인하며, FinLife/Gov24는 아래 canonical 단계를 한 번씩 실행)
  - `pnpm finlife:sync:if-stale`
  - `pnpm datago:sync`
  - `pnpm gov24:sync:if-stale`
  - `pnpm news:refresh`
  - `pnpm indicators:refresh`
  - `pnpm dart:watch`
  - `pnpm data:doctor` (기본 실행, `--skip-doctor`로 생략 가능)
  - `pnpm cleanup` (스크립트가 있으면 실행, non-strict에서 비차단)
- 옵션:
  - `pnpm daily:refresh -- --strict`: 모든 단계를 기록한 뒤 차단 실패가 하나라도 있으면 exit 1
  - `pnpm daily:refresh -- --skip-doctor`: `data:doctor` 생략
- 기본 모드는 로컬 best-effort입니다. required step이 실패하면 `summary.ok=false`로 남지만 프로세스는 exit 0을 유지하므로 자동화 gate에는 사용하지 않습니다.
- strict 모드는 news, indicators, DART, freshness doctor child에도 `--strict`를 전달합니다. required failure와 runnable optional failure, cleanup failure가 모두 exit 1로 이어집니다.
- cleanup 실패만 기본 모드에서 tolerated failure입니다. optional script가 없으면 skipped이고, 존재하는 optional script가 실행 중 실패하면 tolerated로 축약하지 않습니다.
- `OPENDART_API_KEY`가 없고 DART가 정상 skip을 반환하면 `dart:watch`는 skipped로 기록됩니다.
- 결과 JSON은 기존 `generatedAt`, `steps`, `ok`에 additive `schemaVersion=1`, `mode=best-effort|strict`를 기록합니다.

## Windows 작업 스케줄러 예시

`repo` 경로만 본인 환경에 맞게 바꿔서 사용하세요.

1. 기본 작업 만들기
2. 트리거: 매일 09:05
3. 동작:
   - 프로그램/스크립트: `powershell.exe`
   - 인수:

```powershell
-NoProfile -Command "Set-Location 'C:\repo\finance'; pnpm daily:refresh"
```

4. 필요 시 사용자 환경 변수에 `OPENDART_API_KEY` 등록

## GitHub Actions / Secrets

- 워크플로: `.github/workflows/daily-refresh.yml`
- 스케줄: `5 0 * * *` (UTC 00:05, KST 09:05)
- 저장소 Secrets에는 `FINLIFE_API_KEY`와 `FINLIFE_TOPFIN_GRP_LIST`를 모두 등록해야 합니다. daily if-stale wrapper는 업권별 목록만으로 공통 목록을 대체하지 않습니다.
- DataGo 인증은 `KDB_DATAGO_SERVICE_KEY` 또는 `DATAGO_SERVICE_KEY` 중 하나가 필요합니다.
- 지표 수집에는 `BOK_ECOS_API_KEY` 또는 `ECOS_API_KEY` 중 하나가 필요합니다.
- 환율 수집에는 `EXIM_EXCHANGE_API_KEY`와 HTTPS 형식의 `EXIM_EXCHANGE_API_URL`이 모두 필요합니다.
- Gov24 수집에는 `MOIS_BENEFITS_API_KEY`와 HTTPS 형식의 `MOIS_BENEFITS_API_URL`이 모두 필요합니다. 두 값이 없으면 strict preflight가 실행 전에 실패합니다.
- DART strict 수집에는 `OPENDART_API_KEY`가 필요합니다.
- `FRED_API_KEY`, `KOSIS_API_KEY`는 현재 daily workflow에서 선택 설정입니다.
- workflow는 `pnpm daily:refresh:strict`만 사용합니다. 별도 evidence 단계가 result schema, `mode=strict`, `summary.ok=true`, freshness report, 승인 경로 checksum을 검증합니다.
- 실행 결과는 `tmp/daily_refresh_result.json`, `tmp/daily_refresh.log`, `tmp/daily_refresh_evidence.json`과 Actions Summary/Artifacts에 남습니다. 실패해도 이 진단 산출물은 업로드합니다.
- 자동 PR은 refresh와 evidence 단계가 모두 성공하고 evidence output `ok=true`일 때만 생성합니다.
- 자동 PR은 기본 브랜치를 기준으로 만들며 저장소 단위 concurrency로 같은 스케줄 실행이 겹치지 않게 합니다.

### 자동 PR 승인 경로

PR commit 대상은 아래 13개 tracked canonical 산출물만 허용합니다.

- `.data/benefits_snapshot.json`
- `.data/exchange_snapshot.json`
- `.data/finlife_credit-loan_snapshot.json`
- `.data/finlife_deposit_snapshot.json`
- `.data/finlife_mortgage-loan_snapshot.json`
- `.data/finlife_pension_snapshot.json`
- `.data/finlife_rent-house-loan_snapshot.json`
- `.data/finlife_saving_snapshot.json`
- `docs/dart-daily-brief.md`
- `docs/dart-disclosure-alerts.md`
- `docs/dart-disclosure-digest.md`
- `docs/data-freshness-report.md`
- `docs/schema-drift-report.md`

- `tmp/**`, auxiliary snapshot, news/indicator runtime store, DB 파일은 artifact 또는 로컬 runtime 전용이며 자동 PR에 추가하지 않습니다.

## 실패/스킵 확인 포인트

- Actions Summary: 각 step의 `status/tookMs`, freshness 합계, 승인 산출물 SHA-256 확인
- Artifacts:
  - `tmp/daily_refresh_result.json` (구조화된 실행 결과)
  - `tmp/daily_refresh.log` (간단 텍스트 로그)
  - `docs/dart-*.md`, `tmp/dart/*.json` (산출물)
- Actions Summary와 PR body에는 stdout/stderr tail을 넣지 않습니다. 원인 tail은 접근 범위가 제한된 result/log artifact에서 확인합니다.
- checksum 표의 modifiedAt은 Actions workspace 파일 시각이며 upstream 원천 데이터의 기준일을 대신하지 않습니다. 원천 freshness는 `docs/data-freshness-report.md`의 generatedAt과 합계로 판정합니다.
- `OPENDART_API_KEY`가 없고 `dart:watch`가 내부 skip되면 `status=skipped`로 기록됩니다.
- FinLife/DataGo/Gov24/news/indicators가 env 누락, upstream 실패, stale 판단 실패 등으로 실패하면 `status=failed`로 기록됩니다. 이 상태는 성공으로 취급하지 말고 source별 stderrTail과 문서화된 env를 먼저 확인합니다.
