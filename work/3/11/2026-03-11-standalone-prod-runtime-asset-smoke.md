# 2026-03-11 standalone prod runtime asset smoke

## 변경 이유
- standalone runtime 에서 `.next/static`, `public` 자산 연결이 깨지면 앱 버그가 아니라 hydration 실패로 E2E가 늦게 무너진다.
- `pnpm e2e:parallel:report-flake:prod` 는 이 회귀를 잡지만 build + Playwright 전체를 거쳐야 해서 경고선이 너무 늦다.

## 이번 변경
1. `scripts/planning_v2_prod_smoke.mjs` 가 prod 서버 기동 후 `/ops/doctor` 뿐 아니라 `/public/dart` 도 확인한다.
2. `/public/dart` HTML 안의 첫 `/_next/static/*` 자산 URL을 추출해 실제 200 응답을 검증한다.
3. `/next.svg` 도 함께 받아 `public` 자산 서빙 계약까지 같이 확인한다.

## 검증
1. `pnpm planning:v2:prod:smoke`
2. `pnpm lint`
3. `pnpm e2e:parallel:flake`

## 검증 결과
- `pnpm planning:v2:prod:smoke` PASS
- `pnpm lint` PASS
- `pnpm e2e:parallel:flake` PASS

## 남은 리스크
- dev 병렬 셋은 이번 패스에서 통과했지만 반복 실행 분류가 아직 충분하지 않다.
- `/planning/reports` 첫 진입 fan-out 가 shared `next dev --webpack` 노이즈를 계속 키우는지 여부는 추가 관찰이 필요하다.

## 다음 작업
1. `e2e:parallel:flake` 와 `e2e:parallel:flake:prod` 반복 실행 분류
2. `/planning/reports` 비핵심 섹션 idle/viewport 세분화 검토
3. 필요하면 planning header 다른 액션에도 readiness 계약 확대

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
