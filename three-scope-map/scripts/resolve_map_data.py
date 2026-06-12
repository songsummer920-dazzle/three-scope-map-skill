#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Validate or fetch map GeoJSON for drillable 3D dashboard maps.

Attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable


SCOPES = ("world", "country", "province", "city", "district")


ADCODE_BY_REGION = {
    "中国": "100000",
    "全国": "100000",
    "china": "100000",
    "世界": "world",
    "全球": "world",
    "world": "world",
    "北京": "110000",
    "北京市": "110000",
    "天津": "120000",
    "天津市": "120000",
    "河北": "130000",
    "河北省": "130000",
    "山西": "140000",
    "山西省": "140000",
    "内蒙古": "150000",
    "内蒙古自治区": "150000",
    "辽宁": "210000",
    "辽宁省": "210000",
    "吉林": "220000",
    "吉林省": "220000",
    "黑龙江": "230000",
    "黑龙江省": "230000",
    "上海": "310000",
    "上海市": "310000",
    "江苏": "320000",
    "江苏省": "320000",
    "浙江": "330000",
    "浙江省": "330000",
    "安徽": "340000",
    "安徽省": "340000",
    "福建": "350000",
    "福建省": "350000",
    "江西": "360000",
    "江西省": "360000",
    "山东": "370000",
    "山东省": "370000",
    "河南": "410000",
    "河南省": "410000",
    "湖北": "420000",
    "湖北省": "420000",
    "湖南": "430000",
    "湖南省": "430000",
    "广东": "440000",
    "广东省": "440000",
    "广西": "450000",
    "广西壮族自治区": "450000",
    "海南": "460000",
    "海南省": "460000",
    "重庆": "500000",
    "重庆市": "500000",
    "四川": "510000",
    "四川省": "510000",
    "贵州": "520000",
    "贵州省": "520000",
    "云南": "530000",
    "云南省": "530000",
    "西藏": "540000",
    "西藏自治区": "540000",
    "陕西": "610000",
    "陕西省": "610000",
    "甘肃": "620000",
    "甘肃省": "620000",
    "青海": "630000",
    "青海省": "630000",
    "宁夏": "640000",
    "宁夏回族自治区": "640000",
    "新疆": "650000",
    "新疆维吾尔自治区": "650000",
    "台湾": "710000",
    "台湾省": "710000",
    "香港": "810000",
    "香港特别行政区": "810000",
    "澳门": "820000",
    "澳门特别行政区": "820000",
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("GeoJSON root must be an object")
    return data


def iter_positions(geometry: dict[str, Any]) -> Iterable[tuple[float, float]]:
    def walk(value: Any) -> Iterable[tuple[float, float]]:
        if (
            isinstance(value, list)
            and len(value) >= 2
            and isinstance(value[0], (int, float))
            and isinstance(value[1], (int, float))
        ):
            yield float(value[0]), float(value[1])
        elif isinstance(value, list):
            for item in value:
                yield from walk(item)

    yield from walk(geometry.get("coordinates"))


def summarize(data: dict[str, Any], expected_scope: str | None = None) -> dict[str, Any]:
    if data.get("type") != "FeatureCollection":
        raise ValueError("Expected GeoJSON FeatureCollection")

    features = data.get("features")
    if not isinstance(features, list) or not features:
        raise ValueError("FeatureCollection must contain features")

    name_keys: set[str] = set()
    code_keys: set[str] = set()
    levels: set[str] = set()
    names: list[str] = []
    codes: list[str] = []
    xs: list[float] = []
    ys: list[float] = []
    geometry_types: dict[str, int] = {}

    for feature in features:
      if not isinstance(feature, dict):
          continue
      props = feature.get("properties") or {}
      if isinstance(props, dict):
          for key in ("name", "fullname", "adcode", "code", "level", "filename", "ISO_A3", "ADMIN", "NAME", "name_en"):
              if key in props:
                  name_keys.add(key)
          for key in ("adcode", "code", "gb", "id", "ISO_A3", "ISO_A2", "ADM0_A3"):
              if props.get(key) is not None:
                  code_keys.add(key)
                  codes.append(str(props.get(key)))
          name = (
              props.get("fullname")
              or props.get("name")
              or props.get("ADMIN")
              or props.get("NAME")
              or props.get("name_en")
              or props.get("ISO_A3")
              or props.get("adcode")
              or props.get("code")
          )
          if name is not None:
              names.append(str(name))
          if props.get("level") is not None:
              levels.add(str(props.get("level")))
      geometry = feature.get("geometry") or {}
      geometry_type = str(geometry.get("type") or "unknown")
      geometry_types[geometry_type] = geometry_types.get(geometry_type, 0) + 1
      for x, y in iter_positions(geometry):
          xs.append(x)
          ys.append(y)

    if not xs or not ys:
        raise ValueError("No coordinates found")

    feature_count = len(features)
    world_like = feature_count >= 120 and (max(xs) - min(xs) > 250) and (max(ys) - min(ys) > 100)
    country_like = feature_count >= 20 and any(name.endswith(("省", "市", "自治区", "特别行政区")) for name in names)
    province_like = feature_count <= 40 and any(name.endswith(("市", "地区", "自治州", "盟")) for name in names)
    city_like = feature_count <= 80 and any(
        name.endswith(("区", "县", "市", "自治县", "旗", "自治旗", "林区", "特区")) for name in names
    )
    district_like = feature_count <= 3

    if expected_scope == "district" and district_like:
        subdivision_hint = "district-boundary"
    elif world_like:
        subdivision_hint = "world-country"
    elif country_like:
        subdivision_hint = "country-province"
    elif city_like and not (expected_scope == "province" and province_like):
        subdivision_hint = "city-district"
    elif province_like:
        subdivision_hint = "province-city"
    elif district_like:
        subdivision_hint = "district-boundary"
    else:
        subdivision_hint = "unknown"

    warnings: list[str] = []
    if expected_scope == "country" and not country_like:
        warnings.append("Expected country scope with province-level features; feature names/count do not clearly match.")
    if expected_scope == "province" and not province_like:
        warnings.append("Expected province scope with city/prefecture-level features; feature names/count do not clearly match.")
    if expected_scope == "city" and not city_like:
        warnings.append("Expected city scope with district/county-level features; feature names/count do not clearly match.")
    if expected_scope == "district" and not district_like:
        warnings.append("Expected district scope. If this is a terminal boundary, verify whether the source exposes lower-level features.")
    if expected_scope == "world" and not world_like:
        warnings.append("Expected world scope with country-level features and global lon/lat extent; data does not clearly match.")
    if expected_scope != "world" and (min(xs) < 70 or max(xs) > 140 or min(ys) < 0 or max(ys) > 60):
        warnings.append("Bounding box is outside common China lon/lat ranges; verify projection and data source.")

    return {
        "type": data.get("type"),
        "featureCount": feature_count,
        "geometryTypes": geometry_types,
        "nameKeys": sorted(name_keys),
        "codeKeys": sorted(code_keys),
        "levels": sorted(levels),
        "sampleNames": names[:12],
        "sampleCodes": codes[:12],
        "bbox": [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
        "subdivisionHint": subdivision_hint,
        "drilldownKeyHint": "Use feature.properties.adcode/code/id/ISO_A3 when present; keep a manual region registry for world country -> national datasets.",
        "expectedScope": expected_scope,
        "warnings": warnings,
    }


def datav_url(adcode: str, scope: str, *, full: bool = True) -> str:
    suffix = "_full" if full and scope != "world" else ""
    return f"https://geo.datav.aliyun.com/areas_v3/bound/{adcode}{suffix}.json"


def datav_candidate_urls(adcode: str, scope: str) -> list[str]:
    if scope == "world":
        return [datav_url(adcode, scope, full=False)]
    if scope == "district":
        return [datav_url(adcode, scope, full=True), datav_url(adcode, scope, full=False)]
    return [datav_url(adcode, scope, full=True)]


def default_url(region: str, scope: str) -> str:
    if scope == "world":
        return "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    adcode = ADCODE_BY_REGION.get(region.strip())
    if not adcode:
        known = ", ".join(sorted(k for k in ADCODE_BY_REGION if len(k) <= 4)[:20])
        raise SystemExit(f"Unknown region {region!r}. Provide --url or use a known region. Examples: {known}")
    if adcode == "world":
        return "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    return datav_candidate_urls(adcode, scope)[0]


def download(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "codex-map-data-resolver/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Download failed: {exc}") from exc
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("Downloaded payload is not a GeoJSON object")
    return data


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", help="Region name, e.g. 中国, 世界, 浙江省, 江苏省")
    parser.add_argument("--adcode", help="Administrative code for drilldown downloads, e.g. 100000, 330000, 330100, 330106")
    parser.add_argument("--scope", choices=list(SCOPES), help="Expected map scope")
    parser.add_argument("--validate", type=Path, help="Validate an existing GeoJSON file")
    parser.add_argument("--download", action="store_true", help="Download candidate GeoJSON from a public boundary source")
    parser.add_argument("--out", type=Path, help="Output path when downloading")
    parser.add_argument("--url", help="Override source URL when downloading")
    args = parser.parse_args()

    if args.validate:
        data = load_json(args.validate)
        report = summarize(data, args.scope)
        report["source"] = str(args.validate)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if not report["warnings"] else 1

    if args.download:
        if not args.out:
            parser.error("--download requires --out")
        if args.url:
            urls = [args.url]
        elif args.adcode:
            if not args.scope:
                parser.error("--download with --adcode requires --scope")
            urls = datav_candidate_urls(args.adcode, args.scope)
        else:
            if not args.region or not args.scope:
                parser.error("--download requires --region and --scope when --url or --adcode is not provided")
            urls = [default_url(args.region, args.scope)]
        data = None
        last_error: RuntimeError | None = None
        source_url = urls[0]
        for url in urls:
            try:
                data = download(url)
                source_url = url
                break
            except RuntimeError as exc:
                last_error = exc
        if data is None:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "source": urls,
                        "error": str(last_error),
                        "nextStep": "Enable network access, provide --url from an accessible source, or validate a local GeoJSON with --validate.",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                file=sys.stderr,
            )
            return 1
        report = summarize(data, args.scope)
        report["source"] = source_url
        report["output"] = str(args.out)
        if report["warnings"]:
            print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
            raise SystemExit("Downloaded data did not pass scope checks; inspect warnings before using it.")
        write_json(args.out, data)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    parser.error("Use --validate or --download")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
