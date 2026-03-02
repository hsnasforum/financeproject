# Planning v2 Quickstart

3분 안에 Planning v2를 실행하는 최소 절차입니다.
새 PC/새 환경의 첫 세팅은 `docs/planning-v2-setup-playbook.md`를 사용하세요.

## 1) 설치/실행

```bash
pnpm i
pnpm dev
```

선택(최신 가정 스냅샷 동기화):

```bash
pnpm planning:assumptions:sync
```

## 2) 사용 시작

1. 브라우저에서 `/planning` 접속
2. `Load sample profile` 버튼으로 샘플을 편집기에 불러오거나, 프로필을 직접 생성
3. 샘플/프로필 내용을 확인한 뒤 `Save`를 눌러 실제 저장
4. `실행` 버튼 클릭
5. 결과 확인 후 `실행 기록 저장`
6. `/planning/runs`에서 실행 기록 비교/내보내기

## 3) 운영 최소 루틴

1. `/ops/assumptions`에서 스냅샷 상태 확인/동기화
2. 정기 점검: `pnpm planning:v2:ops:run`

## 4) 검증 커맨드

```bash
pnpm planning:v2:complete
```

로컬 서버 실행 중일 때(선택):

```bash
PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance
```

## 5) 완료 판정

완성 확인은 아래 3단계를 기준으로 합니다.

1. `pnpm planning:v2:complete`
2. 서버 실행 후 `pnpm planning:v2:acceptance`
3. `docs/planning-v2-5min-selftest.md` 체크 항목 완료
