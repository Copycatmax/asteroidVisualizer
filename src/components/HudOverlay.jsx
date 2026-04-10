import React from 'react';

export function HudOverlay({ filterType, onFilterChange, onClearSelection }) {
  return (
    <header className="hud-header">
      <div className="title-glass">
        <h1>NEAR-EARTH ASTEROIDS</h1>
        <p className="subtitle">41,000+ Objects | 0.05 AU Hazard Limit</p>

        <div className="filter-controls">
          <button className={filterType === 'ALL' ? 'active' : ''} onClick={() => onFilterChange('ALL')}>All</button>
          <button
            className={filterType === 'NONE' ? 'active' : ''}
            onClick={() => {
              onFilterChange('NONE');
              onClearSelection();
            }}
          >
            Hide Asteroids
          </button>
          <button className={filterType === 'PHA' ? 'active pha' : ''} onClick={() => onFilterChange('PHA')}>Collision Risks (PHA)</button>
          <button className={filterType === 'SAFE' ? 'active safe' : ''} onClick={() => onFilterChange('SAFE')}>Safe Orbits</button>
        </div>
        <div className="search-wrap">
          <input
            type="text"
            placeholder="Search by Name or SPK-ID..."
            className="search-input"
            onChange={(e) => window.dispatchEvent(new CustomEvent('SEARCH_ASTEROID', { detail: e.target.value }))}
          />
        </div>
      </div>

      <div className="legend-glass">
        <div className="legend-section-label">Orbital Swarm</div>
        <div className="legend-item">
          <span className="dot pha-dot"></span> Potentially Hazardous
        </div>
        <div className="legend-item">
          <span className="dot safe-dot"></span> Near-Earth Object
        </div>
        <div className="legend-divider"></div>
        <div className="legend-section-label">Close Approaches</div>
        <div className="legend-item">
          <span className="dot close-red"></span> &lt; 0.01 AU (Critical)
        </div>
        <div className="legend-item">
          <span className="dot close-orange"></span> &lt; 0.05 AU (Warning)
        </div>
        <div className="legend-item">
          <span className="dot close-green"></span> &gt; 0.05 AU (Safe)
        </div>
      </div>
    </header>
  );
}
