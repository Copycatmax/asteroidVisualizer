import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import FilterWorker from '../workers/dataFilter.worker.js?worker';
import { stablePhaseOffset } from '../utils/orbitMath';
import { loadOrbitsRows } from '../utils/orbitData';

const AU_TO_UNITS = 20;
const LOD_DISTANCE_BANDS = [
  { maxDistance: 75, stride: 1 },
  { maxDistance: 120, stride: 2 },
  { maxDistance: 180, stride: 4 },
  { maxDistance: 260, stride: 8 },
  { maxDistance: Infinity, stride: 12 },
];

function stableStringModulo(value, divisor) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % divisor;
}

function resolveLodStride(cameraDistance) {
  for (let i = 0; i < LOD_DISTANCE_BANDS.length; i++) {
    if (cameraDistance <= LOD_DISTANCE_BANDS[i].maxDistance) {
      return LOD_DISTANCE_BANDS[i].stride;
    }
  }
  return 12;
}

function ensureFloat32Capacity(buffer, requiredLength) {
  if (buffer.length >= requiredLength) return buffer;
  return new Float32Array(requiredLength);
}

export function AsteroidSwarm({ filterType, selectedOrbit, onSelectOrbit, activeYear, searchTerm, pickMeshRef: externalPickMeshRef, onOrbitPickDataChange }) {
  const meshRef = useRef();
  const pickMeshRefInternal = useRef();
  const pickCentersBufferRef = useRef(new Float32Array(0));
  const pickRadiiBufferRef = useRef(new Float32Array(0));

  const pickMeshRef = externalPickMeshRef || pickMeshRefInternal;
  const workerRef = useRef(null);
  const orbitsRef = useRef([]);
  const latestFilterRequestIdRef = useRef(0);

  const [orbits, setOrbits] = useState([]);
  const [filteredOrbits, setFilteredOrbits] = useState([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [lodStride, setLodStride] = useState(1);
  const lodTimerRef = useRef(0);
  const { camera } = useThree();

  useFrame((_, delta) => {
    lodTimerRef.current += delta;
    if (lodTimerRef.current < 0.25) return;
    lodTimerRef.current = 0;

    const nextStride = resolveLodStride(camera.position.length());
    setLodStride((prev) => (prev === nextStride ? prev : nextStride));
  });

  const orbitBySpkId = useMemo(() => {
    const byId = new Map();
    for (const orbit of orbits) {
      byId.set(String(orbit[0]), orbit);
    }
    return byId;
  }, [orbits]);

  const precomputedOrbits = useMemo(() => {
    const selectedSpkId = selectedOrbit ? String(selectedOrbit[0]) : null;
    const sampled = [];

    for (let i = 0; i < filteredOrbits.length; i++) {
      const orbit = filteredOrbits[i];
      const spkId = String(orbit[0]);
      const pha = orbit[7] === 1;
      const isSelected = selectedSpkId !== null && spkId === selectedSpkId;

      // Keep dense rendering near the camera, then deterministically thin distant objects.
      const shouldKeep = lodStride === 1 || isSelected || pha || stableStringModulo(spkId, lodStride) === 0;
      if (!shouldKeep) continue;

      const aAu = orbit[1];
      const e = orbit[2];
      const inc = orbit[3];
      const om = orbit[4];
      const w = orbit[5];
      const H = orbit[6];

      const periodYears = Math.sqrt(aAu * aAu * aAu);
      const n = (Math.PI * 2) / Math.max(periodYears, 1e-6);
      const aUnits = aAu * AU_TO_UNITS;
      const phaseOffset = Number.isFinite(orbit[9]) ? orbit[9] : stablePhaseOffset(spkId);

      let sizeScale = Math.max(0.04, Math.pow(10, (20 - H) / 10) * 0.008);
      if (pha) sizeScale *= 1.5;

      sampled.push({
        orbit,
        pha,
        e,
        n,
        phaseOffset,
        aUnits,
        sqrtOneMinusESq: Math.sqrt(Math.max(1 - e * e, 0)),
        cosw: Math.cos(w),
        sinw: Math.sin(w),
        cosi: Math.cos(inc),
        sini: Math.sin(inc),
        cosom: Math.cos(om),
        sinom: Math.sin(om),
        sizeScale,
      });
    }

    return sampled;
  }, [filteredOrbits, lodStride, selectedOrbit]);

  const precomputedOrbitRows = useMemo(
    () => precomputedOrbits.map((pre) => pre.orbit),
    [precomputedOrbits]
  );

  // Fetch initial massive dataset
  useEffect(() => {
    loadOrbitsRows()
      .then((data) => {
        setOrbits(data);
        setFilteredOrbits(data);
      })
      .catch((err) => console.error('Failed to load orbits:', err));
  }, []);

  useEffect(() => {
    orbitsRef.current = orbits;
  }, [orbits]);

  // Web Worker setup
  useEffect(() => {
    workerRef.current = new FilterWorker();
    setIsWorkerReady(true);

    workerRef.current.onmessage = (e) => {
      const messageRequestId = Number(e.data?.requestId);
      if (Number.isFinite(messageRequestId) && messageRequestId !== latestFilterRequestIdRef.current) {
        return;
      }

      if (e.data.type === 'FILTERED_DATA') {
        setFilteredOrbits(e.data.payload);
      } else if (e.data.type === 'USE_SOURCE_DATA') {
        setFilteredOrbits(orbitsRef.current);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      setIsWorkerReady(false);
    };
  }, []);

  useEffect(() => {
    if (!isWorkerReady || !workerRef.current || orbits.length === 0) return;
    workerRef.current.postMessage({ type: 'SET_DATA', payload: orbits });
  }, [isWorkerReady, orbits]);

  useEffect(() => {
    latestFilterRequestIdRef.current += 1;
    const requestId = latestFilterRequestIdRef.current;

    if (filterType === 'ALL') {
      setFilteredOrbits(orbits);
      return;
    }

    if (filterType === 'NONE') {
      setFilteredOrbits([]);
      return;
    }

    if (isWorkerReady && workerRef.current) {
      workerRef.current.postMessage({ type: 'FILTER', filterType, requestId });
    }
  }, [filterType, isWorkerReady, orbits]);

  useEffect(() => {
    if (!meshRef.current || !pickMeshRef.current) return;

    meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pickMeshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
  }, [pickMeshRef, orbits.length]);

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

    if (precomputedOrbits.length === 0) {
      meshRef.current.count = 0;
      pickMeshRef.current.count = 0;
      if (onOrbitPickDataChange) {
        onOrbitPickDataChange({ centers: null, radii: null, orbits: [] });
      }
      return;
    }

    // Dynamically adjust count to avoid full remounts which trigger garbage collection frame drops
    meshRef.current.count = precomputedOrbits.length;
    pickMeshRef.current.count = precomputedOrbits.length;
    const requiredCentersLength = precomputedOrbits.length * 3;
    pickCentersBufferRef.current = ensureFloat32Capacity(pickCentersBufferRef.current, requiredCentersLength);
    pickRadiiBufferRef.current = ensureFloat32Capacity(pickRadiiBufferRef.current, precomputedOrbits.length);

    const pickCenters = pickCentersBufferRef.current;
    const pickRadii = pickRadiiBufferRef.current;
    const yearOffset = activeYear - 2000;

    for (let i = 0; i < precomputedOrbits.length; i++) {
      const pre = precomputedOrbits[i];

      let M = pre.n * yearOffset;
      M += pre.phaseOffset;
      M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      // Newton-Raphson solve for eccentric anomaly so positions evolve over time.
      let E = M;
      for (let k = 0; k < 8; k++) {
        E = E - (E - pre.e * Math.sin(E) - M) / Math.max(1 - pre.e * Math.cos(E), 1e-6);
      }

      const xp = pre.aUnits * (Math.cos(E) - pre.e);
      const yp = pre.aUnits * pre.sqrtOneMinusESq * Math.sin(E);

      const xPlane = xp * pre.cosw - yp * pre.sinw;
      const yPlane = xp * pre.sinw + yp * pre.cosw;

      const x = pre.cosom * xPlane - pre.sinom * pre.cosi * yPlane;
      const y = pre.sinom * xPlane + pre.cosom * pre.cosi * yPlane;
      const z = pre.sini * yPlane;

      dummy.position.set(x, z, y);
      const cx = x;
      const cy = z;
      const cz = y;

      dummy.scale.set(pre.sizeScale, pre.sizeScale, pre.sizeScale);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Selection shell uses enlarged transforms for easier picking without changing visuals.
      dummy.scale.set(pre.sizeScale * 3.2, pre.sizeScale * 3.2, pre.sizeScale * 3.2);
      dummy.updateMatrix();
      pickMeshRef.current.setMatrixAt(i, dummy.matrix);

      const base = i * 3;
      pickCenters[base] = cx;
      pickCenters[base + 1] = cy;
      pickCenters[base + 2] = cz;
      pickRadii[i] = pre.sizeScale * 3.2;

      color.set(pre.pha ? '#ff3333' : '#aaddff');
      meshRef.current.setColorAt(i, color);
    }

    if (typeof meshRef.current.instanceMatrix.clearUpdateRanges === 'function' && typeof meshRef.current.instanceMatrix.addUpdateRange === 'function') {
      meshRef.current.instanceMatrix.clearUpdateRanges();
      meshRef.current.instanceMatrix.addUpdateRange(0, precomputedOrbits.length * 16);
    }
    if (meshRef.current.instanceColor && typeof meshRef.current.instanceColor.clearUpdateRanges === 'function' && typeof meshRef.current.instanceColor.addUpdateRange === 'function') {
      meshRef.current.instanceColor.clearUpdateRanges();
      meshRef.current.instanceColor.addUpdateRange(0, precomputedOrbits.length * 3);
    }
    if (typeof pickMeshRef.current.instanceMatrix.clearUpdateRanges === 'function' && typeof pickMeshRef.current.instanceMatrix.addUpdateRange === 'function') {
      pickMeshRef.current.instanceMatrix.clearUpdateRanges();
      pickMeshRef.current.instanceMatrix.addUpdateRange(0, precomputedOrbits.length * 16);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor.needsUpdate = true;
    pickMeshRef.current.instanceMatrix.needsUpdate = true;
    if (onOrbitPickDataChange) {
      onOrbitPickDataChange({ centers: pickCenters, radii: pickRadii, orbits: precomputedOrbitRows });
    }
  }, [activeYear, precomputedOrbits, precomputedOrbitRows, dummy, color, onOrbitPickDataChange, pickMeshRef]);


  if (orbits.length === 0) return null;

  return (
    <>
      <instancedMesh ref={meshRef} args={[null, null, orbits.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={selectedOrbit ? 0.15 : 1} />
      </instancedMesh>

      <instancedMesh ref={pickMeshRef} args={[null, null, orbits.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
    </>
  );
}
