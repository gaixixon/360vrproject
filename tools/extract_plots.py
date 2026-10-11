"""Extract plot outlines and data from the land-use DXF into data/plots.geojson (WGS84).

Usage: ~/.cache/vrtools-venv/bin/python -I tools/extract_plots.py "source/<file>.dxf" data/plots.geojson
Needs ezdxf, shapely, pyproj.
"""
import io, json, re, sys
from collections import Counter
import ezdxf
from ezdxf import recover, path
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, mapping
import numpy as np
import shapely
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

# VN-2000, Hà Nội zone: TM, central meridian 105°00', k=0.9999, 3° zone
VN2000_HANOI = ("+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 "
                "+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 "
                "+units=m +no_defs")
to_wgs84 = Transformer.from_crs(VN2000_HANOI, "EPSG:4326", always_xy=True).transform

GOOD, NEAR = 0.02, 0.10      # area tolerance: matched / approximate
OUTSIDE_M = 200              # labels this far from any land-use shape are legend samples, not plots
LABEL_BLOCK = "dfsfds"       # plot label block: 01 code, 02 area ha, 03 floors, 04 density %, 05 FAR

# Plots whose label disagrees with the drawing: keep the drawn outline and explain why
NOTES = {
    "2.1-CN5": {"vi": "Diện tích quy hoạch gồm cả bãi đỗ xe 2.1-BX-1 (0,8774 ha) nằm trong lô.",
                "en": "The planned area includes parking plot 2.1-BX-1 (0.8774 ha) inside this plot."},
    "2.1-CN2-4": {"vi": "Diện tích ghi trên bản vẽ trùng với lô 2.1-CN2-3, có thể ghi nhầm; ranh giới vẽ là 5,68 ha.",
                  "en": "The area on the drawing repeats plot 2.1-CN2-3 and is probably a typo; the drawn outline is 5.68 ha."},
}


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


def linework(msp):
    """Every drawn edge (lines, polylines, arcs, hatch boundaries) for rebuilding faces."""
    out = []
    for e in msp.query("LINE LWPOLYLINE POLYLINE ARC SPLINE HATCH"):
        try:
            if e.dxftype() == "HATCH":
                for bp in e.paths.rendering_paths(e.dxf.hatch_style):
                    pts = [(v.x, v.y) for v in path.from_hatch_boundary_path(bp).flattening(0.2)]
                    if len(pts) > 1:
                        out.append(LineString(pts + [pts[0]]))
            else:
                pts = [(v.x, v.y) for v in path.make_path(e).flattening(0.2)]
                if len(pts) > 1:
                    out.append(LineString(pts))
        except Exception:
            continue
    return out


class Matcher:
    def __init__(self, shapes, lines, label_points):
        self.shapes, self.lines, self.labels = shapes, lines, label_points
        self.line_tree = STRtree(lines)

    def err(self, g, ha):
        return abs(g.area / 1e4 - ha) / ha

    def holds_other_label(self, g, pt):
        return any(g.contains(o) for o in self.labels if not o.equals(pt))

    def grow(self, pt, ha):
        """Rebuild faces from the linework and add neighbouring faces of the same land use
        until the region reaches the label area (for strips the fill breaks into pieces)."""
        near = [self.lines[i] for i in self.line_tree.query(pt.buffer(900))]
        faces = [f for f in polygonize(unary_union(near)) if f.area > 5]
        start = [f for f in faces if f.contains(pt)]
        if not start:
            return None
        start = min(start, key=lambda f: f.area)
        layers = {l for l, g in self.shapes if g.intersection(start).area > 0.5 * start.area}
        same = lambda f: any(l in layers and g.intersection(f).area > 0.6 * f.area for l, g in self.shapes)
        target, region, used = ha * 1e4, start, {id(start)}
        while abs(region.area - target) / target > 0.03:
            touching = lambda f: f.boundary.intersection(region.boundary).length
            cand = [f for f in faces if id(f) not in used and region.area + f.area <= target * 1.03
                    and touching(f) > 1 and not self.holds_other_label(f, pt) and same(f)]
            if not cand:
                break
            f = max(cand, key=touching)
            used.add(id(f))
            region = unary_union([region, f])
        layer = next(iter(layers), None)
        return (layer, region) if layer else None

    def match(self, code, pt, ha):
        """Best outline for a label: (layer, geometry, how) or None."""
        err = lambda g: self.err(g, ha)
        inside = [s for s in self.shapes if s[1].contains(pt)]
        if inside:
            layer, g = min(inside, key=lambda s: err(s[1]))
            if err(g) <= NEAR:
                return layer, g, "inside"
        near = [s for s in self.shapes if s[1].distance(pt) < 250 and err(s[1]) <= 0.03]
        if near:
            layer, g = min(near, key=lambda s: s[1].distance(pt))
            return layer, g, f"label {g.distance(pt):.0f} m outside"
        best = None
        for layer, g0 in inside:
            g = unary_union([g for l, g in self.shapes if l == layer and g.distance(g0) < 1])
            if best is None or err(g) < err(best[1]):
                best = (layer, g, "pieces merged")
        if best and err(best[1]) <= 0.03:
            return best
        grown = self.grow(pt, ha)
        if grown and err(grown[1]) <= NEAR:
            return grown[0], grown[1], "rebuilt from drawn edges"
        # thin strips drawn next to their label (e.g. reserve strips along roads)
        thin = [s for s in self.shapes if s[1].distance(pt) < 20 and err(s[1]) <= 0.25
                and not self.holds_other_label(s[1], pt)]
        if thin:
            layer, g = min(thin, key=lambda s: err(s[1]))
            return layer, g, f"nearest drawn shape, {g.distance(pt):.0f} m from label"
        if code in NOTES and inside:
            layer, g = min(inside, key=lambda s: s[1].area)
            return layer, g, "drawn outline (label differs)"
        return None


def main(src, dst):
    msp = load(src)
    shapes = landuse_shapes(msp)
    labels = list(msp.query(f'INSERT[name=="{LABEL_BLOCK}"]'))
    pts = [Point(i.dxf.insert.x, i.dxf.insert.y) for i in labels]
    keep = [(i, p) for i, p in zip(labels, pts) if min(g.distance(p) for _, g in shapes) <= OUTSIDE_M]
    for i, p in zip(labels, pts):
        if (i, p) not in keep:
            print("skipped label outside the park (legend sample):", {a.dxf.tag: a.dxf.text for a in i.attribs}.get("01"))
    matcher = Matcher(shapes, linework(msp), [p for _, p in keep])
    dup = {c for c, n in Counter(a.dxf.text for i, _ in keep for a in i.attribs if a.dxf.tag == "01").items() if n > 1}
    feats = []
    for ins, pt in keep:
        a = {t.dxf.tag: t.dxf.text.strip() for t in ins.attribs}
        code, ha = a.get("01"), num(a.get("02"))
        m = matcher.match(code, pt, ha) if ha else None
        props = {"code": code, "area_ha": ha, "floors": a.get("03"), "density_pct": num(a.get("04")),
                 "far": num(a.get("05")), "duplicate_code": code in dup}
        if code in NOTES:
            props["note"] = NOTES[code]
        if m:
            layer, g, how = m
            e = abs(g.area / 1e4 - ha) / ha
            props.update(landuse=layer.strip("_ ").split("_", 2)[-1].strip("_ "), layer=layer,
                         outline_ha=round(g.area / 1e4, 4), area_diff_pct=round(e * 100, 2),
                         status="matched" if e <= GOOD else "approx" if e <= NEAR else "partial", how=how)
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
    for f in feats:
        p = f["properties"]
        if p["status"] != "matched":
            print(f"  {p['status']:9} {p['code']:10} label {p['area_ha']} ha, outline {p.get('outline_ha')} ha ({p.get('area_diff_pct')}%) {p['how']}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
