import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import FilterWorker from '../workers/dataFilter.worker.js?worker';

const AU_TO_UNITS = 20;
const PICK_CONSUMED_KEY = '__avPickConsumed';

// Manual click handler that bypasses R3F's event system entirely.
// R3F's built-in raycasting conflicts with OrbitControls' pointer handling,
// causing onClick/onPointerDown to never fire on InstancedMesh.
function ManualClickDetector({ pickMeshRef, pickCentersRef, pickRadiiRef, filteredOrbits, onSelectOrbit }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tempPoint = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downPointerId = null;

    const pickAt = (clientX, clientY) => {
      if (!pickMeshRef.current || !onSelectOrbit) return false;
      if (filteredOrbits.length === 0 || pickMeshRef.current.count === 0) return false;

      // Convert mouse coordinates to Normalized Device Coordinates (-1 to +1)
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObject(pickMeshRef.current);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const orbit = filteredOrbits[intersects[0].instanceId];
        if (orbit) {
          onSelectOrbit(orbit);
          return true;
        }
      }

      // Fallback for distant tiny targets: pick nearest cached orbit center within
      // an adaptive radius so far-away objects remain clickable.
      const centers = pickCentersRef.current;
      const radii = pickRadiiRef.current;
      if (!centers || !radii || filteredOrbits.length === 0) return false;

      let bestIndex = -1;
      let bestScore = Infinity;

      for (let i = 0; i < filteredOrbits.length; i++) {
        const base = i * 3;
        tempPoint.set(centers[base], centers[base + 1], centers[base + 2]);

        const rayDistSq = raycaster.ray.distanceSqToPoint(tempPoint);
        const camDist = camera.position.distanceTo(tempPoint);
        const adaptiveRadius = Math.max(radii[i], camDist * 0.0035);
        const limitSq = adaptiveRadius * adaptiveRadius;

        if (rayDistSq <= limitSq) {
          const score = rayDistSq / Math.max(limitSq, 1e-9);
          if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }

      if (bestIndex >= 0) {
        const orbit = filteredOrbits[bestIndex];
        if (orbit) {
          onSelectOrbit(orbit);
          return true;
        }
      }

      return false;
    };

    const handlePointerDown = (event) => {
      downPointerId = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
    };

    const handlePointerUp = (event) => {
      if (downPointerId !== event.pointerId) return;
      const dx = event.clientX - downX;
      const dy = event.clientY - downY;
      const moved = Math.hypot(dx, dy);
      const pickToken = `${event.pointerId}:${event.timeStamp}`;

      if (window[PICK_CONSUMED_KEY] === pickToken) {
        downPointerId = null;
        return;
      }

      // Ignore drags so OrbitControls still feels natural.
      if (moved <= 5) {
        const didPick = pickAt(event.clientX, event.clientY);
        if (didPick) {
          window[PICK_CONSUMED_KEY] = pickToken;
        }
      }
      downPointerId = null;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [camera, gl, pickCentersRef, pickMeshRef, pickRadiiRef, filteredOrbits, onSelectOrbit, raycaster, tempPoint]);

  return null;
}

export function AsteroidSwarm({ filterType, selectedOrbit, onSelectOrbit, activeYear }) {
  const meshRef = useRef();
  const pickMeshRef = useRef();
  const pickCentersRef = useRef(null);
  const pickRadiiRef = useRef(null);
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
    if (!meshRef.current || !pickMeshRef.current) return;

    if (filteredOrbits.length === 0) {
      meshRef.current.count = 0;
      pickMeshRef.current.count = 0;
      pickCentersRef.current = null;
      pickRadiiRef.current = null;
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
  }, [activeYear, filteredOrbits, dummy, color]);


  if (orbits.length === 0) return null;

  return (
    <>
      {/* Manual click detection — bypasses R3F's event system which conflicts with OrbitControls */}
      <ManualClickDetector
        pickMeshRef={pickMeshRef}
        pickCentersRef={pickCentersRef}
        pickRadiiRef={pickRadiiRef}
        filteredOrbits={filteredOrbits}
        onSelectOrbit={onSelectOrbit}
      />

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
