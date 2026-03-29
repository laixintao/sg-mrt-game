import { useEffect, useRef, useState } from "react";

const SCHEMATIC_LABEL_OVERRIDES = {
  "bayfront": { dx: 18, dy: -14, anchor: "start" },
  "bishan": { dx: 14, dy: -14, anchor: "start" },
  "botanic-gardens": { dx: -16, dy: -14, anchor: "end" },
  "bugis": { dx: 16, dy: -14, anchor: "start" },
  "buona-vista": { dx: -16, dy: 18, anchor: "end" },
  "city-hall": { dx: -14, dy: 18, anchor: "end" },
  "dhoby-ghaut": { dx: -16, dy: -14, anchor: "end" },
  "harbourfront": { dx: 16, dy: 18, anchor: "start" },
  "little-india": { dx: -14, dy: 18, anchor: "end" },
  "marina-bay": { dx: 18, dy: 22, anchor: "start" },
  "newton": { dx: -14, dy: -14, anchor: "end" },
  "orchard": { dx: -16, dy: 18, anchor: "end" },
  "outram-park": { dx: -16, dy: 18, anchor: "end" },
  "paya-lebar": { dx: 16, dy: 18, anchor: "start" },
  "promenade": { dx: 16, dy: 0, anchor: "start" },
  "raffles-place": { dx: 16, dy: 18, anchor: "start" },
  "serangoon": { dx: 14, dy: -14, anchor: "start" },
  "stevens": { dx: -16, dy: -14, anchor: "end" },
};

const SCHEMATIC_ISLAND_PATH = "M 260 150 C 340 70 430 60 580 80 C 720 96 806 64 958 112 C 1094 154 1266 120 1410 152 C 1474 198 1528 258 1572 320 C 1606 368 1610 430 1550 478 C 1501 518 1484 578 1494 642 C 1508 738 1470 840 1388 892 C 1310 942 1230 928 1166 1006 C 1090 1098 1030 1240 882 1282 C 738 1320 614 1290 536 1216 C 462 1144 422 1042 318 988 C 204 930 112 818 88 688 C 62 550 44 438 70 336 C 96 238 176 220 260 150 Z";

function hashStationId(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getGeographicLabelPlacement(station, mapViewBox) {
  const xRatio = station.x / mapViewBox.width;
  const yRatio = station.y / mapViewBox.height;
  const variant = hashStationId(station.id) % 4;

  if (xRatio < 0.2) {
    return { dx: 12, dy: variant % 2 === 0 ? -10 : 16, anchor: "start" };
  }

  if (xRatio > 0.82) {
    return { dx: -12, dy: variant % 2 === 0 ? -10 : 16, anchor: "end" };
  }

  if (yRatio < 0.18) {
    return variant % 2 === 0
      ? { dx: 0, dy: 18, anchor: "middle" }
      : { dx: 12, dy: 16, anchor: "start" };
  }

  if (yRatio > 0.82) {
    return variant % 2 === 0
      ? { dx: 0, dy: -14, anchor: "middle" }
      : { dx: 12, dy: -10, anchor: "start" };
  }

  const placements = [
    { dx: 12, dy: -10, anchor: "start" },
    { dx: 12, dy: 16, anchor: "start" },
    { dx: -12, dy: -10, anchor: "end" },
    { dx: -12, dy: 16, anchor: "end" },
  ];

  return placements[variant];
}

function getLabelPlacement(station, mapMode, mapViewBox) {
  if (mapMode === "schematic" && SCHEMATIC_LABEL_OVERRIDES[station.id]) {
    return SCHEMATIC_LABEL_OVERRIDES[station.id];
  }

  return getGeographicLabelPlacement(station, mapViewBox);
}

function renderModeButton(mode, activeMode, onModeChange, label) {
  const isActive = mode === activeMode;

  return (
    <button
      key={mode}
      type="button"
      className={`mode-toggle-button${isActive ? " active" : ""}`}
      aria-pressed={isActive}
      onClick={() => onModeChange(mode)}
    >
      {label}
    </button>
  );
}

function linePathToD(path) {
  return `M ${path.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
}

function stationAriaLabel(isSolved) {
  return isSolved ? "Solved MRT station" : "Hidden MRT station";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createViewport(mapViewBox) {
  return {
    x: 0,
    y: 0,
    width: mapViewBox.width,
    height: mapViewBox.height,
  };
}

function scaleValue(value, zoom) {
  return Number((value / zoom).toFixed(3));
}

function MapPanel({
  backgroundData,
  mapData,
  mapMode,
  onModeChange,
  onReset,
  onSelectStation,
  selectedStationId,
  solved,
}) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [viewport, setViewport] = useState(() => createViewport(mapData.mapViewBox));
  const [isDragging, setIsDragging] = useState(false);
  const zoom = Number((mapData.mapViewBox.width / viewport.width).toFixed(2));
  const labelFontSize = scaleValue(mapMode === "schematic" ? 12 : 11, zoom);
  const labelStrokeWidth = scaleValue(4, zoom);
  const labelWeight = mapMode === "schematic" ? 800 : 700;

  useEffect(() => {
    setViewport(createViewport(mapData.mapViewBox));
    setIsDragging(false);
  }, [mapData.mapViewBox.height, mapData.mapViewBox.width, mapMode]);

  function clampViewport(nextViewport) {
    return {
      ...nextViewport,
      x: clamp(nextViewport.x, 0, Math.max(0, mapData.mapViewBox.width - nextViewport.width)),
      y: clamp(nextViewport.y, 0, Math.max(0, mapData.mapViewBox.height - nextViewport.height)),
    };
  }

  function clientPointToMap(clientX, clientY, currentViewport = viewport) {
    const frameRect = frameRef.current?.getBoundingClientRect();

    if (!frameRect) {
      return {
        x: currentViewport.x + currentViewport.width / 2,
        y: currentViewport.y + currentViewport.height / 2,
      };
    }

    const relativeX = clamp((clientX - frameRect.left) / frameRect.width, 0, 1);
    const relativeY = clamp((clientY - frameRect.top) / frameRect.height, 0, 1);

    return {
      x: currentViewport.x + relativeX * currentViewport.width,
      y: currentViewport.y + relativeY * currentViewport.height,
    };
  }

  function updateZoom(nextZoom, focalPoint) {
    const clampedZoom = clamp(nextZoom, 1, 5);

    setViewport((currentViewport) => {
      const nextWidth = mapData.mapViewBox.width / clampedZoom;
      const nextHeight = mapData.mapViewBox.height / clampedZoom;
      const mapFocus = focalPoint ?? {
        x: currentViewport.x + currentViewport.width / 2,
        y: currentViewport.y + currentViewport.height / 2,
      };
      const focusXRatio = (mapFocus.x - currentViewport.x) / currentViewport.width;
      const focusYRatio = (mapFocus.y - currentViewport.y) / currentViewport.height;

      return clampViewport({
        x: mapFocus.x - focusXRatio * nextWidth,
        y: mapFocus.y - focusYRatio * nextHeight,
        width: nextWidth,
        height: nextHeight,
      });
    });
  }

  function handleWheel(event) {
    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? 0.18 : -0.18), clientPointToMap(event.clientX, event.clientY));
  }

  function handlePointerDown(event) {
    if (zoom <= 1) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".station-button")) {
      return;
    }

    const originViewport = viewport;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originViewport,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const frameRect = frameRef.current?.getBoundingClientRect();

    if (!frameRect) {
      return;
    }

    const xUnitsPerPixel = dragRef.current.originViewport.width / frameRect.width;
    const yUnitsPerPixel = dragRef.current.originViewport.height / frameRect.height;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;

    setViewport(clampViewport({
      ...dragRef.current.originViewport,
      x: dragRef.current.originViewport.x - deltaX * xUnitsPerPixel,
      y: dragRef.current.originViewport.y - deltaY * yUnitsPerPixel,
    }));
  }

  function handlePointerUp(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="map-panel">
      <div className="panel-header">
        <div>
          <h2>Map</h2>
          <p className="panel-copy">
            {mapMode === "schematic"
              ? "Schematic system-map view tuned toward the official LTA picture."
              : "Real Singapore coastline and major waterways behind the network."}
          </p>
        </div>

        <div className="panel-actions">
          <div className="mode-toggle" role="group" aria-label="Map display mode">
            {renderModeButton("geographic", mapMode, onModeChange, "Geographic")}
            {renderModeButton("schematic", mapMode, onModeChange, "Official Style")}
          </div>
          <button className="ghost-button" type="button" onClick={onReset}>
            Reset Game
          </button>
        </div>
      </div>

      <div ref={frameRef} className={`map-frame ${mapMode}`}>
        <div className="map-toolbar">
          <span className="zoom-hint">Wheel to zoom, drag background to pan</span>
          <span className="zoom-indicator" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="zoom-button"
            type="button"
            aria-label="Zoom in"
            onClick={() => updateZoom(zoom + 0.2)}
          >
            +
          </button>
          <button
            className="zoom-button"
            type="button"
            aria-label="Zoom out"
            onClick={() => updateZoom(zoom - 0.2)}
          >
            −
          </button>
          <button
            className="zoom-button reset"
            type="button"
            aria-label="Reset zoom and pan"
            onClick={() => {
              setViewport(createViewport(mapData.mapViewBox));
            }}
          >
            Reset View
          </button>
        </div>

        <div
          className={`map-canvas${zoom > 1 ? " zoomed" : ""}${isDragging ? " dragging" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <svg
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            role="img"
            aria-label={
              mapMode === "schematic"
                ? "Singapore MRT schematic map quiz"
                : "Singapore MRT geographic map quiz"
            }
          >
            <rect
              x="0"
              y="0"
              width={mapData.mapViewBox.width}
              height={mapData.mapViewBox.height}
              className={`water ${mapMode}`}
            />

            {mapMode === "schematic" && (
              <path d={SCHEMATIC_ISLAND_PATH} className="schematic-island" />
            )}

            {mapMode === "geographic" && (
              <>
                {backgroundData.coastlinePolygons.map((polygon) => (
                  <path key={polygon.id} d={polygon.path} className="coastline" />
                ))}
                {backgroundData.waterPolygons.map((polygon) => (
                  <path key={polygon.id} d={polygon.path} className="hydro" />
                ))}
                {backgroundData.waterLabels.map((label) => (
                  <text key={label.name} x={label.x} y={label.y} className="water-label">
                    {label.name}
                  </text>
                ))}
              </>
            )}

            {mapData.lines.map((line) =>
              line.paths.map((path, pathIndex) => (
                <path
                  key={`${line.id}-${pathIndex}`}
                  d={linePathToD(path)}
                  className={`map-line ${mapMode}`}
                  stroke={line.color}
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}

            {mapData.stations.map((station) => {
              const isSolved = solved.has(station.id);
              const isActive = selectedStationId === station.id;
              const { dx, dy, anchor } = getLabelPlacement(station, mapMode, mapData.mapViewBox);
              const hitAreaRadius = scaleValue(mapMode === "schematic" ? 17 : 15, zoom);
              const focusRingRadius = scaleValue(14, zoom);
              const solvedHaloRadius = scaleValue(15.5, zoom);
              const selectionRadius = scaleValue(12, zoom);
              const glowRadius = scaleValue(10, zoom);
              const stationRingRadius = scaleValue(mapMode === "schematic" ? 7.8 : 7.2, zoom);
              const stationDotRadius = scaleValue(2.8, zoom);

              return (
                <g
                  key={station.id}
                  className={`station-button${isSolved ? " solved" : ""}${isActive ? " active" : ""}`}
                >
                  <circle
                    cx={station.x}
                    cy={station.y}
                    r={hitAreaRadius}
                    className="station-hit-area"
                    tabIndex={isSolved ? -1 : 0}
                    role="button"
                    aria-disabled={isSolved}
                    aria-label={stationAriaLabel(isSolved)}
                    onClick={() => onSelectStation(station.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectStation(station.id);
                      }
                    }}
                  />
                  <circle cx={station.x} cy={station.y} r={focusRingRadius} className="station-focus-ring" />
                  {isSolved && <circle cx={station.x} cy={station.y} r={solvedHaloRadius} className="station-solved-halo" />}
                  {isActive && <circle cx={station.x} cy={station.y} r={selectionRadius} className="station-selection" />}
                  {!isSolved && !isActive && <circle cx={station.x} cy={station.y} r={glowRadius} className="station-glow" />}
                  <circle
                    cx={station.x}
                    cy={station.y}
                    r={stationRingRadius}
                    className="station-ring"
                  />
                  <circle cx={station.x} cy={station.y} r={stationDotRadius} className="station-dot" />
                  <text
                    x={station.x + scaleValue(dx, zoom)}
                    y={station.y + scaleValue(dy, zoom)}
                    textAnchor={anchor}
                    className={`station-label ${mapMode}${isSolved ? " visible" : ""}`}
                    style={{
                      fontSize: `${labelFontSize}px`,
                      strokeWidth: `${labelStrokeWidth}px`,
                      fontWeight: labelWeight,
                    }}
                  >
                    {station.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="legend" aria-label="MRT line legend">
        {mapData.lines.map((line) => (
          <span key={line.id}>
            <i className="line-chip" style={{ background: line.color }}></i>
            {line.name}
          </span>
        ))}
      </div>
    </section>
  );
}

export default MapPanel;
