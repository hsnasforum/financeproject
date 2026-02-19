#!/usr/bin/env python3
import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
DEFAULT_OUT_PATH = ROOT / "tmp" / "dart" / "corpCodes.index.json"
SAMPLE_DIR = ROOT / "tmp" / "api-samples" / "opendart"
DEFAULT_OPENDART_BASE_URL = "https://opendart.fss.or.kr"


def load_env_local(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        key, val = s.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def require_api_key() -> str:
    load_env_local(ENV_PATH)
    key = os.environ.get("OPENDART_API_KEY", "").strip()
    if not key:
        print("ERROR: OPENDART_API_KEY 설정이 필요합니다.", file=sys.stderr)
        sys.exit(2)
    return key


def resolve_output_path(cli_out: Optional[str]) -> Path:
    if cli_out and cli_out.strip():
        return Path(cli_out.strip()).expanduser().resolve()

    env_out = os.environ.get("DART_CORPCODES_INDEX_PATH", "").strip()
    if env_out:
        return Path(env_out).expanduser().resolve()

    return DEFAULT_OUT_PATH


def resolve_base_url() -> str:
    raw = os.environ.get("OPENDART_BASE_URL", DEFAULT_OPENDART_BASE_URL).strip()
    return raw.rstrip("/")


def download_zip(api_key: str) -> bytes:
    corp_code_url = f"{resolve_base_url()}/api/corpCode.xml"
    query = urllib.parse.urlencode({"crtfc_key": api_key})
    url = f"{corp_code_url}?{query}"
    req = urllib.request.Request(url, method="GET")

    print("Downloading OpenDART corpCode ZIP...")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = getattr(resp, "status", 200)
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
    except Exception as exc:
        print(f"ERROR: OpenDART 호출 실패: {exc}", file=sys.stderr)
        sys.exit(3)

    if status != 200:
        print(f"ERROR: OpenDART HTTP status={status}", file=sys.stderr)
        sys.exit(3)

    if len(data) < 100:
        print(f"ERROR: corpCode 응답 크기 비정상 ({len(data)} bytes, content-type={content_type})", file=sys.stderr)
        sys.exit(3)

    return data


def save_zip_sample(zip_bytes: bytes) -> Path:
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = SAMPLE_DIR / f"corpCode-{ts}.zip"
    zip_path.write_bytes(zip_bytes)
    return zip_path


def normalize_name(name: str) -> str:
    lowered = name.lower().strip()
    no_space = "".join(lowered.split())
    return re.sub(r"[()·.,_-]", "", no_space)


def parse_items(zip_bytes: bytes, zip_path: Path):
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            xml_name = next((name for name in names if name.lower().endswith(".xml")), None)
            if not xml_name:
                print(f"ERROR: ZIP 안에 XML 파일이 없습니다. sample={zip_path}", file=sys.stderr)
                sys.exit(4)
            xml_data = zf.read(xml_name)
    except zipfile.BadZipFile:
        print(f"ERROR: ZIP 파싱 실패. sample={zip_path}", file=sys.stderr)
        sys.exit(4)

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as exc:
        xml_sample = zip_path.with_suffix(".xml.sample")
        xml_sample.write_bytes(xml_data[:4096])
        print(f"ERROR: XML 파싱 실패 ({exc}). sample={xml_sample}", file=sys.stderr)
        sys.exit(4)

    items = []
    for node in root.findall("list"):
        corp_code = (node.findtext("corp_code") or "").strip()
        corp_name = (node.findtext("corp_name") or "").strip()
        corp_eng_name = (node.findtext("corp_eng_name") or "").strip()
        stock_code = (node.findtext("stock_code") or "").strip()
        modify_date = (node.findtext("modify_date") or "").strip()

        if not corp_code or not corp_name:
            continue

        item = {
            "corpCode": corp_code,
            "corpName": corp_name,
            "normName": normalize_name(corp_name),
        }
        if corp_eng_name:
            item["corpEngName"] = corp_eng_name
        if stock_code:
            item["stockCode"] = stock_code
        if modify_date:
            item["modifyDate"] = modify_date
        items.append(item)

    if not items:
        print(f"ERROR: XML에서 corp_code 항목을 찾지 못했습니다. sample={zip_path}", file=sys.stderr)
        sys.exit(4)

    return items


def main() -> None:
    parser = argparse.ArgumentParser(description="Build OpenDART corp code index JSON")
    parser.add_argument("--out", dest="out", help="output path for corp code index json")
    args = parser.parse_args()

    load_env_local(ENV_PATH)
    api_key = require_api_key()
    _ = "*" * min(4, len(api_key))
    out_path = resolve_output_path(args.out)

    zip_bytes = download_zip(api_key)
    zip_path = save_zip_sample(zip_bytes)
    items = parse_items(zip_bytes, zip_path)

    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "generatedAt": generated_at,
        "count": len(items),
        "items": items,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print("Done")
    print(f"Output: {out_path.relative_to(ROOT) if out_path.is_relative_to(ROOT) else out_path}")
    print(f"Sample ZIP: {zip_path}")
    print(f"Count: {len(items)}")
    print(f"GeneratedAt: {generated_at}")
    if "src/" in out_path.as_posix() or out_path.as_posix().endswith("/src"):
        print("WARN: src/** 경로 출력은 배포 번들/파일 트레이싱 정책에 따라 포함/접근 이슈가 있을 수 있습니다.")


if __name__ == "__main__":
    main()
