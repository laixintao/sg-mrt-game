function splitCamelCase(value) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function normalizeAnswer(value) {
  return splitCamelCase(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactValue(value) {
  return value.replace(/\s+/g, "");
}

function isSubsequence(query, target) {
  let queryIndex = 0;

  for (const char of target) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
    }

    if (queryIndex === query.length) {
      return true;
    }
  }

  return queryIndex === query.length;
}

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, columnIndex) => {
      if (rowIndex === 0) {
        return columnIndex;
      }

      if (columnIndex === 0) {
        return rowIndex;
      }

      return 0;
    }),
  );

  for (let rowIndex = 1; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex < cols; columnIndex += 1) {
      const substitutionCost = a[rowIndex - 1] === b[columnIndex - 1] ? 0 : 1;

      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + substitutionCost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function buildStationIndex(station) {
  const normalized = normalizeAnswer(station.name);
  const compact = compactValue(normalized);

  return {
    ...station,
    normalized,
    compact,
    tokens: normalized.split(" "),
  };
}

function compareSuggestions(left, right) {
  if (left.matchTier !== right.matchTier) {
    return left.matchTier - right.matchTier;
  }

  if (left.editDistance !== right.editDistance) {
    return left.editDistance - right.editDistance;
  }

  if (left.name.length !== right.name.length) {
    return left.name.length - right.name.length;
  }

  return left.name.localeCompare(right.name);
}

export function getSuggestions(stations, query, limit = 8) {
  const normalizedQuery = normalizeAnswer(query);
  const compactQuery = compactValue(normalizedQuery);

  if (!compactQuery) {
    return [];
  }

  return stations
    .map(buildStationIndex)
    .map((station) => {
      let matchTier = 99;

      if (station.normalized === normalizedQuery || station.compact === compactQuery) {
        matchTier = 0;
      } else if (station.normalized.startsWith(normalizedQuery) || station.compact.startsWith(compactQuery)) {
        matchTier = 1;
      } else if (station.tokens.some((token) => token.startsWith(normalizedQuery))) {
        matchTier = 2;
      } else if (station.normalized.includes(normalizedQuery) || station.compact.includes(compactQuery)) {
        matchTier = 3;
      } else if (isSubsequence(compactQuery, station.compact)) {
        matchTier = 4;
      }

      return {
        ...station,
        matchTier,
        editDistance: editDistance(compactQuery, station.compact),
      };
    })
    .filter((station) => station.matchTier < 5 || station.editDistance <= 2)
    .sort(compareSuggestions)
    .slice(0, limit)
    .map(({ id, name, code, matchTier, editDistance }) => ({
      id,
      name,
      code,
      matchTier,
      editDistance,
    }));
}

export function isCorrectGuess({ input, selectedSuggestionId, suggestions, targetStation }) {
  if (!targetStation) {
    return false;
  }

  if (selectedSuggestionId === targetStation.id) {
    return true;
  }

  const normalizedInput = normalizeAnswer(input);
  const compactInput = compactValue(normalizedInput);
  const normalizedTarget = normalizeAnswer(targetStation.name);
  const compactTarget = compactValue(normalizedTarget);

  if (!compactInput) {
    return false;
  }

  if (normalizedInput === normalizedTarget || compactInput === compactTarget) {
    return true;
  }

  const topSuggestion = suggestions[0];
  const nextSuggestion = suggestions[1];

  if (!topSuggestion || topSuggestion.id !== targetStation.id) {
    return false;
  }

  const isUniqueTopSuggestion =
    !nextSuggestion
    || topSuggestion.matchTier < nextSuggestion.matchTier
    || (
      topSuggestion.matchTier === nextSuggestion.matchTier
      && topSuggestion.editDistance < nextSuggestion.editDistance
    );

  if (!isUniqueTopSuggestion) {
    return false;
  }

  const allowedDistance = compactInput.length <= 4 ? 1 : 2;
  return topSuggestion.editDistance <= allowedDistance;
}
