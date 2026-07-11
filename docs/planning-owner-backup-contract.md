# Planning owner backup/restore 계약

## 상태

- 기준 Issue: [#229](https://github.com/hsnasforum/financeproject/issues/229)
- 선행 안전 차단: [#228](https://github.com/hsnasforum/financeproject/issues/228)
- `v3:restore --apply`는 owner archive, staging, rollback, doctor 통합이 모두 검증될 때까지 `V3_RESTORE_APPLY_DISABLED`로 차단합니다.
- 이 문서는 registry와 manifest 형식의 내부 계약을 고정합니다. 현재 운영자가 사용하는 export/restore 명령 동작은 아직 바꾸지 않습니다.

## Runtime context

owner 경로는 ambient 전역값을 실행 중 반복 조회하지 않고, 작업 시작 시 다음 값을 한 번 복사한 context로 계산합니다.

- `cwd`
- `env`
- `platform`
- namespace 활성 여부와 명시적 `userId`
- 실제 Planning root `P`
  - 개발 기본값: `<cwd>/.data/planning`
  - `PLANNING_DATA_DIR`
  - production packaged vault
- runtime data root `D = dirname(P)`
- 사용자 root `U = P/users/<userId>` 또는 namespace 미사용 시 `P`

packaged mode의 `P`가 이미 `vault`로 끝나더라도 현재 store resolver가 만드는 `P/vault/profiles`를 그대로 유지합니다. backup 계층에서 경로를 임의로 정규화하지 않습니다.

namespace가 활성화된 다중 사용자 모드에서는 호출자가 `userId` 또는 context에 복사할 `PLANNING_USER_ID`를 명시해야 합니다. 요청 scope나 기본값을 뒤늦게 조회해 `default` 사용자로 조용히 귀속하지 않습니다. single-user mode만 `users/default`를 명시적 계약으로 사용합니다.

## Registered owners

모든 owner descriptor는 full manifest에 반드시 존재하지만, 새 설치를 corruption으로 오판하지 않도록 파일 0개를 허용합니다.

| owner | scope | 핵심 데이터 |
| --- | --- | --- |
| `stable.profile-run-vault` | user 또는 unscoped shared | stable profile, run, blob, index, action center |
| `stable.reports` | user 또는 unscoped shared | 저장된 Markdown report와 meta |
| `v3.accounts` | user 또는 unscoped shared | canonical·legacy account |
| `v3.opening-balances` | user 또는 unscoped shared | account opening balance |
| `v3.batches` | user 또는 unscoped shared | batch index와 모든 NDJSON |
| `v3.drafts` | user 또는 unscoped shared | cashflow/profile draft와 legacy boundary artifact |
| `v3.category-rules` | user 또는 unscoped shared | 사용자 category rule |
| `v3.transaction-overrides` | user 또는 unscoped shared | category·transfer·account override와 legacy file |
| `v3.news` | user 또는 unscoped shared | news settings, item, note, digest, cache |
| `v3.indicators` | runtime-shared | series, meta, state, spec override |
| `v3.alerts` | user 또는 unscoped shared | events, event state, rule override |
| `v3.journal` | user 또는 unscoped shared | journal entries |
| `v3.exposure` | user 또는 unscoped shared | exposure profile |
| `v3.csv-drafts` | user 또는 unscoped shared | CSV/import draft store |
| `v3.routines` | user 또는 unscoped shared | daily routine state |
| `v3.scenario-overrides` | user 또는 unscoped shared | scenario library override |
| `v3.legacy-transactions` | runtime-shared legacy | same-ID compatibility transaction log |

`PLANNING_V3_DRAFTS_DIR`는 현재 서로 다른 schema를 가진 `v3.drafts`와 `v3.csv-drafts`가 함께 사용합니다. 두 owner가 같은 절대 경로로 resolve되면 registry는 `OWNER_TARGET_COLLISION`으로 중단하며 어느 한 schema로 임의 통합하지 않습니다.

## Registry invariants

- owner ID와 owner logical path는 유일해야 합니다.
- owner 내부 logical location도 유일해야 합니다.
- target은 절대 경로여야 합니다.
- filesystem root 자체는 owner target이 될 수 없습니다.
- 서로 다른 location의 동일 경로 또는 부모·자식 overlap을 허용하지 않습니다.
- Linux의 실제 target 포함 관계는 대소문자를 보존하고 Windows는 대소문자를 구분하지 않습니다.
- namespace user owner에는 고정된 `userId`가 있어야 합니다.
- `.data/exports`, staging, rollback journal, lock, secret, Prisma DB, 외부 데이터 snapshot은 wildcard owner로 등록하지 않습니다.
- unrelated file은 어떤 owner에도 매칭되지 않아야 합니다.

## Manifest v1

새 owner archive는 다음 최상위 필드를 사용합니다.

```json
{
  "kind": "planning-owner-vault",
  "formatVersion": 1,
  "archiveScope": "active-namespace-and-runtime-shared",
  "archiveId": "UUID",
  "generatedAt": "ISO-8601",
  "appVersion": "1.0.4",
  "owners": []
}
```

v1은 현재 고정한 사용자 namespace의 owner와 runtime-shared owner를 함께 선언하는 `active-namespace-and-runtime-shared` archive만 정의합니다. 이 값은 다른 사용자 namespace까지 포함한 전체 runtime backup을 뜻하지 않습니다. user-only, shared-only, 모든 사용자 포함 archive는 같은 형식의 암묵적 부분집합으로 만들지 않으며 별도 제품·보안 결정을 거쳐 새 scope를 추가합니다.

각 owner record는 `ownerId`, `schemaVersion`, `logicalPath`, `namespace`, `required`, `emptyAllowed`, `fileCount`, `totalBytes`, `checksum`, `files`를 가집니다. 파일 record는 portable relative POSIX path, byte size, SHA-256을 기록합니다.

owner checksum은 path로 정렬한 `[path, sizeBytes, sha256]` 배열의 canonical JSON에 대한 SHA-256입니다. 파일 내용뿐 아니라 누락, 추가, 이름 변경도 checksum을 바꿉니다.

다음은 preview 전에 오류로 처리합니다.

- 알 수 없는 owner·schema version
- required owner 누락
- source/target namespace 또는 user 불일치
- file count·total bytes·owner checksum 불일치
- 중복, 대소문자·Unicode collision, file/directory collision
- absolute, traversal, drive/UNC/ADS, Windows reserved name, segment 끝 dot/space
- owner가 선언한 file exact path 또는 directory prefix 밖의 payload path

물리 target은 manifest의 `logicalPath`로 계산하지 않고 registry만 결정합니다.

## 구현 순서와 중단 조건

1. registry·manifest 계약
2. 암호화된 archive writer와 strict preview reader
3. target과 같은 volume의 staging 및 durable journal rollback
4. registry 기반 doctor와 제한적 apply 활성화

stable profile/run 개인정보가 추가되므로 평문 `v3:export`를 그대로 확장하지 않습니다. portable encrypted backup과 동일 runtime key 전용 disaster-recovery snapshot 중 제품·보안 정책이 정해지기 전에는 writer를 운영 기본값으로 만들지 않습니다.

다음 archive writer 단계는 owner root와 하위 entry를 `lstat`·`realpath`로 다시 확인해야 합니다. symlink, junction, reparse point를 따라가지 않고, 서로 다른 lexical path가 같은 realpath로 합쳐지거나 하위 entry가 owner root 밖으로 나가면 수집·preview를 중단합니다. Linux symlink alias·escape fixture와 실제 Windows junction fixture는 apply 활성화 전 필수 gate입니다.

다음 중 하나라도 충족하지 못하면 apply 차단을 유지합니다.

- exact namespace와 owner completeness 검증
- 모든 file·owner checksum 검증
- owner별 schema validator
- same-volume staging과 pending journal recovery
- injected failure 뒤 활성 데이터 checksum 불변
- rollback incomplete 시 evidence 보존
- offline/quiesced single-writer 보장
- 실제 Windows rename/locking 검증
