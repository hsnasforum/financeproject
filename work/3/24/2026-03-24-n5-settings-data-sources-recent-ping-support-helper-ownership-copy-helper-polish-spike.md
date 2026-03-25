# N5 settings-data-sources recent-ping support-helper ownership copy-helper polish spike

## 변경 파일
- `src/components/DataSourceStatusCard.tsx`

## 사용 skill
- `planning-gate-selector`: 이번 라운드에 필요한 최소 검증 세트를 유지했다.
- `route-ssot-check`: route/href 변경이 없는 범위인지 확인했다.
- `dart-data-source-hardening`: data-source trust/status surface에서 wording만 좁게 다뤘다.
- `work-log-closeout`: spike 종료 기록과 잔여 리스크를 정리했다.

## 변경 이유
- `최근 연결 확인 참고`가 `현재 읽는 기준`과 같은 current-state helper로 읽히지 않도록, support validation helper라는 읽는 층위를 더 분명히 할 필요가 있었다.
- recent ping snapshot evidence와 footer의 dev-only ping action 사이 순서를 문구로만 분리하고, storage/event contract는 그대로 둬야 했다.

## 핵심 변경
- recent ping helper 문구를 `현재 읽는 기준을 다시 확인할 때만 참고하는 최근 점검 근거`로 조정했다.
- `fetchedAt`와 detail chips가 함께 남은 참고 값이라는 설명을 추가했다.
- footer helper를 최근 점검 결과와 새 점검 실행 버튼의 경계가 드러나도록 조정했다.
- `DataSourcePingButton`, `pingState`, snapshot schema, route/href, 카드 구조는 수정하지 않았다.
- current memo와 landed 범위가 같아서 backlog 문서는 수정하지 않았다.

## 검증
- 실행: `pnpm lint`
- 실행: `pnpm build`
- 실행: `git diff --check -- src/components/DataSourceStatusCard.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-settings-data-sources-recent-ping-support-helper-ownership-copy-helper-polish-spike.md`
- 미실행: `pnpm test`
- 미실행: `pnpm e2e:rc`
- 미실행: `pnpm planning:current-screens:guard`

## 남은 리스크
- recent ping snapshot ownership은 여전히 local storage와 `DATA_SOURCE_PING_UPDATED_EVENT`에 기대고 있어, 이후 라운드에서 visibility나 ownership을 건드리면 ping semantics를 다시 열 수 있다.
- recent evidence helper가 더 넓어지면 canonical current-state helper와 support evidence helper의 경계가 다시 흐려질 수 있다.
