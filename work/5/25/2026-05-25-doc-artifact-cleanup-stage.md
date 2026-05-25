# 2026-05-25 문서/로컬 아티팩트 정리

## 변경 파일
- `.gitignore`
- `guidedoc/*:Zone.Identifier`
- `work/4/**`
- `work/5/25/2026-05-25-*.md` 중 기존 untracked 종료 기록
- `work/5/25/2026-05-25-doc-artifact-cleanup-stage.md`

## 사용 skill
- `work-log-closeout`: 변경 범위와 검증 결과 기록

## 변경 이유
- Windows 다운로드 메타데이터인 `Zone.Identifier` 파일에는 외부 다운로드 URL이 남아 있어 저장소 문서로 유지할 이유가 없습니다.
- `.pipeline/`, `verify/`는 로컬 검증 산출물이고 `CLAUDE.md`는 개인 도구 설정 문서라 추적 제외 대상으로 추가했습니다.
- 기존에 작성됐지만 추적되지 않은 `/work` 종료 기록을 저장소에 포함해 변경 이력과 검증 맥락을 남겼습니다.

## 검증
- `rg -n 'api[_-]?key|secret|token|password|HostUrl|sig=|ServiceKey|KDB_DATAGO_SERVICE_KEY|DATAGO_SERVICE_KEY' work/4 work/5/25` 실행: 실제 비밀값 없음, 문서화된 env 이름만 1건 확인
- `git diff --check -- .gitignore guidedoc` PASS

## 남은 리스크
- `/work` 문서는 과거 라운드 기록을 포함해 양이 많습니다. 코드 동작에는 영향이 없습니다.
- `guidedoc` 원본 docx/pdf/xlsx 파일은 유지하고 Zone.Identifier 메타 파일만 제거합니다.
