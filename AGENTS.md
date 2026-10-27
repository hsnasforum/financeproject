# AGENTS.md — finance

전역 작업 계약을 전제로 Finance 고유 불변식만 적습니다. 세부 절차는 표의 문서를 해당 변경이 있을 때만 읽습니다.

## 작업 방식

- 제품 작업은 `FINANCE_ACTIVE_GOAL.md`와 대조합니다. 금융 거래, 실제 DB 변경·restore, Git 게시는 명시적 요청이나 유효한 승인 안에서만 합니다.
- 실행은 `corepack pnpm dev|build|start`, `prisma:generate`, `prisma:db:push`만 씁니다. raw Next/Prisma나 별도 writer로 runtime 보호를 우회하지 않습니다.

## 불변식

- 비전문가용 참고 지표입니다. 투자 권유·대출 승인 예측·법률/세무 자문·확정 답안으로 쓰지 않고, 수익보다 현금흐름 안정성·손실 통제·부채 부담·데이터 신뢰도를 우선합니다.
- 금리·세율·한도·수익률·가격·환율·정책 값은 출처·기준 국가·기준일을 유지하고 최신성 미확인 값은 핵심 판단에 쓰지 않습니다.
- 통화/퍼센트/기간 단위, 월별·최종 반올림, 공유 KST 날짜 경계를 유지합니다. 계산 변경은 0·경계·큰 값·누락·날짜·저장 호환성을 확인합니다.
- 추천은 기존 recommend domain의 schema·score·weight가 단일 기준이며 장단점·전제·데이터 부족·상충을 보존합니다.
- 외부 데이터는 공식 API만 쓰고 source·fetched-at·기준일·freshness·오류 원인을 보존합니다. 없음/설정 누락/오류/stale/부분 성공을 구분하고 실패를 빈 성공이나 오래된 값으로 숨기지 않습니다.
- live sync/refresh는 목적·자격 증명·rate limit이 명확할 때만 실행합니다. secret·개인/운영 식별자·원문 데이터를 클라이언트 번들, `NEXT_PUBLIC_*`, 로그·report에 노출하지 않습니다.
- 외부 fetch·I/O·계산·추천·formatting은 기존 domain/service/repository에 두고 page/route는 조립·입력 검증·인증·scope만 맡습니다. Planning v2/v3 route·schema·store를 섞지 않고 쓰기는 공식 script의 단일 writer 경계만 씁니다.
- owner/current user는 서버가 확인하고 사용자 데이터는 사용자별 격리, scope 불명확 시 fallback 없이 거부합니다. Desktop Local production의 launcher·`127.0.0.1`·session broker·data root 정책과 backup service 경계를 우회하지 않습니다.
- 화면은 쉬운 한국어로 숫자의 의미·기준 시점·데이터 상태·다음 행동을 보여 주고 누락을 숨기지 않습니다.

## 단일 기준점과 참조 문서

같은 목록·점수·상태를 UI/API/테스트에 복제하지 않습니다.

| 대상 | 기준 |
| --- | --- |
| route·navigation·공개 경로 | `docs/current-screens.md`, `route-ssot-check` |
| Planning v2/v3 경계 | `docs/planning-v3-boundary-adr.md` |
| 배포·runtime·desktop·DB·backup·script | `README.md`, `docs/deploy.md`, `docs/runtime.md`, `docs/maintenance.md`, `docs/package-scripts.md` |
| 금융 계산·추천 의미 | 관련 domain/tests, `USER_GUIDE.md` |
| 검증·위임·handoff·게시 배치 | `multi_agent.md`, `planning-gate-selector`, `work-log-closeout` |
