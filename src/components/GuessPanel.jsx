import { useEffect, useRef } from "react";

function GuessPanel({
  accuracy,
  answerInput,
  attempts,
  highlightedSuggestionIndex,
  hintText,
  hintsEnabled,
  onChangeInput,
  onHighlightSuggestion,
  onInputKeyDown,
  onSelectSuggestion,
  onSubmit,
  onToggleHints,
  promptCopy,
  promptTitle,
  selectedStationId,
  selectedStationPrompt,
  solvedCount,
  statusText,
  statusTone,
  suggestions,
  totalCount,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (selectedStationId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [selectedStationId]);

  return (
    <aside className="side-panel">
      <section className="prompt-card">
        <p className="card-kicker">Current Task</p>
        <h2>{promptTitle}</h2>
        <p className="panel-copy">{promptCopy}</p>
      </section>

      <section className="question-card">
        <div className="question-topline">
          <p className="card-kicker">Station Guess</p>
          <span className="attempt-pill">
            {attempts} {attempts === 1 ? "attempt" : "attempts"}
          </span>
        </div>

        <h3>{selectedStationPrompt}</h3>
        <div
          className={`status-text${statusTone === "success" ? " success" : ""}${statusTone === "error" ? " error" : ""}`}
        >
          {statusText}
        </div>

        <div className="hint-row">
          <button
            type="button"
            className={`hint-toggle${hintsEnabled ? " active" : ""}`}
            aria-pressed={hintsEnabled}
            onClick={onToggleHints}
          >
            Auto hints after 5s: {hintsEnabled ? "On" : "Off"}
          </button>
        </div>

        <form className="guess-form" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="station-answer">
            Type the station name
          </label>
          <input
            ref={inputRef}
            id="station-answer"
            className="guess-input"
            type="text"
            placeholder="Type the station name"
            value={answerInput}
            disabled={!selectedStationId}
            autoComplete="off"
            spellCheck="false"
            onChange={(event) => onChangeInput(event.target.value)}
            onKeyDown={onInputKeyDown}
            aria-expanded={suggestions.length > 0}
            aria-controls="station-suggestions"
          />
          <button className="primary-button submit-button" type="submit" disabled={!selectedStationId}>
            Submit Guess
          </button>
        </form>

        {hintText && (
          <div className="hint-card" role="status" aria-live="polite">
            <p className="card-kicker">Hint</p>
            <p>{hintText}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <ul id="station-suggestions" className="suggestions-list" role="listbox" aria-label="Station suggestions">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className={`suggestion-button${index === highlightedSuggestionIndex ? " active" : ""}`}
                  onMouseEnter={() => onHighlightSuggestion(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSuggestion(suggestion)}
                >
                  <span>{suggestion.name}</span>
                  <small>{suggestion.code}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="progress-card">
        <p className="card-kicker">Progress</p>
        <div className="progress-bar" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${(solvedCount / totalCount) * 100}%` }} />
        </div>
        <p className="panel-copy">
          {solvedCount} of {totalCount} stations revealed.
        </p>
        <p className="panel-copy accuracy-copy">Accuracy: {accuracy}%</p>
      </section>
    </aside>
  );
}

export default GuessPanel;
