# 2026-03-11 data-sources-expansion-and-build-safe-hardening

## 내부 회의 결론
- 직전 `/settings/data-sources` 개선 다음 단계는 "사용자에게 어떤 도움인지"에서 한 걸음 더 나아가, `활용 기준`과 `확장 후보`를 함께 보여주는 것이 가장 작은 고가치 수정이라고 판단했다.
- `.env.local` 기준으로 실제 연결 후보가 있는 `FRED`, `KOSIS`는 설정 화면에도 반영해야 했고, 현재 직접 연결되지 않은 optional API는 과장 없이 "다음 단계 후보"로만 보여줘야 한다고 정리했다.
- 작업 중 실제 리스크 두 개를 확인했다.
  1. optional-only 데이터 소스가 env가 비어 있어도 `configured`로 표시되던 문제
  2. `next_build_safe`가 `.next-build` fallback 시 `tsconfig.playwright.json`까지 따라가 build를 흔들던 문제

## 변경 내용
1. `/settings/data-sources`의 사용자 도움 카드에 `활용 기준` 문구를 추가했다.
2. `연금·노후 준비`, `보험·실손`, `국내외 거시지표` 확장 후보 섹션을 추가했다.
3. registry에 `FRED`, `KOSIS`를 추가하고, optional-only 소스는 env가 비어 있으면 `선택 ENV 미설정`으로 처리하도록 수정했다.
4. `.env.example`, `.env.local.example`, `docs/api-utilization-draft.md`를 새 기준에 맞게 갱신했다.
5. `next_build_safe.mjs`는 fallback dist dir를 쓰더라도 build에서는 `tsconfig.json`을 유지하도록 보강했다.

## 수정 파일
- `src/app/settings/data-sources/page.tsx`
- `src/lib/dataSources/registry.ts`
- `src/lib/dataSources/userImpact.ts`
- `src/lib/publicApis/dart/baseUrl.ts`
- `scripts/next_build_safe.mjs`
- `tests/data-source-user-impact.test.ts`
- `tests/data-sources-status.test.ts`
- `tests/external-link-rel.test.ts`
- `tests/middleware-security.test.ts`
- `.env.example`
- `.env.local.example`
- `docs/api-utilization-draft.md`

## 검증
- `pnpm exec eslint src/app/settings/data-sources/page.tsx src/lib/dataSources/registry.ts src/lib/dataSources/userImpact.ts tests/data-source-user-impact.test.ts tests/data-sources-status.test.ts`
- `pnpm test tests/data-source-user-impact.test.ts tests/data-sources-status.test.ts`
- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc`

## 결과
- targeted eslint PASS
- targeted test PASS
- `pnpm exec tsc --noEmit -p tsconfig.json` PASS
- `pnpm lint` PASS
- `pnpm test` PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.
- [미확인] `KDIC_DATAGO_SERVICE_KEY`는 현재 repo 안에 직접 연결된 connector/route가 없어 이번 라운드의 확장 후보 UI에는 올리지 않았다. 실제 노출 전에 데이터 계약과 사용자 가치 검증이 먼저 필요하다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
