# Planning v2 Bug Report Template

장애/버그 발생 시 아래 양식을 그대로 복사해서 작성합니다.  
목표는 "재현 가능성"과 "복구 속도"를 높이는 것입니다.

## 1) 기본 정보
- 발생 일시(로컬 시간):
- 보고자:
- 환경:
  - OS:
  - 브라우저/버전:
  - 브랜치/커밋:

## 2) 발생 화면/경로
- 화면: (`/planning`, `/planning/runs`, `/planning/reports`, `/ops/assumptions` 등)
- URL:

## 3) 재현 절차 (1~5)
1. 
2. 
3. 
4. 
5. 

## 4) 기대 결과 vs 실제 결과
- 기대 결과:
- 실제 결과:
- 빈도:
  - [ ] 항상 발생
  - [ ] 간헐 발생
  - [ ] 1회 발생

## 5) Snapshot / Health 정보
- snapshotRef:
  - id:
  - asOf:
  - fetchedAt:
  - missing: (`true`/`false`)
- health summary:
  - criticalCount:
  - warningCodes: (쉼표 구분)

## 6) 식별자/연관 산출물
- runId: (있으면)
- reportId: (있으면)
- 관련 파일 경로: (있으면)

## 7) 로그/증적
- 브라우저 콘솔 로그(민감정보 제거 후):
```text
(여기에 붙여넣기)
```
- 서버/ops 로그(민감정보 제거 후):
```text
(여기에 붙여넣기)
```
- 스크린샷/영상: (경로 또는 첨부 위치)

## 8) 게이트 상태(가능하면 첨부)
- 실행 명령:
```bash
pnpm planning:v2:complete
```
- 결과 요약:
```text
(PASS/FAIL 및 실패 단계)
```

## 9) 임시 완화/복구 조치 (있으면)
- 수행한 조치:
- 조치 후 상태:
- 원복 필요 여부:

