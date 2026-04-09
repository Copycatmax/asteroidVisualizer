import React from 'react';

export function TimelineScrubber({ activeYear, setActiveYear }) {
  return (
    <div className="scrubber-glass">
      <div className="scrubber-header">
        <span className="year-label">2015</span>
        <span className="current-year-display">{activeYear}</span>
        <span className="year-label">2035</span>
      </div>
      <input 
        type="range" 
        min="2015" 
        max="2035" 
        step="1" 
        value={activeYear}
        onChange={(e) => setActiveYear(parseInt(e.target.value, 10))}
        className="year-slider"
      />
    </div>
  );
}
