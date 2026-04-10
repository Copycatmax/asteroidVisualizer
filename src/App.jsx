import React, { useState, useCallback } from 'react';
import { SpaceCanvas } from './components/SpaceCanvas';
import { HudOverlay } from './components/HudOverlay';
import { SelectionPanel } from './components/SelectionPanel';
import { FooterControls } from './components/FooterControls';
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

  return (
    <div className="app-container">
      {/* UI Overlay */}
      <HudOverlay filterType={filterType} onFilterChange={setFilterType} onClearSelection={() => setSelection(null)} />

      {/* Selected Data HUD */}
      <SelectionPanel selection={selection} onClose={() => setSelection(null)} />
      
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

      <FooterControls
        activeYear={activeYear}
        setActiveYear={setActiveYear}
        loading={loading}
        dataCount={data.length}
        isRecentered={isRecentered}
        onRecenter={handleRecenter}
        onReturnToEarth={handleReturnToEarth}
      />
    </div>
  );
}

export default App;
