# 2026-03-16 P2-4 trust cues third pass

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-4-trust-cues-third-pass.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` 결과 화면 설명 변경에 맞는 최소 검증을 `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 third pass 범위의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-4` second pass에서는 상단 planning context strip과 카드의 `추천 사유` 영역만 느슨하게 연결돼 있었습니다.
- 이번 라운드는 현재 화면에 이미 있는 데이터만 써서, 각 추천 카드 옆에서 바로 읽을 수 있는 trust cue를 작게 붙여 사용자가 보호 여부, 금리 조건, 최신성 읽기 포인트를 빠르게 확인하게 하는 것이 목적이었습니다.

## 핵심 변경
- `/recommend` 카드 안에 `읽기 힌트` 블록을 추가하고, `depositProtection`, `rateSource`, `badges`, `depositProtectionPolicy`를 조합해 짧은 trust cue를 만들었습니다.
- `depositProtection === "matched"`면 보호 신호 확인 문구를, `depositProtection === "unknown"`면 보호 여부 추가 확인 필요 문구를 보여줍니다.
- `rateSource === "intr_rate2"`면 우대금리 포함 가능성, `rateSource === "intr_rate"`면 기본 금리 기준 안내를 보여줍니다.
- 카드 배지가 있으면 상품 메모 확인 힌트를 함께 붙이고, 데이터 최신성은 화면 상단 `DataFreshnessBanner` 기준으로 읽어야 한다는 연결 문구를 넣었습니다.
- recommend API contract, saved run 영속, history/report 통합은 이번 라운드에서 건드리지 않았습니다.

## 검증
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/recommend/page.tsx work/3/16/2026-03-16-p2-4-trust-cues-third-pass.md`

## 남은 리스크
- trust cue는 현재 응답 데이터만 읽는 보수적 설명이므로, 카드별 보호 조건이나 우대조건을 다시 계산하지는 않습니다.
- 데이터 최신성은 여전히 화면 상단 `DataFreshnessBanner`를 기준으로 읽어야 하며, 카드 안에 freshness 세부 시점을 따로 복제하지는 않습니다.
- `REDUCE_DEBT_SERVICE`는 이번 라운드 설명 분기에 포함하지 않았고, action context 설명은 여전히 두 action code만 지원합니다.

## 다음 우선순위
- `P2-4` 후속: trust cue와 카드 상세 why 또는 비교함 진입 문구를 어디까지 연결할지 범위를 더 좁히기
- `P2-5` 준비: 현재 query 기반 action context를 history/report와 어떤 기준으로 연결할지 문서로 먼저 정리하기
