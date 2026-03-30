import { useEffect, useRef, useState } from "react";

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

function getLabelPlacement(station, mapViewBox) {
  return getGeographicLabelPlacement(station, mapViewBox);
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
  celebrationStationId,
  mapData,
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
  const labelFontSize = scaleValue(11, zoom);
  const labelStrokeWidth = scaleValue(4, zoom);
  const labelWeight = 700;

  useEffect(() => {
    setViewport(createViewport(mapData.mapViewBox));
    setIsDragging(false);
  }, [mapData.mapViewBox.height, mapData.mapViewBox.width]);

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
          <p className="panel-copy">Real Singapore coastline and major waterways behind the network.</p>
        </div>

        <div className="panel-actions">
          <button className="ghost-button" type="button" onClick={onReset}>
            Reset Game
          </button>
        </div>
      </div>

      <div ref={frameRef} className="map-frame geographic">
        <div className="map-toolbar">
          <span className="zoom-hint">Wheel to zoom, drag background to pan</span>
          <span className="zoom-indicator" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="zoom-button preset"
            type="button"
            aria-label="Zoom to 200 percent"
            onClick={() => updateZoom(2)}
          >
            200%
          </button>
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
            aria-label="Singapore MRT geographic map quiz"
          >
            <rect
              x="0"
              y="0"
              width={mapData.mapViewBox.width}
              height={mapData.mapViewBox.height}
              className="water geographic"
            />

            <>
              {backgroundData.coastlinePolygons.map((polygon) => (
                <path key={polygon.id} d={polygon.path} className="coastline" />
              ))}
              {backgroundData.waterPolygons.map((polygon) => (
                <path key={polygon.id} d={polygon.path} className="hydro" />
              ))}
            </>

            {mapData.lines.map((line) =>
              line.paths.map((path, pathIndex) => (
                <path
                  key={`${line.id}-${pathIndex}`}
                  d={linePathToD(path)}
                  className="map-line geographic"
                  stroke={line.color}
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}

            {mapData.stations.map((station) => {
              const isSolved = solved.has(station.id);
              const isActive = selectedStationId === station.id;
              const isCelebrating = celebrationStationId === station.id;
              const { dx, dy, anchor } = getLabelPlacement(station, mapData.mapViewBox);
              const hitAreaRadius = scaleValue(15, zoom);
              const focusRingRadius = scaleValue(14, zoom);
              const solvedHaloRadius = scaleValue(15.5, zoom);
              const selectionRadius = scaleValue(12, zoom);
              const glowRadius = scaleValue(10, zoom);
              const stationRingRadius = scaleValue(7.2, zoom);
              const stationDotRadius = scaleValue(2.8, zoom);

              return (
                <g
                  key={station.id}
                  className={`station-button${isSolved ? " solved" : ""}${isActive ? " active" : ""}${isCelebrating ? " celebrating" : ""}`}
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
                  {isCelebrating && (
                    <circle cx={station.x} cy={station.y} r={selectionRadius} className="station-celebration-ring">
                      <animate attributeName="r" from={selectionRadius} to={scaleValue(26, zoom)} dur="0.95s" begin="0s" fill="freeze" />
                      <animate attributeName="opacity" from="0.9" to="0" dur="0.95s" begin="0s" fill="freeze" />
                    </circle>
                  )}
                  {isCelebrating && (
                    <circle cx={station.x} cy={station.y} r={stationRingRadius} className="station-celebration-flash">
                      <animate attributeName="opacity" values="0;0.9;0" dur="0.7s" begin="0s" fill="freeze" />
                    </circle>
                  )}
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
                    className={`station-label geographic${isSolved ? " visible" : ""}`}
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
