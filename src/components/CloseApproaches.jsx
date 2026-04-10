import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

const AU_TO_UNITS = 20;
let orbitIndexByNameCache = null;
let orbitIndexByNamePromise = null;

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicUnitVector(seedKey) {
  const seed = hashString(seedKey);
  const rand = mulberry32(seed);

  const theta = rand() * Math.PI * 2;
  const z = rand() * 2 - 1;
  const rXY = Math.sqrt(Math.max(0, 1 - z * z));

  return {
    x: rXY * Math.cos(theta),
    y: rXY * Math.sin(theta),
    z,
  };
}

function normalizeDesignation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function stablePhaseOffset(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function getEarthPositionAtYear(yearValue) {
  const angle = (yearValue - 2000) * (Math.PI * 2);
  return {
    x: Math.cos(angle) * AU_TO_UNITS,
    y: 0,
    z: Math.sin(angle) * AU_TO_UNITS,
  };
}

function getOrbitPositionAtYear(orbit, yearValue) {
  const aAu = orbit[1];
  const e = orbit[2];
  const inc = orbit[3];
  const om = orbit[4];
  const w = orbit[5];

  const periodYears = Math.sqrt(aAu * aAu * aAu);
  const n = (Math.PI * 2) / Math.max(periodYears, 1e-6);
  const phaseOffset = Number.isFinite(orbit[9]) ? orbit[9] : stablePhaseOffset(orbit[0]);
  let M = n * (yearValue - 2000) + phaseOffset;
  M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  let E = M;
  for (let i = 0; i < 8; i++) {
    E = E - (E - e * Math.sin(E) - M) / Math.max(1 - e * Math.cos(E), 1e-6);
  }

  const aUnits = aAu * AU_TO_UNITS;
  const xp = aUnits * (Math.cos(E) - e);
  const yp = aUnits * Math.sqrt(Math.max(1 - e * e, 0)) * Math.sin(E);

  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cosi = Math.cos(inc);
  const sini = Math.sin(inc);
  const cosom = Math.cos(om);
  const sinom = Math.sin(om);

  const xPlane = xp * cosw - yp * sinw;
  const yPlane = xp * sinw + yp * cosw;

  const x = cosom * xPlane - sinom * cosi * yPlane;
  const y = sinom * xPlane + cosom * cosi * yPlane;
  const z = sini * yPlane;

  return { x, y: z, z: y };
}

function buildOrbitIndexByName(rows) {
  const byName = new Map();

  for (let i = 0; i < rows.length; i++) {
    const orbit = rows[i];
    if (!orbit) continue;

    const nameKey = normalizeDesignation(orbit[8]);
    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, orbit);
    }

    const idKey = normalizeDesignation(orbit[0]);
    if (idKey && !byName.has(idKey)) {
      byName.set(idKey, orbit);
    }
  }

  return byName;
}

function loadOrbitIndexByName() {
  if (orbitIndexByNameCache) {
    return Promise.resolve(orbitIndexByNameCache);
  }

  if (orbitIndexByNamePromise) {
    return orbitIndexByNamePromise;
  }

  orbitIndexByNamePromise = fetch('/data/orbits.json')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load orbits.json: HTTP ${res.status}`);
      }
      return res.json();
    })
    .then((rows) => {
      if (!Array.isArray(rows)) {
        throw new Error('Invalid orbits.json format');
      }

      orbitIndexByNameCache = buildOrbitIndexByName(rows);
      return orbitIndexByNameCache;
    })
    .finally(() => {
      orbitIndexByNamePromise = null;
    });

  return orbitIndexByNamePromise;
}

export function CloseApproaches({ data, earthPos, filterType = 'ALL', pickMeshRef: externalPickMeshRef, onApproachDataChange }) {
  const meshRef = useRef();
  const pickMeshRefInternal = useRef();
  const pickMeshRef = externalPickMeshRef || pickMeshRefInternal;
  const [orbitIndexByName, setOrbitIndexByName] = useState(() => new Map());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const visibleData = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (filterType === 'SAFE') {
      return data.filter((event) => event[2] > 0.05);
    }

    if (filterType === 'PHA') {
      return data.filter((event) => event[2] <= 0.05);
    }

    return data;
  }, [data, filterType]);

  useEffect(() => {
    let cancelled = false;

    loadOrbitIndexByName()
      .then((byName) => {
        if (cancelled) return;
        setOrbitIndexByName(byName);
      })
      .catch(() => {
        if (!cancelled) {
          setOrbitIndexByName(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!meshRef.current || !pickMeshRef.current) return;

    if (visibleData.length === 0) {
      meshRef.current.count = 0;
      pickMeshRef.current.count = 0;
      if (onApproachDataChange) {
        onApproachDataChange([]);
      }
      return;
    }

    meshRef.current.count = visibleData.length;
    pickMeshRef.current.count = visibleData.length;

    for (let i = 0; i < visibleData.length; i++) {
        // [name, timestamp_ms, distance_au, velocity_kms, H]
        const event = visibleData[i];
        const distAu = event[2];
        const H = event[4];

        // Radius from earth perfectly clamped to just outside Earth's graphic (0.052) so true mathematical sub-orbital distances don't physically clip the visual model
        const r = Math.max(0.052, distAu * AU_TO_UNITS);
        
        // Prefer orbit-derived direction to reduce apparent angular mismatch with asteroid motion.
        let dir = null;
        const eventKey = normalizeDesignation(event[0]);
        const matchingOrbit = orbitIndexByName.get(eventKey);

        if (matchingOrbit) {
          const yearAtEvent = 2000 + (event[1] - Date.UTC(2000, 0, 1)) / (365.25 * 24 * 60 * 60 * 1000);
          const asteroidPos = getOrbitPositionAtYear(matchingOrbit, yearAtEvent);
          const earthAtEvent = getEarthPositionAtYear(yearAtEvent);

          const rx = asteroidPos.x - earthAtEvent.x;
          const ry = asteroidPos.y - earthAtEvent.y;
          const rz = asteroidPos.z - earthAtEvent.z;
          const len = Math.hypot(rx, ry, rz);

          if (len > 1e-6) {
            dir = { x: rx / len, y: ry / len, z: rz / len };
          }
        }

        if (!dir) {
          const seedKey = `${event[0]}|${event[1]}|${event[2]}`;
          dir = deterministicUnitVector(seedKey);
        }

        const x = r * dir.x;
        const y = r * dir.y;
        const z = r * dir.z;

        dummy.position.set(x, y, z);
        
        // Scale based on magnitude, shrunk down to match Earth's 0.05 radius
        let sizeScale = Math.max(0.005, (25 - H) * 0.002);
        // Make very close objects slightly more pronounced
        if (distAu < 0.05) sizeScale *= 1.5;

        dummy.scale.set(sizeScale, sizeScale, sizeScale);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        const pickScale = Math.max(sizeScale * 10, 0.08);
        dummy.scale.set(pickScale, pickScale, pickScale);
        dummy.updateMatrix();
        pickMeshRef.current.setMatrixAt(i, dummy.matrix);

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
    pickMeshRef.current.instanceMatrix.needsUpdate = true;
    if (onApproachDataChange) {
      onApproachDataChange(visibleData);
    }
  }, [visibleData, orbitIndexByName, dummy, color, onApproachDataChange, pickMeshRef]);

  if (visibleData.length === 0) return null;

  return (
    <group position={earthPos || [0, 0, 0]}>
      <instancedMesh ref={meshRef} args={[null, null, visibleData.length]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={pickMeshRef} args={[null, null, visibleData.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
    </group>
  );
}
