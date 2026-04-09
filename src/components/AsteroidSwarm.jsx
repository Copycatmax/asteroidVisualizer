import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const AU_TO_UNITS = 20; // Scale 1 AU to 20 units in Three.js space

export function AsteroidSwarm() {
  const meshRef = useRef();
  const [orbits, setOrbits] = useState([]);

  useEffect(() => {
    fetch('/data/orbits.json')
      .then((res) => res.json())
      .then((data) => setOrbits(data))
      .catch((err) => console.error('Failed to load orbits:', err));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!meshRef.current || orbits.length === 0) return;

    for (let i = 0; i < orbits.length; i++) {
      // Data struct: [spkid, a, e, i, om, w, H, pha_int]
      const orbit = orbits[i];
      const a = orbit[1] * AU_TO_UNITS;
      const e = orbit[2];
      const inc = orbit[3];
      const om = orbit[4];
      const w = orbit[5];
      const H = orbit[6];
      const pha = orbit[7] === 1;

      // Simplification: Place asteroid at Periapsis for static swarm view
      const r = a * (1 - e);
      // Eccentric Anomaly E = 0, so x = r, y = 0
      const xp = r;
      const yp = 0;

      // Euler rotations
      const cosw = Math.cos(w), sinw = Math.sin(w);
      const cosi = Math.cos(inc), sini = Math.sin(inc);
      const cosom = Math.cos(om), sinom = Math.sin(om);

      // Argument of periapsis rotation
      const xPlane = xp * cosw - yp * sinw;
      const yPlane = xp * sinw + yp * cosw;

      // Inclination and Longitude of Ascending Node rotation
      const x = cosom * xPlane - sinom * cosi * yPlane;
      const y = sinom * xPlane + cosom * cosi * yPlane;
      const z = sini * yPlane;

      // Note: Three.js uses Y up, so map standard Z to Y
      dummy.position.set(x, z, y);

      // Scale derived from Absolute Magnitude (H)
      // Visual scaling to look good
      let sizeScale = Math.max(0.04, (25 - H) * 0.015);
      if (pha) sizeScale *= 2; 
      dummy.scale.set(sizeScale, sizeScale, sizeScale);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Set Colors
      color.set(pha ? '#ff3333' : '#aaddff');
      meshRef.current.setColorAt(i, color);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor.needsUpdate = true;
  }, [orbits, dummy, color]);

  // Optional: slowly rotate the whole swarm to give it life
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.02; // slow drift
    }
  });

  if (orbits.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[null, null, orbits.length]}>
      <sphereGeometry args={[1, 16, 16]} />
      {/* Basic material avoids expensive lighting on 41k rocks */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
