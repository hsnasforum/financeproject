# Frontend Consistency Sweep: Settings Tools (2026-03-15)

## Batch Purpose
- `/settings/data-sources`, `/settings/backup`, `/settings/recovery`, `/settings/maintenance` 등 설정 도구 표면을 최신 디자인 언어로 정렬한다.
- `PageShell`, `PageHeader`, `Card`, `SubSectionHeader` 공용 패턴을 적용하고 정보 위계를 강화한다.
- 위험 작업(Destructive Actions)에 대한 시각적 분리와 안내(Disclosure)를 개선한다.

## Status & Audit
1. **Data Sources (`/settings/data-sources`)**:
   - `PageShell`, `PageHeader`는 적용되어 있으나 내부 카드들이 `rounded-2xl` 및 `text-base font-semibold` 등 구형 패턴 사용 중.
   - 확장 후보 및 운영 진단 영역의 시각적 분리 필요.

2. **Backup (`/settings/backup`)**:
   - `Export`와 `Import` 영역이 하나의 그리드에 있으나 내부 위계가 약함.
   - 복원 미리보기(Diff) 및 결과 요약 섹션의 가독성 보완 필요.

3. **Recovery (`/settings/recovery`)**:
   - `Dev Unlock` 및 `Safety Input` 영역이 단순 카드 나열 형태.
   - 위험 작업(RESET) 버튼의 강조와 오실행 방지를 위한 시각적 장치 필요.

4. **Maintenance (`/settings/maintenance`)**:
   - 리텐션 정책 입력 폼이 단순 그리드 나열.
   - 감사 로그(`AuditLogCard`)와의 연결성 및 카드 톤 보정 필요.

## Planning & Strategy
1. **Visual Hierarchy & Consistency**:
   - 모든 도구 섹션 제목을 `SubSectionHeader` (`text-lg font-black`)로 통일.
   - 주요 컨테이너를 `rounded-[2rem]` 카드로 정렬.
   - 입력 요소(`input`, `select`)를 `h-11`, `rounded-2xl` spec으로 통일.

2. **Destructive Actions Zone**:
   - `Recovery`와 `Maintenance`의 위험 액션 구간에 Rose 톤 또는 명확한 경고 헤더 적용.
   - `RESET` 확인 절차를 더 눈에 띄게 배치.

3. **Status & Metrics**:
   - 데이터 소스 상태 및 복원 Diff 지표를 `StatCard` 패턴 또는 태그 그리드로 정돈.

## Execution Steps
1. `src/app/settings/data-sources/page.tsx` 및 관련 카드 컴포넌트 리팩토링.
2. `src/components/BackupClient.tsx` 리팩토링.
3. `src/components/RecoveryClient.tsx` 리팩토링.
4. `src/components/MaintenanceSettingsClient.tsx` 리팩토링.
5. `docs/frontend-design-spec.md`에 설정 도구 패턴 반영.
6. `pnpm lint` 및 `pnpm build` 검증.

## Definition of Done
- [x] 모든 설정 도구 화면이 `PageShell`/`PageHeader` 기반으로 전환 및 정렬됨.
- [x] 위험 작업(RESET 등)에 대한 시각적 경고 위계가 강화됨.
- [x] 입력 요소와 버튼의 스타일이 공통 가이드를 따름.
- [x] 복잡한 운영 데이터(Diff, Health)가 정돈된 그리드 또는 표 형태로 제공됨.

## Summary of Changes
- **Data Sources (`/settings/data-sources`)**:
  - `PageShell`, `PageHeader` 적용 및 내부 카드들을 `rounded-[2rem]` 패턴으로 전면 리뉴얼.
  - **Status Strip**: 상단에 요약 상태 바를 배치하여 전체 API 정합성을 한눈에 파악하도록 개선.
  - `DataSourceStatusCard`, `OpenDartStatusCard`: 폰트 위계(Black font)와 배경색(Slate 50/50)을 조정하여 정보 밀도 최적화.
- **Backup (`/settings/backup`)**:
  - `BackupClient`: Export/Import 영역을 명확히 분리하고 `SubSectionHeader` 적용.
  - 복원 미리보기(Diff)를 4열 그리드와 상세 파일 리스트로 개편하여 가독성 강화.
  - 최종 결과 요약을 다크 테마 카드로 시각적 차별화.
- **Recovery (`/settings/recovery`)**:
  - `RecoveryClient`: 위험 작업 구역에 **Danger Zone** 패턴(`bg-rose-50/20`) 적용.
  - `RESET` 확인 입력란과 실행 버튼의 위계를 강화하여 실수 방지 및 명확한 액션 유도.
- **Maintenance (`/settings/maintenance`)**:
  - `MaintenanceSettingsClient`: 리텐션 정책 설정을 3열 그리드로 정돈하고 입력 요소 spec 통일.
  - 감사 로그와의 레이아웃 정합성 확보.
- **Design Spec**:
  - `docs/frontend-design-spec.md`에 `Setting Tools & Destructive Actions` 섹션 추가 (Danger Zone, Safety Confirmation, Status Strip 패턴 명문화).

## Verification Results
- **pnpm build**: 성공
- **pnpm lint**: 성공 (대상 파일 Clean)
- **git diff --check**: 통과
