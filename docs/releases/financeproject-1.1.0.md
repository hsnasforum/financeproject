# Finance Project 회고 구간 노트 (1.1.0)

- 계획 버전: `1.1.0`
- 회고 기준일: `2026-06-15`
- Commit range: `05c3990c2f4df8175b060b37d8b180177db2c1a2..3de12780b0260a81363e636a3b6cdb4c10e56c94`
- Commit count: `119`
- 상태: `회고 기준 문서 — 이 변경은 v1.0.5 누적 릴리즈에 포함되며 v1.1.0 tag/GitHub Release는 미생성`

## 주요 변경

- Planning v3 canonical entity, 저장 owner, API·CSV import·rollback과 golden dataset 계약을 구체화했습니다.
- stored-first batch read, legacy fallback, raw·derived projection과 synthetic stored-only batch 처리 기준을 보강했습니다.
- Planning workspace, transaction batch detail, report dashboard, news settings와 ops dashboard를 controller와 view 책임으로 분리했습니다.
- CSP-safe runtime, standalone report export, dev route guard와 데이터 소스 freshness·상태 UI를 강화했습니다.
- Planning v2 검증과 release dependency audit를 보강했습니다.

## 알려진 제한

- Planning v3는 이 시점에 계약과 제한된 beta surface를 만드는 단계였으며 모든 v3 화면이 공식 사용자 경로는 아니었습니다.
- stored-first와 legacy fallback이 공존하는 동안 과거 데이터 형식 차이를 계속 처리해야 합니다.
- 실제 `v1.1.0` 릴리즈 노트는 `v1.0.5` 이후 새 변경분으로 다시 작성하며 이 과거 범위를 신규 변경처럼 재사용하지 않습니다.
