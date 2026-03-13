# 2026-03-11 data-sources-expansion-candidates-and-build-lock-fallback

## 내부 회의 결론
- 이번 라운드의 최소 고가치 범위는 `/settings/data-sources`를 더 정직하고 더 설명적인 화면으로 만드는 것이다.
- 우선 해결 대상은 두 가지였다. optional 확장 소스가 실제로는 비어 있는데도 configured처럼 보이는 상태 오탐지, 그리고 `.env.local`에 있는 확장 후보 API가 사용자 도움 관점에서 잘 드러나지 않는 점이다.
- 검증 중 추가로 `pnpm build`가 로컬 `pnpm dev`의 `.next` 사용과 충돌하는 lock failure를 재현했고, 이것도 같은 라운드에서 닫았다.

## 구현 요약
1. `/settings/data-sources`에 사용자 도움 카드별 `활용 기준` 안내를 추가했다.
2. FRED/KOSIS를 포함한 `확장 후보` 섹션을 추가해, 직접 연결 전 API도 다음 사용자 도움 후보로 설명했다.
3. data source registry는 optional-only 소스가 비어 있으면 `선택 ENV 미설정`으로 보이도록 고쳤고, `ECOS_API_KEY` alias도 상태 판단에 반영했다.
4. `pnpm build`는 `scripts/next_build_safe.mjs`로 감싸 dev가 `.next`를 쓰는 중이면 `.next-build`로 자동 우회하도록 바꿨다.

## 수정 파일
- `src/app/settings/data-sources/page.tsx`
- `src/lib/dataSources/registry.ts`
- `src/lib/dataSources/userImpact.ts`
- `scripts/next_build_safe.mjs`
- `next.config.ts`
- `package.json`
- `.env.local.example`
- `docs/deploy.md`
- `docs/api-utilization-draft.md`
- `README.md`
- `tests/data-sources-status.test.ts`
- `tests/data-source-user-impact.test.ts`

## 검증
- `pnpm test tests/data-sources-status.test.ts tests/data-source-user-impact.test.ts`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm lint`
- `pnpm test`

## 결과
- targeted test PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS
- `pnpm lint` PASS
- `pnpm test` PASS

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.
- [가정] `pnpm build`가 dev 서버와 동시에 실행되면 산출물은 `.next-build`로 생성된다. 배포용 `.next`가 꼭 필요하면 dev 서버를 내리고 다시 build 하는 것이 가장 명확하다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
