import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

const AU_TO_UNITS = 20;

export function CloseApproaches({ data }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!meshRef.current || !data || data.length === 0) return;

    for (let i = 0; i < data.length; i++) {
        // [name, timestamp_ms, distance_au, velocity_kms, H]
        const event = data[i];
        const distAu = event[2];
        const H = event[4];

        // Radius from earth
        const r = distAu * AU_TO_UNITS;
        
        // Random spherical coordinate distribution for distance map
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        dummy.position.set(x, y, z);
        
        // Scale based on magnitude
        let sizeScale = Math.max(0.08, (25 - H) * 0.05);
        // Make very close objects more pronounced
        if (distAu < 0.05) sizeScale *= 1.5;

        dummy.scale.set(sizeScale, sizeScale, sizeScale);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        // Color coding by proximity hazard level
        if (distAu <= 0.01) {
            color.set('#ff0000'); // Extreme close (red)
        } else if (distAu <= 0.05) {
            color.set('#ffaa00'); // Warning (orange)
        } else {
            color.set('#00ffaa'); // Safe approach (cyan/green)
        }
        meshRef.current.setColorAt(i, color);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor.needsUpdate = true;
  }, [data, dummy, color]);

  if (!data || data.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[null, null, data.length]}>
      <sphereGeometry args={[1, 16, 16]} />
      {/* Basic Material since it relies purely on instanceColor */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
