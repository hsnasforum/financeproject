# 트러블슈팅 런북

## 인덱스 없음
증상: 공시/검색 화면에서 corp index 관련 조회가 실패한다.  
원인: `tmp/dart/corpCodes.index.json`이 없거나 오래됐다.  
해결 명령: `pnpm dart:watch`

## 키 없음
증상: 외부 API 호출이 401/403으로 실패한다.  
원인: `.env.local`에 필요한 API 키가 없다.  
해결 명령: `pnpm env:doctor`

## REPLAY
증상: 개발 환경에서 실제 API 대신 스냅샷 재생이 계속된다.  
원인: REPLAY/fixture 모드가 켜져 있다.  
해결 명령: `pnpm dev:lan`

## DB seed
증상: 개발용 데이터가 비어 있거나 테스트 데이터가 없다.  
원인: seed가 적용되지 않았다.  
해결 명령: `pnpm seed:debug`

## daily refresh 실패
증상: `daily_refresh_result.json` 마지막 단계가 failed다.  
원인: 파이프라인 단계(`data:doctor`/`dart:watch`) 실행 실패.  
해결 명령: `pnpm daily:refresh`

## E2E 실패
증상: Playwright E2E가 반복적으로 실패한다.  
원인: 서버 상태/fixture/브라우저 캐시가 테스트 기대와 다르다.  
해결 명령: `pnpm test:e2e`

## dev unlock
증상: `/api/dev/*` 호출이 `UNAUTHORIZED` 또는 `CSRF_MISMATCH`다.  
원인: Dev unlock 세션 또는 CSRF 토큰이 없다.  
해결 명령: `curl -X POST http://localhost:3000/api/dev/unlock -H "x-dev-token:YOUR_TOKEN" -H "origin:http://localhost:3000"`

## 백업 롤백
증상: Import 후 상태가 비정상이고 즉시 복구가 필요하다.  
원인: 잘못된 번들이 적용됐다.  
해결 명령: `curl -X POST http://localhost:3000/api/dev/backup/restore-point/rollback`
