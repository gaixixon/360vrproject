# Shooting and stitching the panoramas

## Aerial (drone)

- **Drone**: any DJI with a *Sphere* panorama mode (Mini 3/4 Pro, Air 2S/3, Mavic 3). It takes ~26–35 photos and can stitch on the phone, but stitching on a computer gives better quality.
- **Height**: 80–150 m for an overview of a park; lower (40–60 m) for a single building or lot. Try a couple of heights at the first point.
- **Points**: one panorama per area of interest, ideally so each point can "see" the next (for link hotspots). A typical park: 4–10 aerial points plus 2–5 ground points.
- **Time**: clear sky, mid-morning or mid-afternoon (sun not straight overhead, not too low). Avoid wind over ~8 m/s. Shoot all points on the same day for the same light.
- **Record**: for each point note GPS position, height, time, and which way north is (for the mini-map and landmark directions).
- **Permits (Vietnam)**: drone flights need permission; areas near airports, military sites and some industrial zones are restricted. Check before flying, or hire a licensed pilot.

## Ground

- 360 camera (Insta360 X3/X4, Ricoh Theta) on a tripod or pole at ~1.6 m, or phone panorama apps for a quick test.
- Same light and time as the aerial set if possible.

## Stitching

- Tools: **PTGui** (paid, best), **Hugin** (free), DJI's own stitch, Insta360 Studio for 360 cameras.
- Output: **equirectangular JPEG, 2:1**, e.g. 12000×6000 for aerial (bigger is fine; it will be tiled).
- Fix: drone parts at the bottom (nadir patch or logo), sky holes at the top (sky replacement), horizon level, colour match between scenes.

## Preparing for the web

- Tile each panorama into multi-resolution cube faces (Marzipano tool, krpanotools or a `vips` script), so the viewer loads a small preview first and sharp tiles only where you look.
- Keep a small preview (~2000×1000) per scene for thumbnails and fast first load.
- Folder per scene: `scenes/<id>/` with tiles and preview.

## Sample images for the prototype

Until real photos exist, use free equirectangular panoramas (e.g. from Poly Haven or the viewer libraries' demo images), and check each image's license.
