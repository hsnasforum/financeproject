# Planning owner backup/restore 계약

## 상태

- 기준 Issue: [#229](https://github.com/hsnasforum/financeproject/issues/229)
- 선행 안전 차단: [#228](https://github.com/hsnasforum/financeproject/issues/228)
- `v3:restore --apply`는 owner archive, staging, rollback, doctor 통합이 모두 검증될 때까지 `V3_RESTORE_APPLY_DISABLED`로 차단합니다.
- 기존 `v3:export`와 `v3:restore` 기본 형식은 유지합니다. PR-B는 명시적인 `--format=owner`에서만 암호화 writer와 read-only preview를 추가하며 운영 기본값으로 승격하지 않습니다.
- owner writer는 fixture·실험 검증용입니다. `--ack-quiesced`는 실제 writer lock이나 애플리케이션 drain을 수행하지 않으므로 운영 데이터의 일관된 snapshot을 보장하지 않습니다.

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

## 암호화 envelope v1

owner archive는 평문 ZIP을 파일에 쓰지 않고 다음 strict JSON envelope로만 내보냅니다.

```json
{
  "kind": "planning-owner-vault-encrypted",
  "version": 1,
  "content": {
    "kind": "planning-owner-vault",
    "formatVersion": 1,
    "encoding": "zip"
  },
  "kdf": {
    "name": "scrypt",
    "N": 16384,
    "r": 8,
    "p": 1,
    "keyLength": 32
  },
  "salt": "base64(16 bytes)",
  "aead": {
    "version": 1,
    "alg": "aes-256-gcm",
    "iv": "base64(12 bytes)",
    "tag": "base64(16 bytes)",
    "ciphertext": "base64"
  }
}
```

- KDF 값은 고정 schema로 검증한 뒤에만 key derivation을 시작합니다. archive 입력이 임의의 과도한 KDF 비용을 지정할 수 없습니다.
- AES-GCM AAD는 envelope kind/version, content 형식, KDF 전체, salt, IV를 인증합니다.
- base64는 canonical encoding만 허용하고 salt·IV·tag 길이를 정확히 확인합니다.
- passphrase는 trim·Unicode 정규화 없이 파일의 정확한 byte를 사용하며 16~4096 bytes만 허용합니다.
- passphrase literal argument와 env 전달은 지원하지 않습니다. POSIX passphrase 파일은 owner 외부 regular file이어야 하고 group/other permission bit가 없어야 합니다.
- 출력 파일은 owner 외부 같은 디렉터리의 임시 파일을 `0600`으로 쓰고 `fsync`한 뒤 hard-link no-clobber와 directory `fsync`로 게시합니다. 기존 파일을 덮어쓰지 않으며 crash 전후 최종 이름에는 완성된 archive만 남깁니다.
- POSIX 출력 경로의 전체 directory chain은 현재 UID 또는 root 소유여야 합니다. group/other writable directory는 sticky bit가 있을 때만 허용하여 공유 writable parent의 symlink/rename confused-deputy 경로를 차단합니다.

## Writer와 strict preview

- writer는 registry의 17개 owner를 전부 순회하고 현재 namespace owner와 runtime-shared owner를 함께 수집합니다.
- source root와 하위 entry는 `lstat`, `realpath`, open-handle `fstat`으로 확인합니다. symlink, special file, owner root escape, realpath alias·collision, 읽기 중 identity 변경은 fail-closed입니다.
- missing location과 존재하지만 파일 0개인 owner는 수집 summary에서 구분합니다. full manifest에는 두 경우 모두 owner record와 `fileCount: 0`이 남습니다.
- 현재 runtime key로 암호화된 stable profile/run payload는 portable adapter가 없으므로 `OWNER_PORTABLE_EXPORT_UNAVAILABLE`로 중단합니다. 암호화 표식이 있는 손상 envelope도 raw JSON으로 내보내지 않고 `OWNER_STABLE_ENCRYPTED_PAYLOAD_INVALID`로 중단합니다.
- 기본 제한은 payload 10,000개, entry 32 MiB, 전체 source 64 MiB, manifest 4 MiB, ZIP 70 MiB, encrypted envelope 96 MiB, logical path 1,024 bytes입니다.
- ZIP writer는 UTF-8 filename flag와 ZIP32 hard limit를 사용합니다. strict reader는 archive·compressed·uncompressed 한도, canonical path, encrypted/directory/non-regular entry를 검증합니다.
- preview는 manifest 외 ZIP payload exact-set, entry size, SHA-256, owner checksum, namespace를 모두 확인합니다. 누락·추가·변조·user A/B 불일치에서 활성 데이터나 대상 namespace를 생성하지 않습니다.
- preview는 read-only이며 apply 경로로 fallback하지 않습니다. owner archive도 legacy archive로 fallback하지 않습니다.

## 실험용 CLI

passphrase 파일과 archive 출력은 registry owner 경로 밖의 별도 보호 디렉터리에 둡니다.

```bash
chmod 700 /secure
chmod 600 /secure/finance-owner-passphrase
pnpm v3:export -- --format=owner --passphrase-file=/secure/finance-owner-passphrase --ack-quiesced --out=/secure/finance-owner-backup.owner.enc.json
pnpm v3:restore -- --format=owner --passphrase-file=/secure/finance-owner-passphrase --in=/secure/finance-owner-backup.owner.enc.json
```

- 첫 명령은 실제 write 중단을 수행하지 않으므로 임시 fixture 또는 명시적으로 offline·quiesced 상태가 보장된 복제 데이터에서만 사용합니다. group/other writable 공유 directory를 `--out` parent로 사용하면 `OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED`로 중단합니다.
- 두 번째 명령은 암호 해제와 strict preview만 수행합니다. `--apply`를 함께 주면 파일·passphrase를 읽기 전에 `V3_RESTORE_APPLY_DISABLED`로 종료합니다.
- Linux symlink·Unicode·권한 fixture는 검증했습니다. 실제 Windows junction/reparse point, ACL, rename·open-handle 동작은 아직 검증하지 않았으므로 native Windows의 owner writer와 passphrase-file 입력은 `OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED`로 fail-closed합니다.

## Fixture 전용 staged restore transaction

PR-C는 검증된 owner archive payload를 callback 범위에서만 전달하고, `os.tmpdir()` 아래의 명시적 fixture boundary에서만 실행되는 내부 transaction API를 추가합니다. 이 API는 CLI, HTTP route, production restore 경로에 연결하지 않습니다.

- archive envelope, manifest, namespace, exact entry set, file size와 SHA-256 검증을 모두 마친 뒤에만 transaction root, lock, journal, stage를 생성합니다. callback 종료 시 ZIP과 payload buffer는 성공·실패와 관계없이 0으로 덮습니다.
- commit 단위는 owner 전체가 아니라 `ownerId + physical location`입니다. env override로 한 owner가 여러 volume에 나뉘어도 각 location은 자신의 target에서 가장 가까운 기존 ancestor 아래에 stage·backup workspace를 만들고 device id가 같은지 확인합니다.
- 모든 location을 먼저 stage하고 stage checksum을 manifest와 다시 비교합니다. commit 직전과 각 location 교체 직전에 활성 checksum을 다시 확인하므로 prepare 이후 변경은 `OWNER_RESTORE_TARGET_CHANGED`로 중단합니다.
- journal은 `0600` strict JSON이며 version, archive/transaction id, registry digest, namespace를 포함한 owner 계약, original/desired checksum, target-parent identity, per-location intent/state를 기록합니다. immutable plan 전체의 `planDigest`를 lock과 교차 확인해 checksum-valid journal의 target·anchor 재지정도 거부합니다. journal 갱신은 같은 directory의 temp file write, file `fsync`, rename, directory `fsync` 순서입니다.
- commit은 journal intent를 먼저 기록한 뒤 `active -> backup`, `stage -> active`, parent directory `fsync` 순서로 진행합니다. file target은 hard-link no-clobber로 게시하고 directory target은 같은 volume의 rename으로 교체합니다. backup은 게시 직후와 committed 정리 전에 original checksum을 다시 검증합니다.
- 일반 실패는 전체 location을 역순 rollback합니다. destructive rollback 전에 현재 target이 durable desired state인지, backup이 original checksum인지 먼저 확인하며 둘 중 하나라도 모호하면 target을 지우지 않고 evidence를 보존합니다.
- process crash를 모사한 실패는 journal·lock·stage·backup을 보존합니다. pending recovery는 현재 registry에서 target을 다시 계산해 journal과 정확히 일치할 때만 rollback하거나, durable `committed` 상태라면 desired checksum을 확인한 뒤 evidence만 정리합니다.
- journal 없이 lock만 남은 상태는 commit 전 crash와 journal 유실 뒤 partial commit을 구분할 수 없으므로 자동 삭제하지 않고 `OWNER_RESTORE_JOURNAL_MISSING_WITH_LOCK`로 fail-closed합니다. evidence 판정과 orphan 정리는 PR-D doctor·운영 절차가 필요합니다.
- rollback이 실패하면 `OWNER_RESTORE_ROLLBACK_INCOMPLETE`로 종료하고 journal과 backup evidence를 보존합니다. 동일 journal의 recovery를 다시 실행해 original checksum으로 수렴할 수 있습니다.
- manifest v1은 physical location의 missing과 empty directory를 구분하지 않습니다. PR-C의 고정 규칙은 directory location은 payload가 0개여도 빈 directory로 게시하고, file location은 대응 payload가 없으면 target file을 absent로 게시하는 것입니다. archive format v1 자체는 바꾸지 않습니다.
- native Windows, fixture boundary 밖 target, transaction root가 fixture root의 직접 자식이 아닌 경우는 fail-closed입니다. actual apply를 활성화할 수 있는 production API는 제공하지 않습니다.

fixture 검증은 accounts, batches, drafts, stable profiles/runs, news, shared indicators, unrelated data, explicit `PLANNING_DATA_DIR`, packaged XDG root, user A/B mismatch, cross-device 주입, mid-commit failure, crash recovery, rollback-incomplete, target/backup 동시 변경, no-clobber 게시, journal target·anchor 변조를 포함합니다. 실제 사용자 데이터나 `--apply` 경로는 호출하지 않습니다.

## 영향 계약

- public HTTP API·응답 shape: 변경 없음
- stored data: archive format v1과 owner 파일 schema는 변경하지 않습니다. fixture transaction 실행 중에만 별도 owner-external journal, lock, stage, backup artifact가 생기며 정상 commit/rollback 뒤 정리됩니다.
- DB query·cache·revalidation: 변경 없음
- migration: 변경 없음. legacy ZIP이나 runtime-key encrypted stable payload를 변환하지 않습니다.

## 구현 순서와 중단 조건

1. registry·manifest 계약 — PR-A 완료
2. 암호화된 archive writer와 strict preview reader — PR-B 구현, fixture·실험 단계
3. target과 같은 volume의 staging 및 durable journal rollback — PR-C fixture engine 구현, production 비연결
4. registry 기반 doctor와 제한적 apply 활성화

stable profile/run 개인정보가 추가되므로 평문 `v3:export`를 그대로 확장하지 않습니다. portable encrypted backup과 동일 runtime key 전용 disaster-recovery snapshot 중 제품·보안 정책이 정해지기 전에는 writer를 운영 기본값으로 만들지 않습니다.

Linux symlink alias·escape fixture는 PR-B에서 고정했습니다. 실제 Windows junction·reparse point fixture는 apply 활성화 전 필수 gate입니다.

다음 중 하나라도 충족하지 못하면 apply 차단을 유지합니다.

- exact namespace와 owner completeness 검증
- 모든 file·owner checksum 검증
- owner별 schema validator
- same-volume staging과 pending journal recovery
- injected failure 뒤 활성 데이터 checksum 불변
- rollback incomplete 시 evidence 보존
- offline/quiesced single-writer 보장
- 실제 Windows rename/locking 검증
