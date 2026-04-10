import React from 'react';

export function HudSearchBox({ searchTerm, onSearchChange }) {
  return (
    <div className="search-wrap">
      <input
        type="text"
        placeholder="Search by Name or SPK-ID..."
        className="search-input"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
