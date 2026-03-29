import fs from "node:fs/promises";

const OUT_FILE = new URL("../src/data/geographicBackgroundData.js", import.meta.url);
const WIDTH = 1400;
const HEIGHT = 760;
const PAD_X = 76;
const PAD_Y = 70;
const EPSILON = 0.00035;
const POLYGON_DATASET_ID = "d_29f066d67df3eae91df8a42f443863c8";

const WATER_NAMES = new Set([
  "SINGAPORE RIVER",
  "KALLANG RIVER",
  "ROCHOR RIVER",
  "GEYLANG RIVER",
  "SUNGEI WHOMPOA",
  "SUNGEI ULU PANDAN",
  "SUNGEI PUNGGOL",
  "SUNGEI SERANGOON",
  "ALEXANDRA CANAL",
  "ROCHOR CANAL",
  "STAMFORD CANAL",
  "MY WATERWAY@PUNGGOL",
  "MARINA BAY",
  "MARINA RESERVOIR",
]);

function perpendicularDistance(point, start, end) {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;

  if (x1 === x2 && y1 === y2) {
    return Math.hypot(px - x1, py - y1);
  }

  const numerator = Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1);
  const denominator = Math.hypot(y2 - y1, x2 - x1);
  return numerator / denominator;
}

function simplify(points, epsilon) {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);

    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= epsilon) {
    return [points[0], points[points.length - 1]];
  }

  const left = simplify(points.slice(0, index + 1), epsilon);
  const right = simplify(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function bboxFromCoordinates(rings) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return { minLng, maxLng, minLat, maxLat };
}

function intersects(a, b) {
  return a.minLng <= b.maxLng
    && a.maxLng >= b.minLng
    && a.minLat <= b.maxLat
    && a.maxLat >= b.minLat;
}

function polygonArea(ring) {
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function polygonCentroid(ring) {
  let area = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    const factor = x1 * y2 - x2 * y1;
    area += factor;
    x += (x1 + x2) * factor;
    y += (y1 + y2) * factor;
  }

  if (area === 0) {
    return ring[0];
  }

  const scaledArea = area * 0.5;
  return [x / (6 * scaledArea), y / (6 * scaledArea)];
}

function formatPath(rings, transformPoint) {
  const segments = rings.map((ring) => {
    const simplified = simplify(ring, EPSILON);
    const points = simplified.map((point) => transformPoint(point));

    if (points.length < 3) {
      return "";
    }

    return `M ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`;
  });

  return segments.filter(Boolean).join(" ");
}

async function getStationBounds() {
  const response = await fetch(
    "https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson",
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch MRT bounds source: ${response.status}`);
  }

  const geo = await response.json();
  const stations = geo.features.filter((feature) => {
    return feature.geometry.type === "Point"
      && feature.properties.network === "singapore-mrt"
      && feature.properties.stop_type === "station";
  });

  const lngs = stations.map((feature) => feature.geometry.coordinates[0]);
  const lats = stations.map((feature) => feature.geometry.coordinates[1]);

  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

async function main() {
  const stationBounds = await getStationBounds();
  const expandedBounds = {
    minLng: stationBounds.minLng - 0.03,
    maxLng: stationBounds.maxLng + 0.03,
    minLat: stationBounds.minLat - 0.03,
    maxLat: stationBounds.maxLat + 0.03,
  };

  const meta = await fetch(
    `https://api-open.data.gov.sg/v1/public/api/datasets/${POLYGON_DATASET_ID}/poll-download`,
  ).then((response) => response.json());

  const geo = await fetch(meta.data.url).then((response) => response.json());

  const transformPoint = ([lng, lat]) => {
    const x = PAD_X + ((lng - stationBounds.minLng) / (stationBounds.maxLng - stationBounds.minLng)) * (WIDTH - PAD_X * 2);
    const y = HEIGHT - PAD_Y - ((lat - stationBounds.minLat) / (stationBounds.maxLat - stationBounds.minLat)) * (HEIGHT - PAD_Y * 2);
    return [x, y];
  };

  const coastlinePolygons = [];
  const waterPolygons = [];
  const labelGroups = new Map();

  for (const feature of geo.features) {
    const { FOLDERPATH: folderPath, NAME: name } = feature.properties;
    const geometryType = feature.geometry?.type;

    if (!geometryType || !["Polygon", "MultiPolygon"].includes(geometryType)) {
      continue;
    }

    const polygons = geometryType === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const normalizedPolygons = polygons.map((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])));

    const bbox = bboxFromCoordinates(normalizedPolygons.flat());

    if (!intersects(bbox, expandedBounds)) {
      continue;
    }

    if (folderPath === "Layers/Coastal_Outlines") {
      const path = normalizedPolygons
        .map((polygon) => formatPath(polygon, transformPoint))
        .filter(Boolean)
        .join(" ");

      if (path) {
        coastlinePolygons.push({ id: `coast-${coastlinePolygons.length + 1}`, path });
      }
    }

    if (folderPath === "Layers/Hydrographic" && WATER_NAMES.has(name)) {
      const path = normalizedPolygons
        .map((polygon) => formatPath(polygon, transformPoint))
        .filter(Boolean)
        .join(" ");

      if (!path) {
        continue;
      }

      waterPolygons.push({ id: `water-${waterPolygons.length + 1}`, name, path });

      const largestRing = normalizedPolygons
        .flat()
        .slice()
        .sort((a, b) => polygonArea(b) - polygonArea(a))[0];

      if (largestRing) {
        const centroid = polygonCentroid(largestRing);
        const projected = transformPoint(centroid);

        if (!labelGroups.has(name)) {
          labelGroups.set(name, []);
        }

        labelGroups.get(name).push(projected);
      }
    }
  }

  const waterLabels = [...labelGroups.entries()].map(([name, points]) => {
    const [x, y] = points.reduce(
      (accumulator, [pointX, pointY]) => [accumulator[0] + pointX, accumulator[1] + pointY],
      [0, 0],
    );

    return {
      name,
      x: Number((x / points.length).toFixed(1)),
      y: Number((y / points.length).toFixed(1)),
    };
  });

  const file = `export const coastlinePolygons = ${JSON.stringify(coastlinePolygons, null, 2)};

export const waterPolygons = ${JSON.stringify(waterPolygons, null, 2)};

export const waterLabels = ${JSON.stringify(waterLabels, null, 2)};
`;

  await fs.writeFile(OUT_FILE, file);
  console.log(
    `Wrote ${coastlinePolygons.length} coastline polygons, ${waterPolygons.length} water polygons and ${waterLabels.length} labels.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
