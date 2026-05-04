# SST Map Assets

This folder is the bundled map catalog for SST. The web client only offers
presets that have an image in this folder.

## Bundled Maps

| Preset | Image | World Size |
| --- | --- | --- |
| `chernarusplus` | `chernarus.jpg` | 15360 x 15360 |
| `enoch` | `livonia.jpg` | 12800 x 12800 |
| `sakhal` | `sakhal.webp` | 12800 x 12800 |
| `namalsk` | `namalsk.jpg` | 12800 x 12800 |
| `deerisle` | `deerisle.webp` | 16384 x 16384 |
| `esseker` | `esseker.jpg` | 12288 x 12288 |
| `hasima` | `hasima.jpg` | 5120 x 5120 |

The image dimensions do not need to match the world size. SST overlays each
image across the DayZ world coordinate bounds and places markers from raw
in-game X/Z positions.

## Adding Or Fixing A Map

1. Add the image to this folder.
2. Add or update the preset in `apps/web/src/maps/mapConfig.ts`.
3. Add the same preset in `apps/api/src/utils/mapConfig.js`.
4. If markers are mirrored, set `MAP_INVERT_X` or `MAP_INVERT_Z` in Settings.
5. If markers are scaled wrong, adjust `MAP_WORLD_SIZE_X` and `MAP_WORLD_SIZE_Z`.

## Stitching PAA Tiles

If you have DayZ terrain layer tiles named like `S_000_000_lco.paa`, use the
repo stitcher to build a dashboard map image:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\map\Stitch-PaaMap.ps1 `
  -InputPath "C:\Path\To\Map Tiles" `
  -OutputPath ".\apps\web\public\maps\hasima.jpg" `
  -CropEdgePixels 16
```

`-CropEdgePixels` is useful when converted PAA tiles have visible padded edges.
The script keeps native tile size unless the map is larger than `-MaxOutputSize`.
