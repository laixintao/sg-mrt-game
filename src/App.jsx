import { useMemo, useState } from "react";
import GuessPanel from "./components/GuessPanel.jsx";
import MapPanel from "./components/MapPanel.jsx";
import { coastlinePolygons, waterLabels, waterPolygons } from "./data/geographicBackgroundData.js";
import * as geographicMapData from "./data/geographicMapData.js";
import * as schematicMapData from "./data/schematicMapData.js";
import { getSuggestions, isCorrectGuess } from "./lib/answerMatching.js";

const stationLookup = new Map(geographicMapData.stations.map((station) => [station.id, station]));
const backgroundData = { coastlinePolygons, waterPolygons, waterLabels };
const mapDataByMode = {
  geographic: geographicMapData,
  schematic: schematicMapData,
};
const lineOrder = ["nsl", "ewl", "nel", "ccl", "dtl", "tel"];

function stationCodeValue(station, prefix) {
  const code = station.code.split("/").find((entry) => entry.startsWith(prefix));

  if (!code) {
    return null;
  }

  const numeric = Number.parseInt(code.slice(prefix.length), 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function getLineSequence(prefix) {
  return geographicMapData.stations
    .filter((station) => stationCodeValue(station, prefix) !== null)
    .sort((left, right) => stationCodeValue(left, prefix) - stationCodeValue(right, prefix))
    .map((station) => station.id);
}

const lineSequencesById = {
  nsl: [getLineSequence("NS")],
  ewl: [
    getLineSequence("EW"),
    ["tanah-merah", ...getLineSequence("CG")],
  ],
  nel: [getLineSequence("NE")],
  ccl: [
    getLineSequence("CC"),
    ["promenade", ...getLineSequence("CE")],
  ],
  dtl: [getLineSequence("DT")],
  tel: [getLineSequence("TE")],
};

const lineTraversalById = Object.fromEntries(
  Object.entries(lineSequencesById).map(([lineId, sequences]) => [lineId, [...new Set(sequences.flat())]]),
);

function countRemainingStationsOnLine(lineId, solved) {
  return lineTraversalById[lineId].filter((stationId) => !solved.has(stationId)).length;
}

function pickLineForStation(stationId, solved, preferredLineId) {
  const station = stationLookup.get(stationId);

  if (!station) {
    return null;
  }

  if (
    preferredLineId
    && station.lines.includes(preferredLineId)
    && countRemainingStationsOnLine(preferredLineId, solved) > 0
  ) {
    return preferredLineId;
  }

  const [bestLineId] = [...station.lines]
    .map((lineId) => [lineId, countRemainingStationsOnLine(lineId, solved)])
    .filter(([, remaining]) => remaining > 0)
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1];
      }

      return lineOrder.indexOf(left[0]) - lineOrder.indexOf(right[0]);
    })[0] ?? [];

  return bestLineId ?? null;
}

function getDirectionalCandidate(sequence, currentIndex, direction, solved) {
  for (
    let nextIndex = currentIndex + direction;
    nextIndex >= 0 && nextIndex < sequence.length;
    nextIndex += direction
  ) {
    const stationId = sequence[nextIndex];

    if (!solved.has(stationId)) {
      return {
        stationId,
        direction,
        distance: Math.abs(nextIndex - currentIndex),
      };
    }
  }

  return null;
}

function getNextStationOnLine(currentStationId, solved, lineId, lineDirection = 0) {
  const sequences = lineSequencesById[lineId].filter((sequence) => sequence.includes(currentStationId));

  if (!sequences.length) {
    return null;
  }

  const searchDirections = lineDirection === 0 ? [1, -1] : [lineDirection, lineDirection * -1];
  const candidates = [];

  for (const sequence of sequences) {
    const currentIndex = sequence.indexOf(currentStationId);

    for (const direction of searchDirections) {
      const candidate = getDirectionalCandidate(sequence, currentIndex, direction, solved);

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }

    if (left.direction !== right.direction) {
      return searchDirections.indexOf(left.direction) - searchDirections.indexOf(right.direction);
    }

    return left.stationId.localeCompare(right.stationId);
  })[0];
}

function getFirstStationOnLine(lineId, solved) {
  const traversal = lineTraversalById[lineId];

  if (!traversal) {
    return null;
  }

  const stationId = traversal.find((candidateId) => !solved.has(candidateId));
  return stationId ? { stationId, direction: 1 } : null;
}

function getNextLineId(solved, excludedLineId) {
  const rankedLines = lineOrder
    .filter((lineId) => lineId !== excludedLineId)
    .map((lineId) => [lineId, countRemainingStationsOnLine(lineId, solved)])
    .filter(([, remaining]) => remaining > 0)
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1];
      }

      return lineOrder.indexOf(left[0]) - lineOrder.indexOf(right[0]);
    });

  return rankedLines[0]?.[0] ?? null;
}

function getNextAutoSelection(currentStationId, solved, preferredLineId, currentLineDirection) {
  const lineId = pickLineForStation(currentStationId, solved, preferredLineId);

  if (lineId) {
    const nextOnSameLine = getNextStationOnLine(currentStationId, solved, lineId, currentLineDirection);

    if (nextOnSameLine) {
      return {
        stationId: nextOnSameLine.stationId,
        lineId,
        lineDirection: nextOnSameLine.direction,
      };
    }
  }

  const nextLineId = getNextLineId(solved, lineId ?? preferredLineId);

  if (!nextLineId) {
    return {
      stationId: null,
      lineId: null,
      lineDirection: 0,
    };
  }

  const nextOnAnotherLine = getFirstStationOnLine(nextLineId, solved);

  return {
    stationId: nextOnAnotherLine?.stationId ?? null,
    lineId: nextOnAnotherLine ? nextLineId : null,
    lineDirection: nextOnAnotherLine?.direction ?? 0,
  };
}

function getInitialState() {
  return {
    mapMode: "geographic",
    selectedStationId: null,
    currentLineId: null,
    currentLineDirection: 0,
    solved: new Set(),
    attempts: 0,
    correct: 0,
    answerInput: "",
    suggestions: [],
    highlightedSuggestionIndex: 0,
    statusText: "Select a station dot to start guessing.",
    statusTone: "idle",
    promptTitle: "Click a station on the map",
    promptCopy: "Pick any unsolved station dot, then type its name with autocomplete.",
    completed: false,
  };
}

function App() {
  const [game, setGame] = useState(getInitialState);

  const solvedCount = game.solved.size;
  const totalCount = geographicMapData.stations.length;
  const remainingCount = totalCount - solvedCount;
  const accuracy = game.attempts === 0 ? 100 : Math.round((game.correct / game.attempts) * 100);
  const mapData = game.mapMode === "schematic" ? schematicMapData : geographicMapData;
  const selectedStation = game.selectedStationId ? stationLookup.get(game.selectedStationId) : null;

  const guessPanelTitle = selectedStation
    ? "Guess This Station"
    : game.completed
      ? "Full map solved"
      : "No station selected";

  const visibleSuggestions = useMemo(
    () => game.suggestions.slice(0, 8),
    [game.suggestions],
  );

  function updateSuggestions(answerInput) {
    return getSuggestions(geographicMapData.stations, answerInput, 8);
  }

  function selectStation(stationId) {
    setGame((current) => {
      if (current.solved.has(stationId)) {
        return {
          ...current,
          statusText: "That station is already solved. Pick another hidden dot.",
          statusTone: "idle",
        };
      }

      return {
        ...current,
        selectedStationId: stationId,
        currentLineId: pickLineForStation(stationId, current.solved, current.currentLineId),
        currentLineDirection: 0,
        answerInput: "",
        suggestions: [],
        highlightedSuggestionIndex: 0,
        statusText: "Type the station name below.",
        statusTone: "idle",
        promptTitle: "Guess the selected station",
        promptCopy: "Use the input and autocomplete to submit your answer.",
        completed: false,
      };
    });
  }

  function setMapMode(nextMode) {
    setGame((current) => ({
      ...current,
      mapMode: nextMode,
    }));
  }

  function changeAnswerInput(value) {
    setGame((current) => ({
      ...current,
      answerInput: value,
      suggestions: current.selectedStationId ? updateSuggestions(value) : [],
      highlightedSuggestionIndex: 0,
      statusText: current.selectedStationId ? "Type the station name below." : current.statusText,
      statusTone: current.selectedStationId ? "idle" : current.statusTone,
    }));
  }

  function submitAnswer(selection) {
    setGame((current) => {
      if (!current.selectedStationId || current.solved.has(current.selectedStationId)) {
        return current;
      }

      const targetStation = stationLookup.get(current.selectedStationId);
      const inputValue = selection?.name ?? current.answerInput;
      const selectedSuggestionId = selection?.id ?? null;
      const isCorrect = isCorrectGuess({
        input: inputValue,
        selectedSuggestionId,
        suggestions: current.suggestions,
        targetStation,
      });
      const nextAttempts = current.attempts + 1;

      if (!isCorrect) {
        return {
          ...current,
          attempts: nextAttempts,
          answerInput: inputValue,
          suggestions: updateSuggestions(inputValue),
          highlightedSuggestionIndex: 0,
          statusText: "That guess is not correct. Adjust the name and try again.",
          statusTone: "error",
        };
      }

      const nextSolved = new Set(current.solved);
      nextSolved.add(current.selectedStationId);
      const completed = nextSolved.size === geographicMapData.stations.length;
      const nextAutoSelection = completed
        ? { stationId: null, lineId: null, lineDirection: 0 }
        : getNextAutoSelection(
            current.selectedStationId,
            nextSolved,
            current.currentLineId,
            current.currentLineDirection,
          );

      return {
        ...current,
        solved: nextSolved,
        attempts: nextAttempts,
        correct: current.correct + 1,
        selectedStationId: nextAutoSelection.stationId,
        currentLineId: nextAutoSelection.lineId,
        currentLineDirection: nextAutoSelection.lineDirection,
        answerInput: "",
        suggestions: [],
        highlightedSuggestionIndex: 0,
        statusText: completed
          ? `${targetStation.name} is correct. Station revealed on the map.`
          : `${targetStation.name} is correct. Next station selected automatically.`,
        statusTone: "success",
        promptTitle: completed ? "Full map revealed." : "Guess the next station",
        promptCopy: completed
          ? "You solved every station on the board."
          : "Keep typing station names to reveal the rest of the network.",
        completed,
      };
    });
  }

  function handleSuggestionSelect(suggestion) {
    submitAnswer(suggestion);
  }

  function handleInputKeyDown(event) {
    if (!visibleSuggestions.length && event.key !== "Enter") {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setGame((current) => ({
        ...current,
        highlightedSuggestionIndex:
          current.suggestions.length === 0
            ? 0
            : (current.highlightedSuggestionIndex + 1) % current.suggestions.length,
      }));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setGame((current) => ({
        ...current,
        highlightedSuggestionIndex:
          current.suggestions.length === 0
            ? 0
            : (current.highlightedSuggestionIndex - 1 + current.suggestions.length) % current.suggestions.length,
      }));
    }

    if (event.key === "Escape") {
      setGame((current) => ({
        ...current,
        suggestions: [],
        highlightedSuggestionIndex: 0,
      }));
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const highlightedSuggestion = visibleSuggestions[game.highlightedSuggestionIndex];
      submitAnswer(highlightedSuggestion);
    }
  }

  function setHighlightedSuggestion(index) {
    setGame((current) => ({
      ...current,
      highlightedSuggestionIndex: index,
    }));
  }

  function resetGame() {
    setGame(getInitialState());
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    submitAnswer();
  }

  return (
    <>
      <div className="page-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">React + Vite</p>
            <h1>Singapore MRT Map Quiz</h1>
            <p className="subtitle">
              Click a station dot, type the station name with autocomplete, and reveal the
              full network in geographic or official-style schematic view.
            </p>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-label">Solved</span>
              <strong>{solvedCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Remaining</span>
              <strong>{remainingCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Accuracy</span>
              <strong>{accuracy}%</strong>
            </div>
          </div>
        </header>

        <main className="game-layout">
          <MapPanel
            backgroundData={backgroundData}
            mapData={mapData}
            mapMode={game.mapMode}
            onModeChange={setMapMode}
            onReset={resetGame}
            onSelectStation={selectStation}
            selectedStationId={game.selectedStationId}
            solved={game.solved}
          />

          <GuessPanel
            accuracy={accuracy}
            answerInput={game.answerInput}
            attempts={game.attempts}
            highlightedSuggestionIndex={game.highlightedSuggestionIndex}
            onChangeInput={changeAnswerInput}
            onHighlightSuggestion={setHighlightedSuggestion}
            onInputKeyDown={handleInputKeyDown}
            onSelectSuggestion={handleSuggestionSelect}
            onSubmit={handleFormSubmit}
            promptCopy={game.promptCopy}
            promptTitle={game.promptTitle}
            selectedStationId={game.selectedStationId}
            selectedStationPrompt={guessPanelTitle}
            solvedCount={solvedCount}
            statusText={game.statusText}
            statusTone={game.statusTone}
            suggestions={visibleSuggestions}
            totalCount={totalCount}
          />
        </main>
      </div>

      {game.completed && (
        <div className="completion-modal" role="dialog" aria-modal="true">
          <div className="completion-card">
            <p className="eyebrow">Map Complete</p>
            <h2>You revealed the full MRT map.</h2>
            <p className="panel-copy">
              You revealed {totalCount} stations with {accuracy}% accuracy across {game.attempts} attempts.
            </p>
            <button className="primary-button" type="button" onClick={resetGame}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
