# 2026-10-19 Finance CI standalone closeout

이 문서는 후속 candidate 커밋 직전의 기록입니다. 139의 로컬 검증·468bd233 푸시는 완료됐지만 해당 HEAD의 최신 CI는 실패했습니다. 이번 최종 HEAD의 원본 build/runtime/push 결과는 tmp/finance-ci-close-20261019/FINAL-RESULT.json 및 REPORT.md에서 별도로 판정합니다.

## 변경 파일
- scripts/next_build_safe.mjs
- scripts/standalone_next_output.mjs, scripts/standalone_next_output.d.mts
- tests/desktop-artifact-provenance.test.ts, tests/standalone-next-output.test.ts
- 이 기록

## 사용 skill
- gh-fix-ci, systematic-debugging, test-driven-development, verification-before-completion
- planning-gate-selector, work-log-closeout

## 변경 이유
- CI 39172972687 Windows job117809709972: .data trace 제외가 적용되지 않아 공개 snapshot 외 checkpoint/partial이 복사되고, pnpm 절대 junction이 원본 dependency를 가리켜 privacy gate가 실패했습니다.
- 같은 CI Linux job117809710152: 전체 946파일 중 945통과/1실패, 4698개 중 4691통과/2실패/5skip. 두 provenance 테스트는 checkout 빌드 산출물에 의존했습니다. 격리 fresh checkout+자체 의존성으로 재현한 실제 stderr는 standalone/server.js 부재에 따른 snapshot asset path is missing입니다. 초기 재현 사본의 의존성 링크로 인한 별도 오류와 구분합니다.

## 핵심 변경
- pinned Next16.3.8의 native Windows glob 불일치는 동일 matcher의 합성 경로로 재현했습니다. Windows 실기기 실행을 뜻하지 않습니다.
- Next 완료 직후의 새 generated 경계에서 .data trace만 제외하고 해당 generated .data 사본을 정리한 뒤 기존 SSOT 공식9개와 source 실패 marker를 준비합니다. 기존 admitted build에는 적용하지 않습니다. 원본 .data, DB와 dependency에는 쓰지 않습니다. 다른 비공개 trace는 여전히 실패합니다.
- 외부 dependency 링크는 프로젝트 pnpm store의 확인된 package identity와 이미 trace된 standalone 내부 counterpart의 identity가 같을 때만 내부로 재연결합니다. 임의 외부 링크·누락/상이한 package·linked/hardlinked data는 거부합니다. artifact 최종 escaping link 허용 규칙은 바꾸지 않았습니다.
- Linux 두 테스트에 기존 완전 fixture를 사용하여 server.js와 공식9개를 준비합니다. manifest/설치 symlink/stale checksum assertion은 유지하고 실패 stderr를 추가합니다.

## 검증
- tmp/finance-ci-close-20261019/logs/05-before-own-deps.log: 실제 두 실패 재현(exit1). 03은 의존성 외부 링크라는 재현 환경 오류로 별도 보존합니다.
- 06-normalization-before: 새 기능 없는 대조의 실패 보존.
- 08-affected: 격리 8파일 73통과/기존 Windows 전용2skip, exit0. 09-eslint/10-types exit0.
- 11-w-build: 개인 env 없는 소유 W에서 canonical build exit0. 12-w-audit: privacy0, 공식9개, 합성 canary 적중0 및 남아 있는 source canary 보존. 커밋 전 candidate 검사이며 최종 HEAD artifact 증거로 확대하지 않습니다.
- 원본 Vitest/full suite/release:verify, 공식 데이터 재수집은 실행하지 않았습니다.

## 남은 리스크
- 원본 새 HEAD canonical build/types, 실제 one-shot browser 전체25assert, 새 artifact/설치2starts·비밀 귀속·보호 검사 및 normal push는 이 문서 작성 시점 후속입니다.
- Windows junction의 Linux 합성 회귀와 실제 Windows CI를 구분합니다. 최종 최신 GitHub Windows/Linux 필수 CI와 비작성자 리뷰는 마스터 후속입니다.
- 이전 whole.next 스캔 FAIL과 과거 dev/cache를 삭제·PASS로 바꾸지 않습니다. 현재 production/artifact/install은 byte/context 대응으로 별도 판정합니다. 기본 Windows 브라우저·배포 미검증은 유지합니다.

## 다음 라운드
- 이 candidate의 canonical 원본 build/runtime/artifact/보호 검사를 모두 통과한 뒤 normal push합니다. 최신 GitHub CI와 비작성자 최종 리뷰는 마스터가 확인합니다.
- staged guard 최초 실행은 제목의 날짜 위치와 다음 라운드 제목 누락으로 실패했습니다. 내용·제품 코드·검사 기대값을 바꾸지 않고 형식만 정정했으며 최초 실패 로그를 보존합니다.
