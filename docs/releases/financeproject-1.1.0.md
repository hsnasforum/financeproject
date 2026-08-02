# Finance Project v1.1.0 — 회고 공개 릴리즈

> 이 태그와 GitHub Release는 실제 게시 대상입니다.
> 신규 제품 기능은 없으며, 아래 역사 기능 구간은 모두 `v1.0.5`에 이미 포함됐습니다.

- Version: `1.1.0`
- Release date: `2026-08-02`
- 실제 base tag: `v1.0.5`
- 기능 배포 기준선: `v1.0.5`
- 회고 기준일: `2026-06-15`
- 역사 기능 구간: `05c3990c2f4df8175b060b37d8b180177db2c1a2..3de12780b0260a81363e636a3b6cdb4c10e56c94`
- 역사 구간 커밋 수: `119`
- 상태: `공식 회고 공개 릴리즈 — 신규 기능 없음`

## 실제 태그 변경

- `v1.0.5...v1.1.0`의 제품 기능 delta는 없습니다.
- 패키지 버전, Planning v2 릴리즈 스크립트의 기본 버전과 릴리즈 문서를 `1.1.0`에 맞췄습니다.
- [실제 태그 비교: `v1.0.5...v1.1.0`](https://github.com/hsnasforum/financeproject/compare/v1.0.5...v1.1.0)

## 이미 v1.0.5에 포함된 역사 기능

- Planning v3 canonical entity, 저장 owner, API·CSV import·rollback과 golden dataset 계약을 구체화했습니다.
- stored-first batch read, legacy fallback, raw·derived projection과 synthetic stored-only batch 처리 기준을 보강했습니다.
- Planning workspace, transaction batch detail, report dashboard, news settings와 ops dashboard를 controller와 view 책임으로 분리했습니다.
- CSP-safe runtime, standalone report export, dev route guard와 데이터 소스 freshness·상태 UI를 강화했습니다.
- Planning v2 검증과 release dependency audit를 보강했습니다.
- [역사 SHA 비교: `05c3990c...3de12780`](https://github.com/hsnasforum/financeproject/compare/05c3990c2f4df8175b060b37d8b180177db2c1a2...3de12780b0260a81363e636a3b6cdb4c10e56c94)

보존용 회고 노트: [financeproject-1.1.0.md](./retrospectives/financeproject-1.1.0.md)

## 알려진 제한

- Planning v3는 역사 구간 당시 계약과 제한된 beta surface를 만드는 단계였으며 모든 v3 화면이 공식 사용자 경로는 아니었습니다.
- stored-first와 legacy fallback이 공존하는 동안 과거 데이터 형식 차이를 계속 처리해야 합니다.
- 첨부 자산은 역사 구간 끝 SHA의 과거 바이너리가 아니라 실제 `v1.1.0` 태그 커밋에서 다시 빌드한 자산입니다.
- 사용자 기능, API, 데이터 계약, 런타임 로직 및 의존성 변경은 없습니다.
