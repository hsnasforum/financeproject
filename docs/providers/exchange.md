# Provider: 한국수출입은행 환율

- id: `exchange`
- implementation: `src/lib/providers/exchange/index.ts`

## Notes

- `runProvider()`를 통해 singleflight/cooldown/fallback/debug timing 정책을 공통 적용합니다.
- upstream 조회는 기존 `fetchEximExchange()`를 재사용합니다.
- replay 진단은 `.data/exchange_snapshot.json`의 `generatedAt` 존재 여부로 판단합니다.
