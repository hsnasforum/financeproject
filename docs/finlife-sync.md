# FINLIFE Sync

FINLIFE(예금/적금)는 스냅샷 우선으로 동작합니다.

## 수동 동기화

```bash
pnpm finlife:sync
```

## stale일 때만 동기화

```bash
pnpm finlife:sync:if-stale
```

## 스케줄러 예시

### Windows Task Scheduler

- Program/script: `pnpm`
- Add arguments: `finlife:sync:if-stale`
- Start in: `<repo-path>`

### cron

```cron
0 */6 * * * cd <repo-path> && pnpm finlife:sync:if-stale
```

## 점검 포인트

- source=`mock`이면 실 API 실패 후 mock 폴백입니다.
- completionRate<0.95 또는 truncatedByHardCap=true면 완주 수집이 아닙니다.
- groupsScanned가 1개면 topFinGrpNo 범위가 좁습니다.
- 업권별 유효 그룹이 다르면 `FINLIFE_<KIND>_TOPFIN_GRP_LIST`가 공통 `FINLIFE_TOPFIN_GRP_LIST`보다 우선합니다.
- 연금저축은 공통 예적금 그룹과 달라서 별도 설정이 없으면 기본값 `050000,060000`을 사용합니다.

## 업권 프로빙

```bash
pnpm finlife:probe
```

출력된 `Recommended FINLIFE_TOPFIN_GRP_LIST=...`와 `Recommended FINLIFE_PENSION_TOPFIN_GRP_LIST=...` 값을 `.env.local`에 반영한 뒤 동기화하세요.

프로브는 기본적으로 그룹별 요청을 20초까지 기다리고, timeout/네트워크 오류/429/5xx 응답은 1회 재시도합니다. 운영 환경에서 업스트림 지연이 반복되면 아래 값을 조정합니다.

```env
FINLIFE_PROBE_TIMEOUT_MS=30000
FINLIFE_PROBE_RETRIES=2
```

후보 그룹을 좁혀 재확인할 때는 `FINLIFE_PROBE_GROUP_CANDIDATES=020000,050000,060000`처럼 쉼표로 지정합니다.
