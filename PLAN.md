# Plan

## Goal

A web tour of a site (industrial park or real estate project) from the air and from the ground, that a visitor can explore on a phone or computer without installing anything, and that the owner can update (lot status, prices, contacts) by editing a data file.

## Features

### Must have (v1)
- 360° panoramas: drag or swipe to look around, pinch or wheel to zoom, full screen.
- Several scenes: aerial viewpoints plus a few ground-level ones (gate, office, main road).
- Hotspots pinned in the panorama:
  - **info**: label plus a popup (text, photos, video, link)
  - **link**: an arrow or icon that jumps to another scene, facing the right way
  - **landmark**: far-away places on the horizon with distance ("Cảng Hải Phòng · 15 km")
- Mini-map (site plan image) with the scene points and a cone for the current view direction. Tap a point to go there.
- Scene list or thumbnails strip.
- Vietnamese / English switch.
- Contact button (phone, Zalo, email).

### Nice to have (v2)
- Lot overlay: lot outlines drawn on the aerial panorama, coloured by status (available / reserved / leased), tap for area, price, infrastructure.
- Filter lots by size or status; a lot table that highlights the lot in the view.
- Gyroscope look-around on phones; VR (cardboard) mode.
- Day / night or before / after versions of the same viewpoint.
- Auto-rotate intro, background music, guided tour (play scenes in order).
- Share link to a scene and view direction (`#scene=a2&yaw=120&pitch=-30`).
- Simple editor page: click in the panorama to place a hotspot and copy its yaw/pitch.

### Later / maybe
- Real 3D model (photogrammetry or Gaussian splatting) for free flying instead of fixed points.
- Embed widget for other websites.

## Tech choices (to confirm)

| Part | Options | Leaning |
|---|---|---|
| Viewer | Marzipano (Google, free, tiled cube maps), Pannellum (free, simple), Photo Sphere Viewer (free, plugins: markers, map, gallery), krpano / Pano2VR / 3DVista (paid, visual editors) | **Photo Sphere Viewer** or **Marzipano**: free, static, good on phones |
| Image tiling | Marzipano tool, krpanotools, `vips dzsave`, own script | multi-resolution cube tiles so phones load fast |
| Data | `tour.json` (scenes, hotspots, lots, texts in vi/en) | yes |
| Hosting | GitHub Pages, Cloudflare Pages / Workers static assets | either; large images may favour Cloudflare (R2) |
| Build | none, or a small script that tiles images and checks `tour.json` | keep it minimal |

## Phases

1. **Prototype** with sample panoramas (any free equirectangular images): viewer, 2–3 scenes, hotspots, links, mini-map, from `tour.json`.
2. **Real content**: shoot or obtain drone panoramas of the chosen site, stitch, tile, place hotspots.
3. **Lots overlay** and lot info (v2 features).
4. **Polish**: loading speed, phone UX, vi/en, share links, analytics (optional).
5. **Publish** to the chosen host and domain.

## Risks

- Getting good drone panoramas is the biggest cost (equipment or a pilot, weather, flight permits).
- Large images: must tile them or phones will be slow.
- Lot outlines on a spherical photo need careful placement (yaw/pitch polygons); an editor helper saves a lot of time.
