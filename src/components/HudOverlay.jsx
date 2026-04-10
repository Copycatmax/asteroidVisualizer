import React from 'react';
import { HudFilters } from './HudFilters';
import { HudSearchBox } from './HudSearchBox';
import { LegendPanel } from './LegendPanel';

export function HudOverlay({ filterType, onFilterChange, onClearSelection, searchTerm, onSearchChange }) {
  return (
    <header className="hud-header">
      <div className="title-glass">
        <h1>NEAR-EARTH ASTEROIDS</h1>
        <p className="subtitle">41,000+ Objects | 0.05 AU Hazard Limit</p>

        <HudFilters
          filterType={filterType}
          onFilterChange={onFilterChange}
          onClearSelection={onClearSelection}
        />
        <HudSearchBox searchTerm={searchTerm} onSearchChange={onSearchChange} />
      </div>

      <LegendPanel />
    </header>
  );
}
