"""Extract plot outlines and data from the land-use DXF into data/plots.geojson (WGS84).

Usage: ~/.cache/vrtools-venv/bin/python -I tools/extract_plots.py "source/<file>.dxf" data/plots.geojson
Needs ezdxf, shapely, pyproj.
"""
import io, json, re, sys
from collections import Counter
import ezdxf
from ezdxf import recover, path
from pyproj import Transformer
from shapely.geometry import Point, Polygon, mapping
import numpy as np
import shapely
from shapely.ops import unary_union
from shapely.validation import make_valid

# VN-2000, Hà Nội zone: TM, central meridian 105°00', k=0.9999, 3° zone
VN2000_HANOI = ("+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 "
                "+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 "
                "+units=m +no_defs")
to_wgs84 = Transformer.from_crs(VN2000_HANOI, "EPSG:4326", always_xy=True).transform

GOOD, NEAR = 0.02, 0.10      # area tolerance: matched / approximate
LABEL_BLOCK = "dfsfds"       # plot label block: 01 code, 02 area ha, 03 floors, 04 density %, 05 FAR


def load(fn):
    # LibreDWG writes some truncated \U+XXXX escapes that ezdxf rejects
    raw = open(fn, "rb").read()
    raw = re.sub(rb"\\U\+(?![0-9A-Fa-f]{4})[0-9A-Fa-f]{0,3}", b"?", raw)
    doc, _ = recover.read(io.BytesIO(raw))
    return doc.modelspace()


def poly(pts):
    if len(pts) < 3:
        return None
    p = Polygon(pts)
    if not p.is_valid:
        p = make_valid(p).buffer(0)
    return p if p.area > 50 else None


def landuse_shapes(msp):
    out = []
    for h in msp.query("HATCH"):
        if not h.dxf.layer.startswith("__C_"):
            continue
        for bp in h.paths.rendering_paths(h.dxf.hatch_style):
            try:
                p = poly([(v.x, v.y) for v in path.from_hatch_boundary_path(bp).flattening(0.2)])
            except Exception:
                continue
            if p:
                out.append((h.dxf.layer, p))
    for e in msp.query("LWPOLYLINE POLYLINE"):
        if e.is_closed and e.dxf.layer.startswith("__C_"):
            p = poly([(v.x, v.y) for v in path.make_path(e).flattening(0.2)])
            if p:
                out.append((e.dxf.layer, p))
    return out


def num(s):
    try:
        return float(s.replace(",", "."))
    except (AttributeError, ValueError):
        return None


def match(pt, ha, shapes):
    """Best outline for a label: containing shape, then nearby shape, then merged pieces."""
    err = lambda g: abs(g.area / 1e4 - ha) / ha
    inside = [s for s in shapes if s[1].contains(pt)]
    if inside:
        layer, g = min(inside, key=lambda s: err(s[1]))
        if err(g) <= NEAR:
            return layer, g, "inside"
    near = [s for s in shapes if s[1].distance(pt) < 250 and err(s[1]) <= 0.03]
    if near:
        layer, g = min(near, key=lambda s: s[1].distance(pt))
        return layer, g, f"label {g.distance(pt):.0f} m outside"
    best = None
    for layer, g0 in inside:
        g = unary_union([g for l, g in shapes if l == layer and g.distance(g0) < 1])
        if best is None or err(g) < err(best[1]):
            best = (layer, g, "pieces merged")
    if best and err(best[1]) <= 0.03:
        return best
    return None


def main(src, dst):
    msp = load(src)
    shapes = landuse_shapes(msp)
    labels = list(msp.query(f'INSERT[name=="{LABEL_BLOCK}"]'))
    dup = {c for c, n in Counter(a.dxf.text for i in labels for a in i.attribs if a.dxf.tag == "01").items() if n > 1}
    feats = []
    for ins in labels:
        a = {t.dxf.tag: t.dxf.text.strip() for t in ins.attribs}
        code, ha = a.get("01"), num(a.get("02"))
        pt = Point(ins.dxf.insert.x, ins.dxf.insert.y)
        m = match(pt, ha, shapes) if ha else None
        props = {"code": code, "area_ha": ha, "floors": a.get("03"), "density_pct": num(a.get("04")),
                 "far": num(a.get("05")), "duplicate_code": code in dup}
        if m:
            layer, g, how = m
            e = abs(g.area / 1e4 - ha) / ha
            props.update(landuse=layer.strip("_ ").split("_", 2)[-1].strip("_ "), layer=layer,
                         outline_ha=round(g.area / 1e4, 4), area_diff_pct=round(e * 100, 2),
                         status="matched" if e <= GOOD else "approx", how=how)
        else:
            g = pt
            props.update(status="unmatched", how="label point only; outline needs manual fix")
        feats.append({"type": "Feature", "properties": props,
                      "geometry": mapping(shapely.transform(g, lambda c: np.column_stack(to_wgs84(c[:, 0], c[:, 1]))))})
    fc = {"type": "FeatureCollection",
          "source": src.rsplit("/", 1)[-1],
          "crs_note": "converted from VN-2000 Hà Nội zone (CM 105°00') to WGS84",
          "features": feats}
    txt = json.dumps(fc, ensure_ascii=False)
    txt = re.sub(r"(\d+\.\d{7})\d+", r"\1", txt)   # ~1 cm precision
    open(dst, "w").write(txt)
    print(f"{len(feats)} plots ->", dst, dict(Counter(f["properties"]["status"] for f in feats)))


if __name__ == "__main__":
    main(*sys.argv[1:3])
