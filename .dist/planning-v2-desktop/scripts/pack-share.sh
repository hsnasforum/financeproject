#!/usr/bin/env bash
set -euo pipefail

MODE="changes"
TITLE=""
DRY_RUN="0"

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    -t|--title)
      TITLE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --)
      shift
      ARGS+=("$@")
      break
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$MODE" != "changes" && "$MODE" != "paths" && "$MODE" != "min" ]]; then
  echo "지원하지 않는 --mode 입니다: $MODE (changes|paths|min)"
  exit 1
fi

OUT_DIR="out"
mkdir -p "$OUT_DIR"

if command -v mktemp >/dev/null 2>&1; then
  STAGE_DIR="$(mktemp -d)"
else
  STAGE_DIR="${OUT_DIR}/_stage_$$"
  mkdir -p "$STAGE_DIR"
fi
META_DIR="${STAGE_DIR}/__meta"
mkdir -p "$META_DIR"

cleanup_stage() {
  if [[ -d "$STAGE_DIR" ]]; then
    rm -rf "$STAGE_DIR"
  fi
}

is_excluded() {
  local p="$1"
  [[ "$p" == .env* ]] && return 0
  [[ "$p" == */.env* ]] && return 0
  [[ "$p" == node_modules/* || "$p" == */node_modules/* ]] && return 0
  [[ "$p" == .next/* || "$p" == */.next/* ]] && return 0
  [[ "$p" == out/* || "$p" == */out/* ]] && return 0
  [[ "$p" == .git/* || "$p" == */.git/* ]] && return 0
  [[ "$p" == *.db || "$p" == *.log ]] && return 0
  return 1
}

CONTEXT_CANDIDATES=(
  "package.json"
  "pnpm-lock.yaml"
  "package-lock.json"
  "yarn.lock"
  "tsconfig.json"
  "next.config.js"
  "next.config.mjs"
  "next.config.ts"
  "src/app/layout.tsx"
)

FILES=()
DELETED=()
MANIFEST_LINES=()

git_ok() {
  command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

add_file_entry() {
  local tag="$1"
  local path="$2"
  [[ -z "$path" ]] && return 0
  is_excluded "$path" && return 0
  FILES+=("$path")
  MANIFEST_LINES+=("$tag  $path")
}

add_context_files() {
  local c
  for c in "${CONTEXT_CANDIDATES[@]}"; do
    if [[ -e "$c" ]] && ! is_excluded "$c"; then
      add_file_entry "C" "$c"
    fi
  done
}

collect_changes() {
  local st line x y path
  st="$(git status --porcelain -uall || true)"

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    x="${line:0:1}"
    y="${line:1:1}"
    path="${line:3}"

    if [[ "$path" == *" -> "* ]]; then
      path="${path##* -> }"
    fi

    [[ -z "$path" ]] && continue
    is_excluded "$path" && continue

    if [[ "$x" == "D" || "$y" == "D" ]]; then
      DELETED+=("$path")
      MANIFEST_LINES+=("D  $path")
      continue
    fi

    if [[ "$x" == "?" && "$y" == "?" ]]; then
      add_file_entry "A" "$path"
      continue
    fi

    if [[ "$x" != " " || "$y" != " " ]]; then
      if [[ "$x" == "A" || "$y" == "A" ]]; then
        add_file_entry "A" "$path"
      else
        add_file_entry "M" "$path"
      fi
    fi
  done <<< "$st"
}

collect_paths() {
  local p
  for p in "${ARGS[@]}"; do
    [[ -e "$p" ]] || continue
    if [[ -d "$p" ]]; then
      while IFS= read -r f; do
        is_excluded "$f" && continue
        add_file_entry "P" "$f"
      done < <(find "$p" -type f)
    elif [[ -f "$p" ]]; then
      add_file_entry "P" "$p"
    fi
  done
}

collect_min() {
  add_context_files
}

if [[ "$MODE" == "changes" ]]; then
  if git_ok; then
    collect_changes
    add_context_files
  else
    MODE="paths"
  fi
fi

if [[ "$MODE" == "paths" ]]; then
  if [[ ${#ARGS[@]} -eq 0 ]]; then
    collect_min
  else
    collect_paths
    add_context_files
  fi
fi

if [[ "$MODE" == "min" ]]; then
  collect_min
fi

if [[ ${#FILES[@]} -gt 0 ]]; then
  mapfile -t FILES < <(printf '%s\n' "${FILES[@]}" | awk 'NF{print}' | sort -u)
fi
if [[ ${#MANIFEST_LINES[@]} -gt 0 ]]; then
  mapfile -t MANIFEST_LINES < <(printf '%s\n' "${MANIFEST_LINES[@]}" | awk 'NF{print}' | sort -u)
fi
if [[ ${#DELETED[@]} -gt 0 ]]; then
  mapfile -t DELETED < <(printf '%s\n' "${DELETED[@]}" | awk 'NF{print}' | sort -u)
fi

if [[ ${#FILES[@]} -eq 0 && ${#DELETED[@]} -eq 0 ]]; then
  echo "포함할 변경/파일이 없습니다."
  echo "힌트: --mode paths <경로들> 또는 git 변경을 만든 뒤 다시 실행하세요."
  cleanup_stage
  exit 1
fi

{
  echo "mode: $MODE"
  echo "generated_at: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "title: ${TITLE:-"(auto)"}"
  echo
  echo "[files]"
  if [[ ${#MANIFEST_LINES[@]} -gt 0 ]]; then
    printf '%s\n' "${MANIFEST_LINES[@]}"
  fi
  if [[ ${#DELETED[@]} -gt 0 ]]; then
    echo
    echo "[deleted_only]"
    printf 'D  %s\n' "${DELETED[@]}"
  fi
} > "${META_DIR}/manifest.txt"

if git_ok; then
  {
    echo "### git diff (unstaged)"
    git diff || true
    echo
    echo "### git diff --cached (staged)"
    git diff --cached || true
  } > "${META_DIR}/changes.patch"
fi

{
  echo "command: scripts/pack-share.sh"
  echo "mode: $MODE"
  echo "title: ${TITLE:-"(auto)"}"
  echo "dry_run: $DRY_RUN"
  echo "args: ${ARGS[*]:-(none)}"
} > "${META_DIR}/notes.txt"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY RUN - include files:"
  if [[ ${#FILES[@]} -gt 0 ]]; then
    printf ' - %s\n' "${FILES[@]}"
  fi
  if [[ ${#DELETED[@]} -gt 0 ]]; then
    echo "삭제된 파일(manifest only):"
    printf ' - %s\n' "${DELETED[@]}"
  fi
  echo "meta: __meta/manifest.txt"
  [[ -f "${META_DIR}/changes.patch" ]] && echo "meta: __meta/changes.patch"
  cleanup_stage
  exit 0
fi

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  mkdir -p "${STAGE_DIR}/$(dirname "$f")"
  cp -f "$f" "${STAGE_DIR}/$f"
done

slug_from_title() {
  node -e '
    const s = (process.argv[1] || "").trim();
    const normalized = s
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_-]+/gu, "");
    const out = [...normalized].slice(0, 10).join("") || "update";
    console.log(out);
  ' "$TITLE"
}

slug_auto() {
  local joined first base
  joined="$(printf '%s\n' "${FILES[@]}" | tr '\n' ' ')"

  if [[ "$joined" == *"src/app/api/finlife"* || "$joined" == *"src/lib/finlife"* ]]; then echo "finlife"; return; fi
  if [[ "$joined" == *"/help/"* || "$joined" == *"Help"* || "$joined" == *"help"* ]]; then echo "help"; return; fi
  if [[ "$joined" == *"/recommend/"* || "$joined" == *"Recommend"* || "$joined" == *"recommend"* ]]; then echo "recommend"; return; fi
  if [[ "$joined" == *"/planning/"* || "$joined" == *"Planner"* || "$joined" == *"planner"* ]]; then echo "planner"; return; fi
  if [[ "$joined" == *"/products/"* ]]; then echo "products"; return; fi

  first="${FILES[0]:-update}"
  base="$(basename "$first")"
  base="${base%.*}"
  node -e 'const s = process.argv[1] || "update"; console.log(([...s].slice(0, 10).join("") || "update"));' "$base"
}

SLUG="update"
if [[ -n "$TITLE" ]]; then
  SLUG="$(slug_from_title)"
else
  SLUG="$(slug_auto)"
fi

TS="$(date '+%Y%m%d-%H%M%S')"
ARCHIVE_BASE="${OUT_DIR}/share_${SLUG}_${TS}"

if command -v zip >/dev/null 2>&1; then
  (
    cd "$STAGE_DIR"
    zip -rq "${OLDPWD}/${ARCHIVE_BASE}.zip" . -x ".env*" "node_modules/*" ".next/*" "out/*" ".git/*" "*.db" "*.log"
  )
  cleanup_stage
  echo "OK: ${ARCHIVE_BASE}.zip"
  exit 0
fi

if command -v tar >/dev/null 2>&1; then
  (
    cd "$STAGE_DIR"
    tar -czf "${OLDPWD}/${ARCHIVE_BASE}.tar.gz" --exclude=".env*" --exclude="node_modules" --exclude=".next" --exclude="out" --exclude=".git" --exclude="*.db" --exclude="*.log" .
  )
  cleanup_stage
  echo "OK: ${ARCHIVE_BASE}.tar.gz"
  exit 0
fi

FINAL_DIR="${ARCHIVE_BASE}_dir"
rm -rf "$FINAL_DIR"
mv "$STAGE_DIR" "$FINAL_DIR"

echo "zip/tar가 없어 디렉토리로 남겼습니다: $FINAL_DIR"
echo "이 폴더를 수동으로 압축해서 전달하세요(.env*, node_modules, .next, out, .git, *.db, *.log 제외)."
