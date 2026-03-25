# 2026-03-19 N5 dashboard start surface polish

## 변경 파일

- `src/components/home/HomeHero.tsx`
- `src/components/DashboardClient.tsx`
- `src/components/home/ServiceLinks.tsx`
- `work/3/19/2026-03-19-n5-dashboard-start-surface-polish.md`

## 사용 skill

- `finance-skill-routing`: 이번 배치를 `N5 start surface`의 copy/helper/CTA polish로 제한하고, route SSOT나 beta exposure 범위로 커지지 않게 유지하는 데 사용
- `planning-gate-selector`: 홈/대시보드 start surface의 TSX 변경에 맞춰 `lint`, `build`, `e2e`까지 필요한 검증 범위를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 실패한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `/`와 `/dashboard`의 첫 문구와 CTA가 `재무 상태 진단`과 `상품 비교` 두 갈래 시작점을 한 번에 읽히게 정리돼 있지 않았다.
- `N5` 문서 기준으로 이번 배치는 stable/public start surface의 copy/helper/CTA 위계만 작은 범위에서 다듬어야 했다.
- `P1-4`의 두 갈래 시작 방향을 뒤집지 않고, 첫 화면에서 무엇을 할 수 있고 어디서 시작하는지 더 쉽게 읽히게 만들 필요가 있었다.

## 핵심 변경

- 홈 hero의 headline/subcopy를 `재무 상태를 먼저 보고, 조건에 맞는 상품을 바로 비교하는 시작점`으로 다시 정리했다.
- 홈 hero CTA를 `재무 상태 진단 시작`과 `조건에 맞는 상품 비교`로 분명하게 나누고, 보조 helper에서 어느 흐름으로 시작할지 한 문장으로 설명했다.
- 대시보드 hero의 kicker/title/description을 `최근 플랜 기반 재무 상태 확인`과 `추천 허브 상품 비교` 두 갈래로 읽히게 조정했다.
- 최근 플랜이 있는 경우 hero CTA를 `재무 상태 다시 보기`, `조건에 맞는 상품 비교`, `플랜 다시 계산` 순으로 정리해 시작 순서를 단순화했다.
- 서비스 링크 섹션의 설명도 `재무진단`과 `상품추천` 역할이 더 분명히 읽히도록 짧게 다듬었다.

## 검증

- `git diff --check -- src/app/page.tsx src/app/dashboard/page.tsx`
- `git diff --check -- src/components/home/HomeHero.tsx src/components/DashboardClient.tsx src/components/home/ServiceLinks.tsx`
- `pnpm lint`
  - 에러 없이 통과
  - 기존 unrelated warning 30건은 그대로 남아 있음
- `pnpm build`
- `pnpm e2e:rc`
  - 실패
  - 실패 위치: `tests/e2e/planning-quickstart-preview.spec.ts`
  - 실패 내용: `월 실수령` 예상값 `3,200,000` 대비 실제값 `4,800,000`
  - 이번 홈/대시보드 start surface 변경과 직접 연결된 실패로 보이지 않으며, planning quickstart preview baseline 이슈로 보임

## 남은 리스크

- 홈 hero의 두 번째 CTA를 `/recommend`로 조정해 첫 진입 흐름이 더 분명해졌지만, 실제 사용자 반응은 별도 사용성 확인이 더 필요하다.
- `pnpm e2e:rc`는 planning quickstart preview 2건 실패로 green이 아니므로, 후속 라운드에서 해당 baseline drift를 별도로 점검해야 한다.
- 워크트리에는 이번 범위 밖의 기존 modified/untracked 파일이 계속 남아 있으므로, 후속 commit 시 포함 범위를 엄격히 확인해야 한다.
