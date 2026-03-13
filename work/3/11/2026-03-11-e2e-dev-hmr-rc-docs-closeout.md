# 2026-03-11 e2e dev hmr rc docs closeout

## 수정 대상 파일
- `README.md`
- `docs/planning-v2-setup-playbook.md`

## 변경 이유
- 직전 라운드에서 dev Playwright HMR guard는 구현됐지만, release gate 재검증과 운영 문서 반영이 아직 남아 있었다.
- `E2E_DISABLE_DEV_HMR`의 기본 동작과 재현용 사용법을 문서에 남겨야 다음 라운드에서 혼선 없이 재사용할 수 있다.

## 무엇이 바뀌었는지
- README의 E2E 명령 섹션에 dev Playwright가 기본적으로 `E2E_DISABLE_DEV_HMR=1`로 HMR websocket을 막는다는 점을 추가했다.
- HMR 포함 원래 조건을 다시 재현할 때 `E2E_DISABLE_DEV_HMR=0`로 실행하는 예시를 README에 추가했다.
- setup playbook의 완성 확인 섹션에도 `pnpm e2e:rc`와 같은 가드 설명을 반영했다.

## 검증 명령
- `pnpm e2e:rc`

## 결과
- `pnpm e2e:rc` PASS
- 총 `8 passed`
- 최신 기준으로 release gate와 문서 공백까지 같이 닫혔다.

## 남은 리스크
- 현재 자동화 기준으로 남은 리스크는 재현되지 않았다.
- [가정] 수동 개발 브라우저의 일반 HMR 동작은 테스트 가드 범위 밖이며, 이번 문서는 Playwright dev E2E 운영 기준을 설명한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
