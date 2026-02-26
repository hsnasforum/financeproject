#!/usr/bin/env python3
import argparse
import datetime as dt
import io
import json
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Optional

DEFAULT_BASE_URL = "https://opendart.fss.or.kr"
DEFAULT_OUT_PATH = Path("tmp/dart/corpCodes.index.json")


def require_api_key() -> str:
    api_key = os.environ.get("OPENDART_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENDART_API_KEY is required")
    return api_key


def resolve_base_url() -> str:
    raw = os.environ.get("OPENDART_BASE_URL", DEFAULT_BASE_URL).strip()
    if not raw:
        raw = DEFAULT_BASE_URL
    return raw.rstrip("/")


def resolve_output_path(cli_out: Optional[str]) -> Path:
    if cli_out and cli_out.strip():
        return Path(cli_out.strip())

    env_out = os.environ.get("DART_CORPCODES_INDEX_PATH", "").strip()
    if env_out:
        return Path(env_out)

    return DEFAULT_OUT_PATH


def fetch_corpcode_zip(base_url: str, api_key: str) -> bytes:
    query = urllib.parse.urlencode({"crtfc_key": api_key})
    url = f"{base_url}/api/corpCode.xml?{query}"
    request = urllib.request.Request(url, method="GET")

    with urllib.request.urlopen(request, timeout=30) as response:
        status = getattr(response, "status", 200)
        body = response.read()

    if status != 200:
        raise RuntimeError(f"OpenDART HTTP status {status}")
    if not body:
        raise RuntimeError("OpenDART returned empty body")
    return body


def extract_xml(zip_bytes: bytes) -> bytes:
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            xml_name = next((name for name in archive.namelist() if name.lower().endswith(".xml")), None)
            if not xml_name:
                raise RuntimeError("corpCode ZIP does not contain XML")
            return archive.read(xml_name)
    except zipfile.BadZipFile as exc:
        raise RuntimeError("Invalid ZIP from OpenDART") from exc


def parse_items(xml_bytes: bytes) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise RuntimeError("Failed to parse corpCode XML") from exc

    items: list[dict[str, str]] = []
    for node in root.findall("list"):
        corp_code = (node.findtext("corp_code") or "").strip()
        corp_name = (node.findtext("corp_name") or "").strip()
        stock_code = (node.findtext("stock_code") or "").strip()
        modify_date = (node.findtext("modify_date") or "").strip()

        if not corp_code or not corp_name:
            continue

        item: dict[str, str] = {
            "corpCode": corp_code,
            "corpName": corp_name,
        }
        if stock_code:
            item["stockCode"] = stock_code
        if modify_date:
            item["modifyDate"] = modify_date
        items.append(item)

    if not items:
        raise RuntimeError("No corpCode items found in XML")
    return items


def write_output(out_path: Path, items: list[dict[str, str]]) -> None:
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {
        "version": 1,
        "generatedAt": generated_at,
        "count": len(items),
        "items": items,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build OpenDART corp code index JSON")
    parser.add_argument("--out", dest="out", help="output path")
    args = parser.parse_args()

    try:
        api_key = require_api_key()
        base_url = resolve_base_url()
        out_path = resolve_output_path(args.out)

        zip_bytes = fetch_corpcode_zip(base_url, api_key)
        xml_bytes = extract_xml(zip_bytes)
        items = parse_items(xml_bytes)
        write_output(out_path, items)

        print(f"OK {out_path}")
        print(f"COUNT {len(items)}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
