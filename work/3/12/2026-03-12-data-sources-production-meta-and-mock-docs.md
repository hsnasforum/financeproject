# 2026-03-12 /settings/data-sources production 정책 / health meta / mock 문서 라운드

## 변경 전 정리
1. 수정 대상 파일
   - `src/app/settings/data-sources/page.tsx`
   - `src/components/DataSourceHealthTable.tsx`
   - `tests/e2e/data-sources-settings.spec.ts`
   - `docs/data-sources-settings-ops.md`
   - `docs/api-utilization-draft.md`
2. 변경 이유
   - 직전 라운드의 남은 리스크 세 가지를 닫아야 했다.
   - production에서 `운영 최신 기준`을 계속 보여줄지 정책 결정이 필요했다.
   - `/api/dev/data-sources/health`가 이미 내려주는 `impactHealthByCardId`, `impactReadOnlyByCardId` 메타를 운영 화면에서 실제로 쓰지 않고 있었다.
   - data-sources 화면의 mock/replay 해석 기준이 문서와 UI에 충분히 드러나지 않았다.
3. 실행할 검증 명령
   - `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
   - `pnpm lint`
   - `pnpm build`
   - `pnpm e2e:rc`

## 내부 회의 결론
1. production 노출 정책
   - `운영 최신 기준`은 production에서도 유지한다.
   - 이유: server-side에서 계산하는 read-only 기준값이고, `/settings/data-sources` 운영 화면에서 가장 덜 오해되는 최소 정보이기 때문이다.
   - 대신 `최근 연결 확인`, fallback/쿨다운 진단, 최근 오류 목록은 dev 전용으로 제한한다.
2. health meta 활용
   - `DataSourceHealthTable`에서 `impactHealthByCardId`, `impactReadOnlyByCardId`를 실제 화면 요약으로 노출한다.
   - 운영자는 도움 카드에 보이는 기준값과 health API 집계 시각을 한 화면에서 같이 확인할 수 있어야 한다.
3. mock/replay 해석
   - live 성공과 replay/mock 회복을 같은 성공으로 읽지 않도록 UI 안내와 docs를 같이 보강한다.

## 변경 후
1. 무엇이 바뀌었는지
   - production에서도 도움 카드의 `운영 최신 기준`은 유지하고, dev 전용 진단 블록은 별도 안내 카드로 분리했다.
   - `DataSourceHealthTable`에 `사용자 도움 카드 기준 요약` 섹션을 추가해 health API 메타를 실제 운영 화면에서 확인할 수 있게 했다.
   - fallback/mock/replay 해석 규칙을 화면 문구와 운영 체크리스트에 같이 반영했다.
   - E2E는 새 meta 요약 카드까지 확인하도록 확장했다.
2. 재현 또는 검증 방법
   - `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
   - `pnpm lint`
   - `pnpm build`
   - `pnpm e2e:rc`
3. 남은 리스크와 엣지케이스
   - 기능 리스크로 남겨둔 항목은 이번 범위에서 해소했다.
   - 다만 DART `generatedAt`과 실제 신규 공시 접수시각은 계속 다른 의미이며, mock/fallback 200은 live 성공과 다르다는 점은 운영 해석 규칙으로 계속 유지해야 한다.

## 이번 라운드 완료 항목
1. production에서의 `운영 최신 기준` 노출 정책 결정 및 반영
2. dev health table의 impact meta 실제 활용
3. mock/replay 해석 기준의 UI 및 docs 반영
4. 기본 `pnpm e2e:rc` 재검증

## 다음 라운드 우선순위
1. 필요 시 production 전용 스모크에서 `/settings/data-sources` read-only 렌더를 별도 검증
2. health table의 카드 기준 요약을 export 또는 audit 경로로 재사용할지 검토

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
