import React, { useState, useCallback } from 'react';
import { SpaceCanvas } from './components/SpaceCanvas';
import { TimelineScrubber } from './components/TimelineScrubber';
import { useDataChunker } from './hooks/useDataChunker';
import './index.css';

function App() {
  const [activeYear, setActiveYear] = useState(2024);
  const [filterType, setFilterType] = useState('ALL');
  const [selection, setSelection] = useState(null);
  const [isRecentered, setIsRecentered] = useState(false);
  
  const { data, loading } = useDataChunker(activeYear);

  const handleRecenter = useCallback(() => {
    setIsRecentered(true);
  }, []);

  const handleReturnToEarth = useCallback(() => {
    setIsRecentered(false);
  }, []);

  const handleSelectOrbit = useCallback((orbit) => {
    setSelection({ kind: 'orbit', payload: orbit });
  }, []);

  const handleSelectApproach = useCallback((approach) => {
    setSelection({ kind: 'approach', payload: approach });
  }, []);

  const selectedOrbit = selection?.kind === 'orbit' ? selection.payload : null;
  const selectedApproach = selection?.kind === 'approach' ? selection.payload : null;

  return (
    <div className="app-container">
      {/* UI Overlay */}
      <header className="hud-header">
        <div className="title-glass">
          <h1>NEAR-EARTH ASTEROIDS</h1>
          <p className="subtitle">41,000+ Objects | 0.05 AU Hazard Limit</p>
          
          <div className="filter-controls">
            <button className={filterType === 'ALL' ? 'active' : ''} onClick={() => setFilterType('ALL')}>All</button>
            <button className={filterType === 'NONE' ? 'active' : ''} onClick={() => { setFilterType('NONE'); setSelection(null); }}>Hide Asteroids</button>
            <button className={filterType === 'PHA' ? 'active pha' : ''} onClick={() => setFilterType('PHA')}>Collision Risks (PHA)</button>
            <button className={filterType === 'SAFE' ? 'active safe' : ''} onClick={() => setFilterType('SAFE')}>Safe Orbits</button>
          </div>
          <div style={{ marginTop: '12px' }}>
            <input 
              type="text" 
              placeholder="Search by Name or SPK-ID..." 
              style={{
                width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.5)', 
                border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px'
              }}
              onChange={(e) => window.dispatchEvent(new CustomEvent('SEARCH_ASTEROID', { detail: e.target.value }))}
            />
          </div>
        </div>
        
        {/* Updated Legend */}
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

      {/* Selected Data HUD */}
      {selection && (
        <div className="data-panel-glass">
            <h2>{selection.kind === 'orbit' ? `Asteroid Data (SPK-ID: ${selectedOrbit[0]})` : 'Close Approach Event'}</h2>
            <div className="data-grid">
                {selection.kind === 'orbit' && selectedOrbit[8] && <div><strong>Name:</strong> {selectedOrbit[8]}</div>}
                {selection.kind === 'orbit' && <div><strong>Orbit (a):</strong> {selectedOrbit[1].toFixed(3)} AU</div>}
                {selection.kind === 'orbit' && <div><strong>Eccentricity:</strong> {selectedOrbit[2].toFixed(3)}</div>}
                {selection.kind === 'orbit' && <div><strong>Magnitude (H):</strong> {selectedOrbit[6].toFixed(2)}</div>}
                {selection.kind === 'orbit' && <div><strong>Hazardous:</strong> {selectedOrbit[7] ? 'YES' : 'NO'}</div>}

                {selection.kind === 'approach' && <div><strong>Name:</strong> {selectedApproach[0] || 'Unknown'}</div>}
                {selection.kind === 'approach' && <div><strong>Date:</strong> {new Date(selectedApproach[1]).toLocaleString()}</div>}
                {selection.kind === 'approach' && <div><strong>Distance:</strong> {selectedApproach[2].toFixed(5)} AU</div>}
                {selection.kind === 'approach' && <div><strong>Velocity:</strong> {selectedApproach[3].toFixed(2)} km/s</div>}
                {selection.kind === 'approach' && <div><strong>Magnitude (H):</strong> {selectedApproach[4].toFixed(2)}</div>}
                {selection.kind === 'approach' && <div><strong>Threat:</strong> {selectedApproach[2] <= 0.01 ? 'CRITICAL' : selectedApproach[2] <= 0.05 ? 'WARNING' : 'SAFE'}</div>}
            </div>
            <button className="close-btn" onClick={() => setSelection(null)}>Close</button>
        </div>
      )}
      
      {/* 3D WebGL Background */}
      <SpaceCanvas 
        approachesData={data} 
        filterType={filterType} 
        selectedOrbit={selectedOrbit} 
        onSelectOrbit={handleSelectOrbit}
        onSelectApproach={handleSelectApproach}
        activeYear={activeYear}
        isRecentered={isRecentered}
      />

      <footer className="hud-footer">
        <TimelineScrubber activeYear={activeYear} setActiveYear={setActiveYear} />
        <div className="status-glass" style={{ marginTop: '12px', display: 'inline-block' }}>
          {loading ? 'Fetching Subsystems...' : `Loaded ${data.length} Close Approaches for ${activeYear}`}
        </div>
      </footer>

      {/* Recenter Button */}
      <div className="hud-actions">
        <button
          className="recenter-btn"
          onClick={isRecentered ? handleReturnToEarth : handleRecenter}
        >
          {isRecentered ? '⊕ Return to Earth' : '☉ Recenter to Sun'}
        </button>
      </div>
    </div>
  );
}

export default App;
