# 360vrproject

A **VR360 aerial virtual tour** for the web, like the ones industrial parks (KCN) and real estate projects put on their websites. Visitors look around 360° drone panoramas of the site, tap points of interest (lots, roads, utilities, nearby landmarks) and move between viewpoints, with a mini-map that shows where they are.

Live: **https://gaixixon.github.io/360vrproject/** · Status: prototype (2026-10-11). The site plan uses the real HANSSIP 2 plots; the 360° scenes are sample panoramas until drone photos are shot.

Run locally: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## Idea in one picture

```
drone 360 photos ──► stitched panoramas (2:1 equirectangular)
                              │
                              ▼
       tour.json (scenes, hotspots, links, lot info)
                              │
                              ▼
   static web viewer: look around · hotspots · jump between scenes · mini-map
```

## Documents

- [PLAN.md](PLAN.md): goals, features, tech choices, phases
- [SHOOTING.md](SHOOTING.md): how to capture and stitch the drone panoramas
- [CONTENT.md](CONTENT.md): the tour data format (scenes, hotspots, lots)
- [QUESTIONS.md](QUESTIONS.md): decisions still open

## Data

Site: **HANSSIP 2** (KCN Hỗ trợ Nam Hà Nội), Đại Xuyên, Phú Xuyên, Hà Nội.

- `source/`: original planning files (DWG, DXF converted from it, PDFs).
- `data/plots.geojson`: 100 plots from the DXF (code, area, floors, density, FAR, land use, outline) in WGS84, converted from VN-2000 Hà Nội zone (CM 105°00'). `status` is `matched` (area within 2%), `approx` (2–10%) or `partial` (drawn outline differs more; `note` explains known drawing errors). A legend sample label outside the park is skipped.
- `tour.json`: scenes and hotspots (format in [CONTENT.md](CONTENT.md)); `scenes/<id>/pano.jpg` + `thumb.jpg`.
- `index.html`, `app.js`, `style.css`: the static viewer (Photo Sphere Viewer 5, Leaflet; no build step).
- `tools/extract_plots.py`: rebuilds `data/plots.geojson` from the DXF (Python venv `~/.cache/vrtools-venv`).

## Principles

- Static site: plain HTML/CSS/JS, no server, hostable on GitHub Pages or Cloudflare.
- Content in a data file, so lots and hotspots change without touching code.
- Phone first: touch, gyroscope look-around, fast loading (tiled images).
- Vietnamese and English.

## Credits

- Sample panoramas: [Poly Haven](https://polyhaven.com) (CC0): Farm Field, Derelict Airfield 01, Abandoned Tank Farm 01.
- Satellite imagery: Esri World Imagery; map: OpenStreetMap contributors.
