# 2026-08-27 Writer inventory IMAGE_03 교정

## 변경 파일

- `resources/captures/2026-08-27/writer-inventory/IMAGE_03_root_relationship_diagram_v2.png`
- `resources/captures/2026-08-27/writer-inventory/README.md`
- `work/8/27/2026-08-27-writer-inventory-images.md`
- `work/8/27/2026-08-27-writer-inventory-image03-correction.md`

## 사용 skill

- `finance-skill-routing`: ops/docs 이미지 교정에 필요한 최소 skill 조합을 선택했다.
- `planning-gate-selector`: 이미지·문서 전용 변경으로 분류하고 시각·metadata·문서 diff 검증을 선택했다.
- `imagegen`: 기존 IMAGE_03의 스타일을 보존하면서 오른쪽 경로 포함 관계만 교정했다.
- `work-log-closeout`: 교정 범위와 실제 검증, 게시 제외 파일을 기록했다.

## 변경 이유

- 기존 IMAGE_03은 `planningRoot = P`라고 적으면서 바깥 `P` 안에 별도 `planningRoot` 상자를 둬 `P/planningRoot` 계층처럼 읽힐 수 있었다.
- 확인된 계약인 `planningRoot = P`, `controlRoot = P/runtime`을 공간적으로도 같은 의미로 표현해야 했다.

## 핵심 변경

- 기존 실패본은 삭제하거나 덮어쓰지 않고 게시 제외로 남겼다.
- v2 오른쪽 외곽 상자 자체를 `planningRoot = P`로 표시했다.
- v2 외곽 상자 내부에는 `controlRoot = P/runtime` 상자 하나만 배치했다.
- IMAGE_01·02의 조건부 통과와 IMAGE_04의 통과 판정, 파일과 hash는 변경하지 않았다.
- README에서 v2만 IMAGE_03 게시 후보로 지정하고 이전본의 제외 사유와 두 hash를 기록했다.

## 검증

- `view_image`로 1672×941 원본을 열어 오른쪽에 별도 `P` 상자나 별도 `planningRoot` 내부 상자가 없음을 확인했다.
- 358px 축소 렌더를 열어 `PLANNING_DATA_DIR = P`, `planningRoot = P`, `controlRoot = P/runtime`과 하단 고지가 판독되는지 확인했다.
- `file resources/captures/2026-08-27/writer-inventory/IMAGE_03_root_relationship_diagram_v2.png`: 1672×941 RGB PNG로 확인했다.
- `sha256sum resources/captures/2026-08-27/writer-inventory/IMAGE_03_root_relationship_diagram_v2.png`: `f40aee8af06d186afb815e5ede8351cf612326e91b06f5d9f53a38cebf8fe0ea`.
- System.Drawing `PropertyItems` 검사: GPS·촬영 위치·카메라·날짜 EXIF 항목은 없었다.
- `git diff --check -- resources/captures/2026-08-27/writer-inventory/README.md work/8/27/2026-08-27-writer-inventory-images.md work/8/27/2026-08-27-writer-inventory-image03-correction.md`: PASS.
- `rg -n "[[:blank:]]+$" resources/captures/2026-08-27/writer-inventory/README.md work/8/27/2026-08-27-writer-inventory-images.md work/8/27/2026-08-27-writer-inventory-image03-correction.md`: trailing whitespace 없음.
- 코드·HTML·실행 경로를 바꾸지 않아 `pnpm test`, `pnpm build`, `pnpm e2e:rc`는 실행하지 않았다.

## 남은 리스크

- 게시 시 기존 `IMAGE_03_root_relationship_diagram.png`를 선택하면 안 되며 `_v2.png`만 사용해야 한다.
- IMAGE_01·02는 내부 PR 번호와 제목이 남아 있어 공개 승인 전 업로드하지 않는다.
- 실제 이미지 업로드 URL, `figure`·`figcaption`, 대표 이미지 지정과 티스토리 스킨 렌더링은 아직 확인하지 않았다.
