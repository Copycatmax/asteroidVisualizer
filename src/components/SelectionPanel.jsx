import React from 'react';

export function SelectionPanel({ selection, onClose }) {
  if (!selection) return null;

  const isOrbit = selection.kind === 'orbit';
  const payload = selection.payload;

  return (
    <div className="data-panel-glass">
      <h2>{isOrbit ? `Asteroid Data (SPK-ID: ${payload[0]})` : 'Close Approach Event'}</h2>
      <div className="data-grid">
        {isOrbit && payload[8] && <div><strong>Name:</strong> {payload[8]}</div>}
        {isOrbit && <div><strong>Orbit (a):</strong> {payload[1].toFixed(3)} AU</div>}
        {isOrbit && <div><strong>Eccentricity:</strong> {payload[2].toFixed(3)}</div>}
        {isOrbit && <div><strong>Magnitude (H):</strong> {payload[6].toFixed(2)}</div>}
        {isOrbit && <div><strong>Hazardous:</strong> {payload[7] ? 'YES' : 'NO'}</div>}
        {isOrbit && (
          <div>
            <strong>Orbit Orientation:</strong>{' '}
            {payload[10] === 2
              ? 'Authoritative SBDB ephemeris'
              : payload[10] === 1
                ? 'Data-fitted from close approaches'
                : 'Deterministic fallback (insufficient records)'}
          </div>
        )}
        {isOrbit && Number.isFinite(payload[11]) && <div><strong>Fit Events:</strong> {payload[11]}</div>}
        {isOrbit && Number.isFinite(payload[12]) && <div><strong>Fit RMSE:</strong> {payload[12].toFixed(4)} AU</div>}

        {!isOrbit && <div><strong>Name:</strong> {payload[0] || 'Unknown'}</div>}
        {!isOrbit && <div><strong>Date:</strong> {new Date(payload[1]).toLocaleString()}</div>}
        {!isOrbit && <div><strong>Distance:</strong> {payload[2].toFixed(5)} AU</div>}
        {!isOrbit && <div><strong>Velocity:</strong> {payload[3].toFixed(2)} km/s</div>}
        {!isOrbit && <div><strong>Magnitude (H):</strong> {payload[4].toFixed(2)}</div>}
        {!isOrbit && (
          <div>
            <strong>Threat:</strong> {payload[2] <= 0.01 ? 'CRITICAL' : payload[2] <= 0.05 ? 'WARNING' : 'SAFE'}
          </div>
        )}
      </div>
      <button className="close-btn" onClick={onClose}>Close</button>
    </div>
  );
}
