import fs from "node:fs/promises";

const OUT_FILE = new URL("../src/data/geographicMapData.js", import.meta.url);
const WIDTH = 1400;
const HEIGHT = 760;
const PAD_X = 76;
const PAD_Y = 70;
const EPSILON = 2.8;

const lineMeta = {
  nsl: { name: "North South", color: "#d32f2f" },
  ewl: { name: "East West", color: "#2e7d32" },
  nel: { name: "North East", color: "#7b1fa2" },
  ccl: { name: "Circle", color: "#f59e0b" },
  dtl: { name: "Downtown", color: "#1e88e5" },
  tel: { name: "Thomson-East Coast", color: "#8d5a2b" },
};

const lineIdByName = {
  "North South Line": "nsl",
  "East West Line": "ewl",
  "North East Line": "nel",
  "Circle Line": "ccl",
  "Downtown Line": "dtl",
  "Thomson-East Coast Line": "tel",
};

const lineIdByCodePrefix = {
  NS: "nsl",
  EW: "ewl",
  CG: "ewl",
  NE: "nel",
  CC: "ccl",
  CE: "ccl",
  DT: "dtl",
  TE: "tel",
};

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

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

function formatPoint([x, y]) {
  return `[${x.toFixed(1)}, ${y.toFixed(1)}]`;
}

async function main() {
  const response = await fetch(
    "https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson",
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch MRT data: ${response.status}`);
  }

  const geo = await response.json();

  const stationFeatures = geo.features.filter((feature) => {
    return feature.geometry.type === "Point"
      && feature.properties.network === "singapore-mrt"
      && feature.properties.stop_type === "station";
  });

  const lngs = stationFeatures.map((feature) => feature.geometry.coordinates[0]);
  const lats = stationFeatures.map((feature) => feature.geometry.coordinates[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const transformPoint = ([lng, lat]) => {
    const x = PAD_X + ((lng - minLng) / (maxLng - minLng)) * (WIDTH - PAD_X * 2);
    const y = HEIGHT - PAD_Y - ((lat - minLat) / (maxLat - minLat)) * (HEIGHT - PAD_Y * 2);
    return [x, y];
  };

  const stations = stationFeatures
    .map((feature) => {
      const codes = String(feature.properties.station_codes || "").split("-").filter(Boolean);
      const lines = [
        ...new Set(
          codes
            .map((code) => lineIdByCodePrefix[(code.match(/^[A-Z]+/) || [""])[0]])
            .filter(Boolean),
        ),
      ];
      const [x, y] = transformPoint(feature.geometry.coordinates);

      return {
        id: slugify(feature.properties.name),
        name: String(feature.properties.name || "").trim(),
        code: codes.join("/"),
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        lines,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = geo.features
    .filter((feature) => {
      return ["LineString", "MultiLineString"].includes(feature.geometry.type)
        && feature.properties.network === "singapore-mrt"
        && lineIdByName[feature.properties.name];
    })
    .map((feature) => {
      const id = lineIdByName[feature.properties.name];
      const rawPaths =
        feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;

      const paths = rawPaths.map((path) => {
        const transformed = path.map(transformPoint);
        const simplified = simplify(transformed, EPSILON);
        return simplified.map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))]);
      });

      return {
        id,
        name: lineMeta[id].name,
        color: lineMeta[id].color,
        paths,
      };
    })
    .sort((a, b) => ["nsl", "ewl", "nel", "ccl", "dtl", "tel"].indexOf(a.id) - ["nsl", "ewl", "nel", "ccl", "dtl", "tel"].indexOf(b.id));

  const file = `export const mapViewBox = { width: ${WIDTH}, height: ${HEIGHT} };

export const stations = [
${stations
  .map((station) => `  { id: ${JSON.stringify(station.id)}, name: ${JSON.stringify(station.name)}, code: ${JSON.stringify(station.code)}, x: ${station.x}, y: ${station.y}, lines: ${JSON.stringify(station.lines)} },`)
  .join("\n")}
];

export const lines = [
${lines
  .map((line) => `  { id: ${JSON.stringify(line.id)}, name: ${JSON.stringify(line.name)}, color: ${JSON.stringify(line.color)}, paths: [${line.paths.map((path) => `[${path.map(formatPoint).join(", ")}]`).join(", ")}] },`)
  .join("\n")}
];
`;

  await fs.mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
  await fs.writeFile(OUT_FILE, file);
  console.log(`Wrote ${stations.length} stations and ${lines.length} lines.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
