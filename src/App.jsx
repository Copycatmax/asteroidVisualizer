import React, { useState } from 'react';
import { SpaceCanvas } from './components/SpaceCanvas';
import { TimelineScrubber } from './components/TimelineScrubber';
import { useDataChunker } from './hooks/useDataChunker';
import './index.css';

function App() {
  const [activeYear, setActiveYear] = useState(2024);
  const { data, loading } = useDataChunker(activeYear);

  return (
    <div className="app-container">
      {/* UI Overlay */}
      <header className="hud-header">
        <div className="title-glass">
          <h1>NEAR-EARTH ASTEROIDS</h1>
          <p className="subtitle">41,000+ Objects | 0.05 AU Hazard Limit</p>
        </div>
        <div className="legend-glass">
          <div className="legend-item">
            <span className="dot pha-dot"></span> Potentially Hazardous
          </div>
          <div className="legend-item">
            <span className="dot safe-dot"></span> Orbiting Body
          </div>
          <div className="legend-item" style={{marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px'}}>
            <span className="dot close-red"></span> &lt; 0.01 AU Approach
          </div>
          <div className="legend-item">
            <span className="dot close-orange"></span> &lt; 0.05 AU Approach
          </div>
        </div>
      </header>
      
      {/* 3D WebGL Background */}
      <SpaceCanvas approachesData={data} />

      <footer className="hud-footer">
        <TimelineScrubber activeYear={activeYear} setActiveYear={setActiveYear} />
        <div className="status-glass" style={{ marginTop: '12px', display: 'inline-block' }}>
          {loading ? 'Fetching Subsystems...' : `Loaded ${data.length} Close Approaches for ${activeYear}`}
        </div>
      </footer>
    </div>
  );
}

export default App;
