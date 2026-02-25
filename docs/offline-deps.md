# Offline Dependency Install (pnpm)

이 문서는 네트워크 제한 환경에서 Prisma SQLite adapter 의존성(`@prisma/adapter-better-sqlite3`, `better-sqlite3`)을 포함한 패키지 설치를 위한 절차입니다.

## 1) 온라인 머신에서 준비

1. 오프라인 머신과 동일한 커밋으로 체크아웃합니다.
2. 빌드 스크립트 allowlist를 최신으로 맞춥니다.

```bash
pnpm deps:approve-builds
```

3. 아래 명령으로 pnpm store를 미리 채웁니다.

```bash
pnpm deps:offline:fetch
```

기본 fetch는 `dependencies + devDependencies (+ optionalDependencies)`를 대상으로 합니다.
필요하면 prod-only로 제한할 수 있습니다.

```bash
pnpm deps:offline:fetch --prod
```

4. store + 잠금 파일을 묶어 전달합니다.

```bash
mkdir -p artifacts
tar -czf artifacts/pnpm-store.tgz .pnpm-store pnpm-lock.yaml package.json
```

## 2) 오프라인 머신에서 설치

1. 전달받은 파일을 같은 커밋 레포에 풉니다.

```bash
tar -xzf artifacts/pnpm-store.tgz
```

2. 오프라인 설치를 실행합니다.

```bash
pnpm deps:offline:install
```

3. 설치 후 빌드 스크립트 미실행 상태로 보이면 rebuild를 실행합니다.

```bash
pnpm rebuild
```

4. `better-sqlite3`가 prebuild 다운로드 실패로 설치가 막히면 소스 빌드 강제 옵션을 사용합니다.

```bash
pnpm deps:offline:install:build
```

## 3) Prisma/런타임 확인

```bash
pnpm prisma:generate
pnpm datago:sync --source=kdb --kind=deposit
```

## 참고

- `.pnpm-store/`와 `artifacts/`는 커밋하지 않습니다.
- 프록시 URL/키/토큰 값은 공유하거나 로그에 출력하지 마세요.
- 소스 빌드가 필요한 환경은 빌드 툴(예: Linux의 `build-essential`, `python3`)이 필요할 수 있습니다.
- 설치 로그에 `Ignored build scripts`가 보이면 `package.json`의 `pnpm.onlyBuiltDependencies`에 필요한 패키지가 포함됐는지 확인하고, 이미 설치된 상태라면 `pnpm rebuild`를 실행하세요.
