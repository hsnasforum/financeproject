# Maintenance Guide

## 주간 루틴
1. 데이터 상태 점검
   - `pnpm data:doctor`
2. 일일 산출물 갱신
   - `pnpm daily:refresh`
3. 품질 게이트 확인
   - `pnpm verify`
   - 멀티 에이전트 설정/프롬프트/skill을 건드린 주간이면 `pnpm multi-agent:guard`

## 월간 루틴
1. DB 상태 점검
   - Prisma 스키마/마이그레이션 필요 여부 확인
   - `pnpm prisma:generate` / `pnpm exec prisma db push` 검토
2. Seed 정책 점검
   - `scripts/seed_debug.mjs` 데이터 유효성 확인
   - 테스트/개발 시드 불일치 여부 확인
3. 스냅샷/산출물 정책 점검
   - `docs/schema-drift-report.md`, `docs/data-freshness-report.md` 확인
   - `tmp/**`, `docs/dart-*.md` 보관/정리 정책 재확인

## 권장 운영 원칙
- 배포 전 최소 게이트: `pnpm release:verify && pnpm build`
- `release:verify`는 `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`를 필수로 실행하고, 추가 게이트가 있으면 이어서 확인한다.
- `release:verify`의 planning e2e 하위 게이트는 전용 포트·고유 dist dir를 사용하고, `planning:v2:regress`는 임시 planning e2e data dir까지 분리해 shared runtime/data false negative를 줄인다.
- 사용자 경로/셀렉터 영향이 있으면 `pnpm e2e:rc`를 추가하고, 범위가 넓으면 `pnpm e2e`까지 넓힌다.
- shared `.next` 또는 dev server를 쓰는 최종 게이트(`pnpm build`, `pnpm e2e:rc`, `pnpm release:verify`)는 단일 소유로 순차 실행한다.
- 릴리즈 태그 기준 운영 (`v*`)
- dev 전용 기능은 production 차단 상태 유지

## Ops 캐시 점검 (Planning)
- 통합 상태는 `/ops/planning`에서 assumptions/regression/cache/store를 한 번에 확인할 수 있습니다.
- `/ops/planning-cache`에서 planning v2 캐시 엔트리/히트율을 확인할 수 있습니다.
- 만료 캐시 정리가 필요하면 `Purge expired`를 실행합니다.
