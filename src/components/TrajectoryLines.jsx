import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { stablePhaseOffset } from '../utils/orbitMath';

const AU_TO_UNITS = 20;

export function TrajectoryLines({ orbit, activeYear }) {
  const glowRef = useRef();

  const { points, staticPosition } = useMemo(() => {
    if (!orbit) return { points: [] };
    
    // [spkid, a, e, i, om, w, H, pha_int]
    const aVal = orbit[1] * AU_TO_UNITS;
    const eVal = orbit[2];
    const inc = orbit[3];
    const om = orbit[4];
    const w = orbit[5];

    const pts = [];
    const segments = 128;
    
    const cosw = Math.cos(w), sinw = Math.sin(w);
    const cosi = Math.cos(inc), sini = Math.sin(inc);
    const cosom = Math.cos(om), sinom = Math.sin(om);

    for (let i = 0; i <= segments; i++) {
        const E = (i / segments) * Math.PI * 2;
        
        const x_ecc = aVal * (Math.cos(E) - eVal);
        const y_ecc = aVal * Math.sqrt(1 - eVal * eVal) * Math.sin(E);

        const xPlane = x_ecc * cosw - y_ecc * sinw;
        const yPlane = x_ecc * sinw + y_ecc * cosw;

        const nx = cosom * xPlane - sinom * cosi * yPlane;
        const ny = sinom * xPlane + cosom * cosi * yPlane;
        const nz = sini * yPlane;

        pts.push(new THREE.Vector3(nx, nz, ny));
    }
    
    // Calculate static position of the asteroid itself based on precise elapsed time!
    const periodYears = Math.sqrt(Math.pow(orbit[1], 3)); // P = a^3 (Kepler's 3rd)
    const n = (Math.PI * 2) / periodYears; 
    const phaseOffset = Number.isFinite(orbit[9]) ? orbit[9] : stablePhaseOffset(orbit[0]);
    let M = n * (activeYear - 2000) + phaseOffset; // Synthetic but stable orbital phase
    M = M % (Math.PI * 2);
    
    // Newton-Raphson solver for Eccentric Anomaly (E)
    let E = M;
    for (let i = 0; i < 10; i++) {
        E = E - (E - eVal * Math.sin(E) - M) / (1 - eVal * Math.cos(E));
    }

    const xAnom = aVal * (Math.cos(E) - eVal);
    const yAnom = aVal * Math.sqrt(1 - eVal * eVal) * Math.sin(E);
    
    // Rotate 2D anomaly into 3D plane
    const xPlaneP = xAnom * cosw - yAnom * sinw;
    const yPlaneP = xAnom * sinw + yAnom * cosw;
    const nxP = cosom * xPlaneP - sinom * cosi * yPlaneP;
    const nyP = sinom * xPlaneP + cosom * cosi * yPlaneP;
    const nzP = sini * yPlaneP;
    
    const staticPos = new THREE.Vector3(nxP, nzP, nyP);

    return { points: pts, staticPosition: staticPos };
  }, [orbit, activeYear]);

  // Subtle breathing glow animation on the selected asteroid marker
  useFrame(({ clock }) => {
    if (glowRef.current) {
      const t = clock.getElapsedTime();
      // Oscillate emissive intensity between 4 and 8 for a sophisticated pulse
      glowRef.current.emissiveIntensity = 6 + Math.sin(t * 2.5) * 2;
    }
  });

  if (!orbit || points.length === 0) return null;

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const isPHA = orbit[7] === 1;
  const glowColor = isPHA ? '#ff6644' : '#44aaff';

  return (
    <group>
      {/* Animated orbital path */}
      <line geometry={geometry}>
        <lineBasicMaterial color="#ffffff" opacity={0.6} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </line>

      {/* Selected asteroid marker with emissive glow for selective bloom */}
      {staticPosition && (
        <mesh position={staticPosition}>
          <sphereGeometry args={[0.12, 24, 24]} />
          <meshStandardMaterial
            ref={glowRef}
            color={glowColor}
            emissive={glowColor}
            emissiveIntensity={6}
            toneMapped={false}
            roughness={0.2}
            metalness={0.3}
          />
        </mesh>
      )}
    </group>
  );
}
