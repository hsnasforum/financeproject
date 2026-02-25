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


## 업권 프로빙

```bash
pnpm finlife:probe
```

출력된 `Recommended FINLIFE_TOPFIN_GRP_LIST=...` 값을 `.env.local`에 반영한 뒤 동기화하세요.
