import React from 'react';

export function HudFilters({ filterType, onFilterChange, onClearSelection }) {
  return (
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
  );
}
