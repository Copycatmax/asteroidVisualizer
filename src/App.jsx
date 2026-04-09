import React from 'react';
import { SpaceCanvas } from './components/SpaceCanvas';
import './index.css';

function App() {
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
        </div>
      </header>
      
      {/* 3D WebGL Background */}
      <SpaceCanvas />

      {/* Scrubber will go here in Phase 3 */}
      <footer className="hud-footer">
        <div className="status-glass">
          Data Loaded: orbits.json • Systems Nominal
        </div>
      </footer>
    </div>
  );
}

export default App;
