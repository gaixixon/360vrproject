"""Build data/massing.geojson for the conceptual 3D view from data/plots.geojson and the DXF.

Usage: ~/.cache/vrtools-venv/bin/python -I tools/build_massing.py "source/<file>.dxf" data/plots.geojson data/massing.geojson

- mass: one block per plot with a floors limit, the plot outline shrunk evenly until it covers
  density_pct of the plot (the maximum site coverage). Heights are set in the viewer (floors x storey height).
- ground: the plots merged, with the road gaps between them closed (the DXF has no closed project boundary).
- road: road centre lines from the `_Plan road_Center` layer, clipped to the ground.
"""
import json, re, sys
from pathlib import Path
import numpy as np
import shapely
from ezdxf import path
from pyproj import Transformer
from shapely.geometry import LineString, mapping, shape
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).parent))
from extract_plots import VN2000_HANOI, load  # noqa: E402

to_wgs84 = Transformer.from_crs(VN2000_HANOI, "EPSG:4326", always_xy=True).transform
to_vn = Transformer.from_crs("EPSG:4326", VN2000_HANOI, always_xy=True).transform
CLOSE_M = 45        # closes road gaps up to ~90 m wide when building the ground
ROAD_LAYER = "_Plan road_Center"


def reproject(g, fn):
    return shapely.transform(g, lambda c: np.column_stack(fn(c[:, 0], c[:, 1])))


def floors(s):
    n = [int(x) for x in re.findall(r"\d+", s or "")]
    return max(n) if n else None


def inset(g, ratio):
    """Shrink g evenly until its area is ratio x the original (bisection on the inward offset)."""
    target, lo, hi = g.area * ratio, 0.0, 200.0
    for _ in range(40):
        mid = (lo + hi) / 2
        a = g.buffer(-mid, join_style="mitre").area
        lo, hi = (mid, hi) if a > target else (lo, mid)
    return g.buffer(-lo, join_style="mitre").simplify(0.3), lo


def main(dxf, src, dst):
    plots = json.load(open(src))["features"]
    feats, polys = [], []
    for f in plots:
        p = f["properties"]
        if f["geometry"]["type"] == "Point":
            continue
        g = reproject(shape(f["geometry"]), to_vn)
        polys.append(g)
        fl, cov = floors(p.get("floors")), p.get("density_pct")
        if not fl or not cov:
            continue
        m, setback = inset(g, cov / 100)
        if m.is_empty:
            continue
        feats.append({"type": "Feature", "properties": {
            "kind": "mass", "code": p["code"], "floors": fl, "coverage_pct": round(100 * m.area / g.area, 1),
            "setback_m": round(setback, 1)}, "geometry": m})
    sites = unary_union(polys).buffer(CLOSE_M, join_style="mitre").buffer(-CLOSE_M, join_style="mitre")
    ground = unary_union([sites, *polys]).simplify(0.5)
    feats.append({"type": "Feature", "properties": {"kind": "ground"}, "geometry": ground})
    msp = load(dxf)
    lines = []
    for e in msp.query(f'LINE LWPOLYLINE POLYLINE ARC[layer=="{ROAD_LAYER}"]'):
        pts = [(v.x, v.y) for v in path.make_path(e).flattening(0.5)]
        if len(pts) > 1:
            lines.append(LineString(pts))
    roads = unary_union(lines).intersection(ground.buffer(5)).simplify(0.5)
    feats.append({"type": "Feature", "properties": {"kind": "road"}, "geometry": roads})
    for f in feats:
        f["geometry"] = mapping(reproject(f["geometry"], to_wgs84))
    txt = json.dumps({"type": "FeatureCollection",
                      "note": "Conceptual massing: max site coverage and floors per plot, not actual buildings",
                      "features": feats}, ensure_ascii=False)
    txt = re.sub(r"(\d+\.\d{7})\d+", r"\1", txt)
    open(dst, "w").write(txt)
    masses = [f["properties"] for f in feats if f["properties"]["kind"] == "mass"]
    print(f"{len(masses)} blocks, ground {ground.area / 1e4:.0f} ha, {len(lines)} road lines -> {dst}")
    for p in masses:
        print(f"  {p['code']:12} {p['floors']} fl  {p['coverage_pct']:5}%  setback {p['setback_m']} m")


if __name__ == "__main__":
    main(*sys.argv[1:4])
