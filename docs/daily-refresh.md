# Daily Refresh

## 로컬 실행

```bash
pnpm daily:refresh
```

- 기본 순서:
  - `pnpm warm:if-stale` (스크립트가 있으면 실행)
  - `pnpm news:refresh`
  - `pnpm dart:watch`
  - `pnpm data:doctor` (기본 실행, `--skip-doctor`로 생략 가능)
  - `pnpm cleanup` (스크립트가 있으면 실행, non-strict에서 비차단)
- 옵션:
  - `pnpm daily:refresh -- --strict`: 단계 실패 시 즉시 실패(exit 1)
  - `pnpm daily:refresh -- --skip-doctor`: `data:doctor` 생략
- `OPENDART_API_KEY`가 없어도 `dart:watch`는 내부 skip 처리되며 non-strict 모드에서는 전체 exit 0을 유지합니다.

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
- 저장소 Secrets에 아래 키를 추가하세요.
  - `OPENDART_API_KEY`
- 실행 결과는 `tmp/daily_refresh_result.json`, `tmp/daily_refresh.log`로 남고, Actions Summary/Artifacts에서도 확인할 수 있습니다.
- 워크플로는 실행 후 변경 파일이 있으면 `docs/**`, `tmp/**` 기준으로 자동 PR을 생성/업데이트합니다.

## 실패/스킵 확인 포인트

- Actions Summary: 각 step의 `status/tookMs/stdoutTail/stderrTail` 표 확인
- Artifacts:
  - `tmp/daily_refresh_result.json` (구조화된 실행 결과)
  - `tmp/daily_refresh.log` (간단 텍스트 로그)
  - `docs/dart-*.md`, `tmp/dart/*.json` (산출물)
- `OPENDART_API_KEY`가 없고 `dart:watch`가 내부 skip되면 `status=skipped`로 기록되며 기본(non-strict) 모드에서는 workflow 실패로 처리되지 않습니다.
