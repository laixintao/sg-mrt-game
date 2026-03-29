import fs from "node:fs/promises";
import { lines as geographicLines, stations as geographicStations } from "../src/data/geographicMapData.js";

const OUT_FILE = new URL("../src/data/schematicMapData.js", import.meta.url);
const WIDTH = 1600;
const HEIGHT = 1320;

const stationLookup = new Map(geographicStations.map((station) => [station.id, station]));

const anchorPositions = {
  "tuas-link": [120, 470],
  "joo-koon": [180, 470],
  "boon-lay": [240, 520],
  "jurong-east": [340, 720],
  "bukit-batok": [340, 620],
  "bukit-gombak": [340, 540],
  "woodlands-north": [450, 140],
  woodlands: [500, 180],
  "woodlands-south": [580, 255],
  yishun: [820, 250],
  bishan: [860, 580],
  caldecott: [710, 660],
  stevens: [720, 790],
  "botanic-gardens": [560, 760],
  orchard: [690, 900],
  newton: [780, 840],
  somerset: [740, 960],
  "dhoby-ghaut": [780, 1010],
  "city-hall": [860, 1120],
  "raffles-place": [860, 1170],
  "marina-bay": [900, 1250],
  "marina-south-pier": [900, 1300],
  "buona-vista": [560, 780],
  "one-north": [520, 920],
  "outram-park": [700, 1140],
  harbourfront: [640, 1270],
  promenade: [1100, 1120],
  bayfront: [1060, 1210],
  downtown: [970, 1190],
  bugis: [950, 1070],
  "paya-lebar": [1210, 830],
  serangoon: [1060, 590],
  hougang: [1180, 470],
  "punggol-coast": [1370, 250],
  "tanah-merah": [1350, 770],
  tampines: [1480, 690],
  "pasir-ris": [1550, 640],
  expo: [1500, 820],
  "changi-airport": [1570, 900],
  "little-india": [860, 930],
  lentor: [700, 360],
  "bright-hill": [730, 460],
  "great-world": [690, 990],
  "gardens-by-the-bay": [1140, 1260],
  "katong-park": [1140, 1110],
  "marine-parade": [1250, 1150],
  siglap: [1360, 1110],
  bayshore: [1470, 1060],
  "cashew": [430, 470],
  "beauty-world": [490, 590],
};

const lineOrder = ["nsl", "ewl", "nel", "ccl", "dtl", "tel"];

const anchorSequences = {
  nslMain: ["jurong-east", "bukit-batok", "woodlands", "bishan", "newton", "dhoby-ghaut", "city-hall", "marina-bay", "marina-south-pier"],
  ewlMain: ["tuas-link", "joo-koon", "boon-lay", "jurong-east", "buona-vista", "outram-park", "city-hall", "paya-lebar", "tanah-merah", "tampines", "pasir-ris"],
  ewlChangiBranch: ["tanah-merah", "expo", "changi-airport"],
  nelMain: ["harbourfront", "outram-park", "dhoby-ghaut", "little-india", "serangoon", "hougang", "punggol-coast"],
  cclMain: ["dhoby-ghaut", "promenade", "paya-lebar", "serangoon", "bishan", "caldecott", "botanic-gardens", "buona-vista", "harbourfront"],
  cclBayfrontBranch: ["promenade", "bayfront", "marina-bay"],
  dtlMain: ["cashew", "beauty-world", "botanic-gardens", "stevens", "newton", "little-india", "bugis", "promenade", "bayfront", "downtown", "expo"],
  telMain: ["woodlands-north", "woodlands", "lentor", "bright-hill", "caldecott", "stevens", "orchard", "great-world", "outram-park", "marina-bay", "gardens-by-the-bay", "katong-park", "marine-parade", "siglap", "bayshore"],
};

function stationCodeValue(station, prefix) {
  const code = station.code.split("/").find((entry) => entry.startsWith(prefix));

  if (!code) {
    return null;
  }

  const numeric = Number.parseInt(code.slice(prefix.length), 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function getLineSequence(prefix) {
  return geographicStations
    .filter((station) => stationCodeValue(station, prefix) !== null)
    .sort((a, b) => stationCodeValue(a, prefix) - stationCodeValue(b, prefix))
    .map((station) => station.id);
}

function collectSchematicSequences() {
  return {
    nsl: [getLineSequence("NS")],
    ewl: [
      geographicStations
        .filter((station) => stationCodeValue(station, "EW") !== null)
        .sort((a, b) => stationCodeValue(a, "EW") - stationCodeValue(b, "EW"))
        .map((station) => station.id),
      ["tanah-merah", ...getLineSequence("CG")],
    ],
    nel: [getLineSequence("NE")],
    ccl: [
      geographicStations
        .filter((station) => stationCodeValue(station, "CC") !== null)
        .sort((a, b) => stationCodeValue(a, "CC") - stationCodeValue(b, "CC"))
        .map((station) => station.id),
      ["promenade", ...getLineSequence("CE")],
    ],
    dtl: [getLineSequence("DT")],
    tel: [getLineSequence("TE")],
  };
}

function interpolatePoint(start, end, ratio) {
  return [
    Number((start[0] + (end[0] - start[0]) * ratio).toFixed(1)),
    Number((start[1] + (end[1] - start[1]) * ratio).toFixed(1)),
  ];
}

function assignSequencePoints(sequence, anchorIds, stationCandidates) {
  const anchorIndexes = anchorIds.map((id) => sequence.indexOf(id)).filter((index) => index >= 0);

  for (let position = 0; position < anchorIndexes.length - 1; position += 1) {
    const startIndex = anchorIndexes[position];
    const endIndex = anchorIndexes[position + 1];
    const startId = sequence[startIndex];
    const endId = sequence[endIndex];
    const startPoint = anchorPositions[startId];
    const endPoint = anchorPositions[endId];
    const span = endIndex - startIndex;

    for (let index = startIndex; index <= endIndex; index += 1) {
      const ratio = span === 0 ? 0 : (index - startIndex) / span;
      const stationId = sequence[index];
      const point = interpolatePoint(startPoint, endPoint, ratio);

      if (!stationCandidates.has(stationId)) {
        stationCandidates.set(stationId, []);
      }

      stationCandidates.get(stationId).push(point);
    }
  }
}

function averagePoints(points) {
  const sum = points.reduce(
    (accumulator, [x, y]) => [accumulator[0] + x, accumulator[1] + y],
    [0, 0],
  );

  return [
    Number((sum[0] / points.length).toFixed(1)),
    Number((sum[1] / points.length).toFixed(1)),
  ];
}

function main() {
  const schematicSequences = collectSchematicSequences();
  const stationCandidates = new Map();

  for (const sequence of Object.values(schematicSequences).flat()) {
    const anchorIds = Object.keys(anchorPositions)
      .filter((id) => sequence.includes(id))
      .sort((a, b) => sequence.indexOf(a) - sequence.indexOf(b));
    assignSequencePoints(sequence, anchorIds, stationCandidates);
  }

  const schematicStations = geographicStations.map((station) => {
    const points = stationCandidates.get(station.id) || [anchorPositions[station.id]];
    const [x, y] = averagePoints(points.filter(Boolean));

    return {
      ...station,
      x,
      y,
    };
  });

  const stationPositionLookup = new Map(schematicStations.map((station) => [station.id, [station.x, station.y]]));

  const schematicLines = lineOrder.map((lineId) => {
    const baseLine = geographicLines.find((line) => line.id === lineId);
    const sequences = schematicSequences[lineId];

    return {
      id: baseLine.id,
      name: baseLine.name,
      color: baseLine.color,
      paths: sequences.map((sequence) => sequence.map((stationId) => stationPositionLookup.get(stationId))),
    };
  });

  const file = `export const mapViewBox = { width: ${WIDTH}, height: ${HEIGHT} };

export const stations = [
${schematicStations
  .map((station) => `  { id: ${JSON.stringify(station.id)}, name: ${JSON.stringify(station.name)}, code: ${JSON.stringify(station.code)}, x: ${station.x}, y: ${station.y}, lines: ${JSON.stringify(station.lines)} },`)
  .join("\n")}
];

export const lines = [
${schematicLines
  .map((line) => `  { id: ${JSON.stringify(line.id)}, name: ${JSON.stringify(line.name)}, color: ${JSON.stringify(line.color)}, paths: [${line.paths.map((path) => `[${path.map(([x, y]) => `[${x.toFixed(1)}, ${y.toFixed(1)}]`).join(", ")}]`).join(", ")}] },`)
  .join("\n")}
];
`;

  return fs.writeFile(OUT_FILE, file);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
