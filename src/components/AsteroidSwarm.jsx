import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import FilterWorker from '../workers/dataFilter.worker.js?worker';

const AU_TO_UNITS = 20;

export function AsteroidSwarm({ filterType, selectedOrbit, onSelectOrbit, activeYear, searchTerm, pickMeshRef: externalPickMeshRef, onOrbitPickDataChange }) {
  const meshRef = useRef();
  const pickMeshRefInternal = useRef();
  const pickCentersRef = useRef(null);
  const pickRadiiRef = useRef(null);

  const pickMeshRef = externalPickMeshRef || pickMeshRefInternal;
  const workerRef = useRef(null);
  const filterTypeRef = useRef(filterType);

  const [orbits, setOrbits] = useState([]);
  const [filteredOrbits, setFilteredOrbits] = useState([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  const orbitBySpkId = useMemo(() => {
    const byId = new Map();
    for (const orbit of orbits) {
      byId.set(String(orbit[0]), orbit);
    }
    return byId;
  }, [orbits]);

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
    setIsWorkerReady(true);

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'FILTERED_DATA') {
        setFilteredOrbits(e.data.payload);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      setIsWorkerReady(false);
    };
  }, []);

  // Send source data once and let the worker own filtering thereafter.
  useEffect(() => {
    filterTypeRef.current = filterType;
  }, [filterType]);

  useEffect(() => {
    if (!isWorkerReady || !workerRef.current || orbits.length === 0) return;
    workerRef.current.postMessage({ type: 'SET_DATA', payload: orbits });
    workerRef.current.postMessage({ type: 'FILTER', filterType: filterTypeRef.current });
  }, [isWorkerReady, orbits]);

  useEffect(() => {
    if (isWorkerReady && workerRef.current) {
      workerRef.current.postMessage({ type: 'FILTER', filterType });
    }
  }, [filterType, isWorkerReady]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Search Logic
  useEffect(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term || term.length < 3) return;

    const exactById = orbitBySpkId.get(term);
    const match = exactById || orbits.find((o) => o[8] && String(o[8]).toLowerCase().includes(term));

    if (match && onSelectOrbit) {
      onSelectOrbit(match);
    }
  }, [searchTerm, orbitBySpkId, orbits, onSelectOrbit]);

  useEffect(() => {
    if (!meshRef.current || !pickMeshRef.current) return;

    if (filteredOrbits.length === 0) {
      meshRef.current.count = 0;
      pickMeshRef.current.count = 0;
      pickCentersRef.current = null;
      pickRadiiRef.current = null;
      if (onOrbitPickDataChange) {
        onOrbitPickDataChange({ centers: null, radii: null, orbits: [] });
      }
      return;
    }

    // Dynamically adjust count to avoid full remounts which trigger garbage collection frame drops
    meshRef.current.count = filteredOrbits.length;
    pickMeshRef.current.count = filteredOrbits.length;
    const pickCenters = new Float32Array(filteredOrbits.length * 3);
    const pickRadii = new Float32Array(filteredOrbits.length);

    for (let i = 0; i < filteredOrbits.length; i++) {
      const orbit = filteredOrbits[i];
      const a = orbit[1] * AU_TO_UNITS;
      const e = orbit[2];
      const inc = orbit[3];
      const om = orbit[4];
      const w = orbit[5];
      const H = orbit[6];
      const pha = orbit[7] === 1;

      const periodYears = Math.sqrt(Math.pow(orbit[1], 3));
      const n = (Math.PI * 2) / Math.max(periodYears, 1e-6);
      let M = n * (activeYear - 2000);
      M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      // Newton-Raphson solve for eccentric anomaly so positions evolve over time.
      let E = M;
      for (let k = 0; k < 8; k++) {
        E = E - (E - e * Math.sin(E) - M) / Math.max(1 - e * Math.cos(E), 1e-6);
      }

      const xp = a * (Math.cos(E) - e);
      const yp = a * Math.sqrt(Math.max(1 - e * e, 0)) * Math.sin(E);

      const cosw = Math.cos(w), sinw = Math.sin(w);
      const cosi = Math.cos(inc), sini = Math.sin(inc);
      const cosom = Math.cos(om), sinom = Math.sin(om);

      const xPlane = xp * cosw - yp * sinw;
      const yPlane = xp * sinw + yp * cosw;

      const x = cosom * xPlane - sinom * cosi * yPlane;
      const y = sinom * xPlane + cosom * cosi * yPlane;
      const z = sini * yPlane;

      dummy.position.set(x, z, y);
      const cx = x;
      const cy = z;
      const cz = y;

      // Logarithmic scale derived from Absolute Magnitude - sized up artificially to ensure raycaster hitboxes are clickable!
      let sizeScale = Math.max(0.04, Math.pow(10, (20 - H) / 10) * 0.008);
      if (pha) sizeScale *= 1.5;
      dummy.scale.set(sizeScale, sizeScale, sizeScale);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Selection shell uses enlarged transforms for easier picking without changing visuals.
      dummy.scale.set(sizeScale * 3.2, sizeScale * 3.2, sizeScale * 3.2);
      dummy.updateMatrix();
      pickMeshRef.current.setMatrixAt(i, dummy.matrix);

      const base = i * 3;
      pickCenters[base] = cx;
      pickCenters[base + 1] = cy;
      pickCenters[base + 2] = cz;
      pickRadii[i] = sizeScale * 3.2;

      color.set(pha ? '#ff3333' : '#aaddff');
      meshRef.current.setColorAt(i, color);
    }

    // CRITICAL: Override bounding sphere so raycaster's broad-phase check passes
    // when the camera is far from the origin (tracking Earth at ~20 units away)
    meshRef.current.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);
    meshRef.current.geometry.computeBoundingSphere = () => {};
    pickMeshRef.current.geometry.boundingSphere = meshRef.current.geometry.boundingSphere;
    pickMeshRef.current.geometry.computeBoundingSphere = () => {};

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor.needsUpdate = true;
    pickMeshRef.current.instanceMatrix.needsUpdate = true;
    pickCentersRef.current = pickCenters;
    pickRadiiRef.current = pickRadii;
    if (onOrbitPickDataChange) {
      onOrbitPickDataChange({ centers: pickCenters, radii: pickRadii, orbits: filteredOrbits });
    }
  }, [activeYear, filteredOrbits, dummy, color, onOrbitPickDataChange, pickMeshRef]);


  if (orbits.length === 0) return null;

  return (
    <>
      <instancedMesh ref={meshRef} args={[null, null, orbits.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={selectedOrbit ? 0.15 : 1} />
      </instancedMesh>

      <instancedMesh ref={pickMeshRef} args={[null, null, orbits.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
    </>
  );
}
