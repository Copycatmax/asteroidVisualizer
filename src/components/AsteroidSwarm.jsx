import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import FilterWorker from '../workers/dataFilter.worker.js?worker';

const AU_TO_UNITS = 20;

// Manual click handler that bypasses R3F's event system entirely.
// R3F's built-in raycasting conflicts with OrbitControls' pointer handling,
// causing onClick/onPointerDown to never fire on InstancedMesh.
function ManualClickDetector({ meshRef, filteredOrbits, onSelectOrbit }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleClick = (event) => {
      if (!meshRef.current || !onSelectOrbit) return;

      // Convert mouse coordinates to Normalized Device Coordinates (-1 to +1)
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObject(meshRef.current);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const orbit = filteredOrbits[intersects[0].instanceId];
        if (orbit) {
          onSelectOrbit(orbit);
        }
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [camera, gl, meshRef, filteredOrbits, onSelectOrbit, raycaster]);

  return null;
}

export function AsteroidSwarm({ filterType, selectedOrbit, onSelectOrbit }) {
  const meshRef = useRef();
  const workerRef = useRef(null);

  const [orbits, setOrbits] = useState([]);
  const [filteredOrbits, setFilteredOrbits] = useState([]);

  // Fetch initial massive dataset
  useEffect(() => {
    fetch('/data/orbits.json')
      .then((res) => res.json())
      .then((data) => {
        setOrbits(data);
        setFilteredOrbits(data);
      })
      .catch((err) => console.error('Failed to load orbits:', err));
  }, []);

  // Web Worker setup
  useEffect(() => {
    workerRef.current = new FilterWorker();

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'FILTERED_DATA') {
        setFilteredOrbits(e.data.payload);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Dispatch work to worker when filter changes
  useEffect(() => {
    if (orbits.length > 0 && workerRef.current) {
      workerRef.current.postMessage({ type: 'FILTER', data: orbits, filterType });
    }
  }, [filterType, orbits]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Search Logic
  useEffect(() => {
    const handleSearch = (e) => {
      const term = e.detail.toLowerCase().trim();
      if (!term || term.length < 3) return;

      const match = orbits.find(o =>
        (o[8] && o[8].toLowerCase().includes(term)) ||
        (o[0] && o[0].toString() === term)
      );

      if (match && onSelectOrbit) {
        onSelectOrbit(match);
      }
    };
    window.addEventListener('SEARCH_ASTEROID', handleSearch);
    return () => window.removeEventListener('SEARCH_ASTEROID', handleSearch);
  }, [orbits, onSelectOrbit]);

  useEffect(() => {
    if (!meshRef.current) return;

    if (filteredOrbits.length === 0) {
      meshRef.current.count = 0;
      return;
    }

    // Dynamically adjust count to avoid full remounts which trigger garbage collection frame drops
    meshRef.current.count = filteredOrbits.length;

    for (let i = 0; i < filteredOrbits.length; i++) {
      const orbit = filteredOrbits[i];
      const a = orbit[1] * AU_TO_UNITS;
      const e = orbit[2];
      const inc = orbit[3];
      const om = orbit[4];
      const w = orbit[5];
      const H = orbit[6];
      const pha = orbit[7] === 1;

      const r = a * (1 - e);
      const xp = r;
      const yp = 0;

      const cosw = Math.cos(w), sinw = Math.sin(w);
      const cosi = Math.cos(inc), sini = Math.sin(inc);
      const cosom = Math.cos(om), sinom = Math.sin(om);

      const xPlane = xp * cosw - yp * sinw;
      const yPlane = xp * sinw + yp * cosw;

      const x = cosom * xPlane - sinom * cosi * yPlane;
      const y = sinom * xPlane + cosom * cosi * yPlane;
      const z = sini * yPlane;

      dummy.position.set(x, z, y);

      // Logarithmic scale derived from Absolute Magnitude - sized up artificially to ensure raycaster hitboxes are clickable!
      let sizeScale = Math.max(0.04, Math.pow(10, (20 - H) / 10) * 0.008);
      if (pha) sizeScale *= 1.5;
      dummy.scale.set(sizeScale, sizeScale, sizeScale);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      color.set(pha ? '#ff3333' : '#aaddff');
      meshRef.current.setColorAt(i, color);
    }

    // CRITICAL: Override bounding sphere so raycaster's broad-phase check passes
    // when the camera is far from the origin (tracking Earth at ~20 units away)
    meshRef.current.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);
    meshRef.current.geometry.computeBoundingSphere = () => {};

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor.needsUpdate = true;
  }, [filteredOrbits, dummy, color]);


  if (orbits.length === 0) return null;

  return (
    <>
      {/* Manual click detection — bypasses R3F's event system which conflicts with OrbitControls */}
      <ManualClickDetector
        meshRef={meshRef}
        filteredOrbits={filteredOrbits}
        onSelectOrbit={onSelectOrbit}
      />

      <instancedMesh ref={meshRef} args={[null, null, orbits.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={selectedOrbit ? 0.15 : 1} />
      </instancedMesh>
    </>
  );
}
