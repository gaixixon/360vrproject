# Tour content format (draft)

All content lives in one file, `tour.json`. Directions in a panorama are **yaw** (left/right, degrees, 0 = image centre, positive to the right) and **pitch** (up/down, degrees, positive up). `north` per scene is the yaw that points north, so the mini-map cone and landmark directions are correct.

```json
{
  "title": {"vi": "KCN Ví dụ", "en": "Example Industrial Park"},
  "contact": {"phone": "+84 ...", "zalo": "...", "email": "..."},
  "map": {"image": "map/site-plan.png", "width": 2000, "height": 1400},
  "start": "a1",
  "scenes": [
    {
      "id": "a1",
      "name": {"vi": "Toàn cảnh cổng chính", "en": "Main gate overview"},
      "type": "aerial",
      "image": "scenes/a1/",
      "map": {"x": 820, "y": 640},
      "north": 35,
      "view": {"yaw": 0, "pitch": -25, "fov": 90},
      "hotspots": [
        {"type": "link", "to": "a2", "yaw": 110, "pitch": -20},
        {"type": "info", "yaw": -40, "pitch": -30,
         "title": {"vi": "Nhà điều hành", "en": "Admin building"},
         "text": {"vi": "...", "en": "..."}, "photos": ["media/admin.jpg"]},
        {"type": "landmark", "yaw": 200, "pitch": -2,
         "title": {"vi": "Cảng Hải Phòng", "en": "Hai Phong Port"}, "distance_km": 15}
      ],
      "lots": [
        {"lot": "A3", "points": [[12, -35], [30, -33], [32, -48], [10, -50]]}
      ]
    }
  ],
  "lots": {
    "A3": {"area_ha": 5.2, "status": "available", "price": {"vi": "Liên hệ", "en": "On request"},
           "notes": {"vi": "...", "en": "..."}}
  }
}
```

## Notes

- **As built (v1):** scenes are placed by `lat`/`lon` (WGS84) instead of map `x`/`y`, and the site plan comes from `"plots": "data/plots.geojson"`. `link` hotspots and `landmark`s (given as `lat`/`lon`) can omit `yaw`: the viewer computes it from the bearing plus the scene's `north`. `"sample": true` shows the "sample photo" badge.

- `scenes[].lots[].points` are the lot's corners as `[yaw, pitch]` in that scene, so a lot can be outlined in several scenes; its info is shared in the top-level `lots`.
- `status` values: `available`, `reserved`, `leased`, `building`; the viewer maps them to colours and the legend.
- Any text field can be a plain string (same in both languages) or `{"vi": ..., "en": ...}`.
- A small editor page (later) will let us click in a panorama and copy yaw/pitch, instead of guessing numbers.
