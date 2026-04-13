import React from 'react';

export function LegendPanel() {
  return (
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
  );
}
