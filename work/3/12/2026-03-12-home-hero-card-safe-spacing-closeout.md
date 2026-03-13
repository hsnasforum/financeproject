# 2026-03-12 home hero card safe spacing closeout

## 변경 파일
- `src/components/home/HomeHero.tsx`
- `work/3/12/2026-03-12-home-hero-card-safe-spacing-closeout.md`

## 사용 skill
- `planning-gate-selector`: 홈 hero UI 변경을 `eslint + build` 중심의 최소 검증 세트로 좁히는 데 사용.
- `work-log-closeout`: 이번 라운드의 실제 수정, 실제 검증, 남은 시각 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 사용자가 메인 배너 카드의 모서리 쪽에서 텍스트와 장식 형태가 조금씩 잘려 보인다고 제보했다.
- 현재 hero card는 작은 화면 기본 카드 높이와 내부 정보 밀도가 빠듯해, 코너 근처 텍스트와 orb 장식이 눌려 보일 수 있었다.
- 이번 라운드 목표는 홈 배너 전체를 재설계하는 것이 아니라, 카드 크기와 내부 safe spacing만 최소 수정으로 늘려 잘림을 먼저 없애는 일이었다.

## 핵심 변경
- `src/components/home/HomeHero.tsx`의 작은 화면 기본 `hero-card-stage` 크기를 키워 front card가 코너와 하단에 더 여유 있게 배치되도록 조정했다.
- foreground card의 작은 화면 기본 크기를 `h-[204px] w-[308px]`로 키우고 padding/radius를 같이 조정해 텍스트와 badge가 카드 모서리에 덜 붙게 맞췄다.
- eyebrow/title/metric/metricCaption/footer/orb의 작은 화면 전용 크기와 간격을 조금 줄여 카드 내부 정보가 코너 쪽으로 밀리지 않게 했다.
- 우상단 흐림 orb 장식도 작은 화면에서 한 단계 안쪽으로 당겨 코너 clipping을 줄였다.

## 검증
- `pnpm exec eslint src/components/home/HomeHero.tsx src/app/page.tsx`
  - PASS
- `pnpm build`
  - PASS
  - `next_build_safe`가 active repo build를 감지해 `.next-build-710369` 격리 dist dir로 우회 실행했고 build 종료 코드 `0`을 확인
- `git diff --check -- src/components/home/HomeHero.tsx`
  - PASS

## 남은 리스크
- 이번 라운드는 코드 기준 safe spacing만 조정했고, 실제 브라우저에서 사용자가 보던 정확한 viewport로 수동 비교 확인은 아직 하지 않았다.
- hero 카드 내용이 더 길어지면 같은 문제가 다시 생길 수 있으므로, 후속 라운드에서는 slide text 길이 상한 또는 카드 variant 분리도 검토할 수 있다.
- `src/app/page.tsx`, `src/app/globals.css`는 이미 큰 변경이 열려 있는 상태라 이번 라운드에서는 건드리지 않고 `HomeHero.tsx` 내부만 최소 수정했다.

## 다음 라운드 우선순위
- 실제 문제를 봤던 viewport에서 메인 배너 카드 잘림이 해소됐는지 수동 확인
- 필요하면 hero slide별 텍스트 길이 상한 또는 summary/footer 밀도 조절
- 메인페이지에 사용자 도움형 카드/노출 블록을 추가할 때도 같은 safe spacing 기준 유지
