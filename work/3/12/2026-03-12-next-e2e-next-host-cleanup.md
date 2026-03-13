# 2026-03-12 next-e2e next-host 정리

## 변경 파일
- `work/3/12/2026-03-12-next-e2e-next-host-cleanup.md`
- 루트 산출물 디렉터리 `.next-e2e*`
- 루트 산출물 디렉터리 `.next-host*`

## 사용 skill
- `work-log-closeout`: `/work` 종료 기록 형식을 저장소 규칙에 맞추기 위해 사용.

## 변경 이유
- 루트에 누적된 `.next-e2e*`, `.next-host*` 디렉터리가 실제 코드 참조 없이 디스크를 약 13G 사용하고 있었다.
- 현재 실행 중인 Next/Playwright 프로세스가 없는 상태라 재생성 가능한 산출물만 안전하게 정리할 수 있었다.

## 핵심 변경
- `rg`로 코드베이스를 확인해 `.next-e2e*` 참조가 `playwright.config.ts`, `tsconfig.playwright.json`, 문서에만 있음을 확인했다.
- `.next-host*`는 코드 참조가 없고 루트 숨김 산출물 디렉터리로만 존재함을 확인했다.
- 루트의 `.next-e2e*`, `.next-host*` 디렉터리만 삭제하고 `.next` 본체와 `.next/standalone` 내부 빌드 산출물은 건드리지 않았다.
- 삭제 후 루트에 동일 패턴 디렉터리가 남지 않음을 다시 확인했다.

## 검증
- `find . -maxdepth 3 \( -type d -o -type f \) \( -name 'next-e2e' -o -name 'next-host' -o -name '*next-e2e*' -o -name '*next-host*' \) | sort`
- `rg -n "next-e2e|next-host" --glob '!work/**' --glob '!.next/**' --glob '!.next-e2e*/**' --glob '!.next-host*/**'`
- `du -sch .next-e2e* .next-host* 2>/dev/null | tail -n 1`
- `ps -ef | rg "next_dev_safe|next_prod_safe|playwright|next/dist/bin/next"`
- `node --input-type=module -e "import fs from 'node:fs'; import path from 'node:path'; const cwd=process.cwd(); for (const name of fs.readdirSync(cwd)) { if (/^\\.next-(e2e|host)(-|$)/.test(name)) { fs.rmSync(path.join(cwd, name), { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }); console.log(name); } }"`
- `ls -d .next-e2e* .next-host* 2>/dev/null | sed -n '1,40p'`
- `git status --short --ignored | rg "next-e2e|next-host"`

## 남은 리스크
- `.next` 내부의 `.next/standalone/.next-e2e*`, `.next/standalone/.next-host*`는 현재 빌드 산출물 영역이라 이번 라운드에서는 정리하지 않았다.
- 새 Playwright/dev 실행 시 동일 패턴 디렉터리가 다시 생성될 수 있다.
- `manager` 에이전트 분해 응답은 지연되어 이번 라운드 의사결정에는 반영하지 못했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
