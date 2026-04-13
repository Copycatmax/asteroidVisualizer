import React from 'react';
import { TimelineScrubber } from './TimelineScrubber';

export function FooterControls({ activeYear, setActiveYear, loading, dataCount, isRecentered, onRecenter, onReturnToEarth }) {
  return (
    <>
      <footer className="hud-footer">
        <TimelineScrubber activeYear={activeYear} setActiveYear={setActiveYear} />
        <div className="status-glass status-inline">
          {loading ? 'Fetching Subsystems...' : `Loaded ${dataCount} Close Approaches for ${activeYear}`}
        </div>
      </footer>

      <div className="hud-actions">
        <button
          className="recenter-btn"
          onClick={isRecentered ? onReturnToEarth : onRecenter}
        >
          {isRecentered ? '⊕ Return to Earth' : '☉ Recenter to Sun'}
        </button>
      </div>
    </>
  );
}
