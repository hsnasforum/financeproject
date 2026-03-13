# Finance Project 공통 멀티 에이전트 지침

이 프로젝트는 개인 재무설계, 금융상품 추천, 공공데이터 연동, DART 공시 모니터링을 함께 다룬다.
항상 정확성, 안정성, 설명 가능성, 운영 보안, 공식 경로 일관성을 우선한다.

반복 루프:
- 후속 라운드나 작업 시작 시에는 `work/<현재월>/<현재일>/`의 최신 문서와 최신 검증 결과를 먼저 확인한다. 오늘 문서가 없으면 전날 날짜 폴더의 최신 `/work` 문서를 확인한다.
- 검증 게이트 세부 기준은 `multi_agent.md`의 `검증 게이트 단일 기준`을 우선 참조한다.
- 총괄은 현재 범위를 3~5단계로 분해하고, 각 단계에 `단계`, `목적`, `추천 역할`을 붙인다.
- 즉시 막는 핵심 경로는 구현 쪽에서 직접 처리하고, 병렬 가능한 조사/검토/문서화만 보조 역할로 분리한다.
- `pnpm build`, `pnpm e2e:rc`, production smoke, release gate처럼 공유 상태를 쓰는 최종 검증은 메인/lead만 실행하고 보조 역할은 최종 판정을 넘보지 않는다.
- shared Next 런타임이 얽힌 최종 검증 전에는 `.next/lock`, `.next-e2e*`, `.next-host*`, standalone shadow 상태를 먼저 확인하고, 필요하면 `pnpm cleanup:next-artifacts` 같은 저장소 helper를 우선 사용한다.
- 종료 시 `이번 라운드 완료 항목 / 남은 리스크 / 다음 라운드 우선순위`를 남긴다.

핵심 경로:
- `/dashboard`
- `/planning`
- `/recommend`
- `/public/dart`
- `/settings/data-sources`
- `/products/catalog`

기본 규칙:
- 사용자에게 보이는 화면은 데이터 누락이나 외부 응답 실패가 있어도 최대한 안전하게 유지한다.
- 공식 경로는 `docs/current-screens.md` 기준을 따른다.
- `AGENTS.md`, `multi_agent.md`, 관련 기능 문서와 충돌하지 않게 판단한다.
- production 비노출 경로(`/api/dev/*`, `/dashboard/artifacts`, `/dev/*`, `/debug/unified`)를 임의로 노출하지 않는다.
- API 키와 민감정보는 서버 환경변수로만 관리하고 클라이언트나 로그에 노출하지 않는다.
- 승인되지 않은 범위를 수정하지 않고, 무관한 리팩터링은 하지 않는다.
- 같은 오류가 3회 이상 반복되면 무한 반복을 멈추고 원인과 현재 상태를 정리한다.
- 투자/재무 결과는 확정 답안이나 단정 추천처럼 쓰지 않고, 사실, 계산 결과, 가정, 추정을 구분한다.
- 최신성이 중요한 값, 금리, 세율, 한도, 규정은 기준 시점과 출처를 함께 남기거나 미확인으로 표시한다.

역할 소유권:
- `lead`, `planner`, `researcher`, `reviewer`는 기본적으로 read-first로 행동하고 코드 파일을 직접 수정하지 않는다.
- `implementer`가 코드 수정의 기본 소유자다.
- `documenter`는 문서와 `/work`를 기본 소유하지만, 구현과 검증 근거가 부족하면 수정 완료를 꾸며내지 않는다.
- `validator`는 검증과 재현에 집중하고, 미실행 검증은 리스크로 남긴다.
- `validator`는 검증 세트 제안, 로그 수집, 작은 단위 재현까지 맡고, 최종 `pnpm build`와 `pnpm e2e:rc` 결과 확정은 메인/lead에 넘긴다.
- shared Next 산출물이 얽히면 raw `next build/start`보다 `pnpm build`, `pnpm start`, `pnpm cleanup:next-artifacts` 같은 저장소 진입점을 우선한다.

작업 기록:
- 변경 전에는 가능하면 수정 대상 파일, 변경 이유, 실행할 검증을 먼저 정리한다.
- 변경 후에는 `work/<현재월>/<현재일>/YYYY-MM-DD-<slug>.md` 경로에 무엇이 바뀌었는지, `사용 skill`, `실행한 검증`, `미실행 검증`, 남은 리스크와 다음 우선순위를 남긴다. 해당 폴더가 없으면 먼저 생성한다.

검증 기준:
- 로직 영향: `pnpm test`
- 훅/린트 영향: `pnpm lint`
- App Router/페이지 영향: `pnpm build`
- 전체 기본 검증: `pnpm verify`
- planning 핵심 영향: `pnpm planning:v2:complete`
- planning 호환성 영향: `pnpm planning:v2:compat`
- 사용자 흐름 영향: `pnpm e2e` 또는 `pnpm e2e:rc`
- build/dev/prod launcher 또는 cleanup helper 영향: `node --check` + 관련 CLI/entrypoint 직접 검증

보고 형식:
- 현재 상태
- 수행 내용
- 사용 skill
- 실행한 검증
- 미실행 검증
- 다음 작업
- 리스크
