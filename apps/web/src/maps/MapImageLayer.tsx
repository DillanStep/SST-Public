import { useEffect, useMemo, useState } from 'react';
import { ImageOverlay, Marker, Polyline, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import { mapBounds, mapCenter, type ActiveMapConfig } from './mapConfig';

interface MapImageLayerProps {
  mapConfig: ActiveMapConfig;
}

function buildGridLines(mapConfig: ActiveMapConfig): [number, number][][] {
  const lines: [number, number][][] = [];
  const steps = 8;

  for (let index = 1; index < steps; index += 1) {
    const x = (mapConfig.worldSizeX / steps) * index;
    const z = (mapConfig.worldSizeZ / steps) * index;
    lines.push([[0, x], [mapConfig.worldSizeZ, x]]);
    lines.push([[z, 0], [z, mapConfig.worldSizeX]]);
  }

  return lines;
}

export function MapImageLayer({ mapConfig }: MapImageLayerProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const bounds = useMemo(() => mapBounds(mapConfig), [mapConfig]);
  const gridLines = useMemo(() => buildGridLines(mapConfig), [mapConfig]);

  useEffect(() => {
    setImageFailed(false);
  }, [mapConfig.imageUrl]);

  if (mapConfig.imageUrl && !imageFailed) {
    return (
      <ImageOverlay
        url={mapConfig.imageUrl}
        bounds={bounds}
        eventHandlers={{
          error: () => setImageFailed(true),
        }}
      />
    );
  }

  const labelIcon = L.divIcon({
    className: 'sst-map-fallback-label',
    html: `<div style="background: rgba(255,255,255,0.92); border: 1px solid rgba(15,23,42,0.18); border-radius: 8px; padding: 8px 10px; color: #334155; font: 600 12px system-ui, sans-serif; white-space: nowrap; box-shadow: 0 8px 24px rgba(15,23,42,0.18);">${mapConfig.label} grid</div>`,
    iconSize: [160, 36],
    iconAnchor: [80, 18],
  });

  return (
    <>
      <Rectangle bounds={bounds} pathOptions={{ color: '#475569', weight: 1, fillColor: '#0f172a', fillOpacity: 1 }} />
      {gridLines.map((line, index) => (
        <Polyline
          key={index}
          positions={line}
          pathOptions={{ color: '#64748b', weight: 1, opacity: 0.45 }}
          interactive={false}
        />
      ))}
      <Marker position={mapCenter(mapConfig)} icon={labelIcon} interactive={false} />
    </>
  );
}
