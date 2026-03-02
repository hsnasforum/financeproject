## Change Type
- [ ] v2 Bugfix (freeze 허용)
- [ ] v2 Improvement (계약/출력 변경 없음)
- [ ] v3 Feature (v2에 넣지 말 것)

## Scope
- [ ] planning core 변경 (simulate/scenarios/monte-carlo/actions/debt)
- [ ] UI 변경 (/planning, /planning/reports)
- [ ] OPS 변경 (/ops/*)

## Required Gates
- [ ] `pnpm planning:v2:complete` PASS 로그 첨부
- [ ] (core 변경 시) `pnpm planning:v2:regress` PASS 로그 첨부
- [ ] (서버 띄운 뒤, 가능하면) `pnpm planning:v2:acceptance` PASS 로그 첨부

## UX Freeze
- [ ] UX Freeze 영향 없음
- [ ] UX Freeze 영향 있음 (사유 + 스크린샷 첨부)
- [ ] `pnpm planning:v2:report:test` PASS 로그 첨부
- [ ] `pnpm planning:v2:guide:test` PASS 로그 첨부

## Safety Checks
- [ ] `pnpm planning:v2:guard` PASS (누출/클라 env 노출 방지)
- [ ] 로컬 전용 정책(local-only/CSRF) 약화 없음

## Summary
### What Changed

### Why

### Risk

### Rollback Plan
