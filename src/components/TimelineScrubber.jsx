import React from 'react';

export function TimelineScrubber({ activeYear, setActiveYear }) {
  const MIN_YEAR = 2015;
  const MAX_YEAR = 2035;

  const stepYear = (delta) => {
    const next = Math.min(MAX_YEAR, Math.max(MIN_YEAR, activeYear + delta));
    setActiveYear(next);
  };

  return (
    <div className="scrubber-glass">
      <div className="scrubber-header">
        <span className="year-label">{MIN_YEAR}</span>
        <span className="current-year-display">{activeYear}</span>
        <span className="year-label">{MAX_YEAR}</span>
      </div>
      <div className="year-controls-row">
        <button
          type="button"
          className="year-step-btn"
          onClick={() => stepYear(-1)}
          disabled={activeYear <= MIN_YEAR}
          aria-label="Previous year"
          title="Previous year"
        >
          ◀
        </button>
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step="1"
          value={activeYear}
          onChange={(e) => setActiveYear(parseInt(e.target.value, 10))}
          className="year-slider"
        />
        <button
          type="button"
          className="year-step-btn"
          onClick={() => stepYear(1)}
          disabled={activeYear >= MAX_YEAR}
          aria-label="Next year"
          title="Next year"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
