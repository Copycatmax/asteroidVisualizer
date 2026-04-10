import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

const AU_TO_UNITS = 20;
const PICK_CONSUMED_KEY = '__avPickConsumed';

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

function ManualApproachClickDetector({ pickMeshRef, visibleData, onSelectApproach }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downPointerId = null;

    const pickAt = (clientX, clientY) => {
      if (!pickMeshRef.current || !onSelectApproach) return false;
      if (visibleData.length === 0 || pickMeshRef.current.count === 0) return false;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObject(pickMeshRef.current);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const event = visibleData[intersects[0].instanceId];
        if (event) {
          onSelectApproach(event);
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
      const pickToken = `${event.pointerId}:${event.timeStamp}`;

      if (window[PICK_CONSUMED_KEY] === pickToken) {
        downPointerId = null;
        return;
      }

      const dx = event.clientX - downX;
      const dy = event.clientY - downY;
      const moved = Math.hypot(dx, dy);

      if (moved <= 5) {
        const clientX = event.clientX;
        const clientY = event.clientY;

        // Let asteroid picker run first on the same click; close-approach acts as fallback.
        setTimeout(() => {
          if (window[PICK_CONSUMED_KEY] === pickToken) {
            return;
          }

          const didPick = pickAt(clientX, clientY);
          if (didPick) {
            window[PICK_CONSUMED_KEY] = pickToken;
          }
        }, 0);
      }
      downPointerId = null;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [camera, gl, onSelectApproach, pickMeshRef, raycaster, visibleData]);

  return null;
}

export function CloseApproaches({ data, earthPos, filterType = 'ALL', onSelectApproach }) {
  const meshRef = useRef();
  const pickMeshRef = useRef();
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
    if (!meshRef.current || !pickMeshRef.current) return;

    if (visibleData.length === 0) {
      meshRef.current.count = 0;
      pickMeshRef.current.count = 0;
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
        
        // Deterministic pseudo-direction keeps each event visually stable across renders.
        const seedKey = `${event[0]}|${event[1]}|${event[2]}`;
        const dir = deterministicUnitVector(seedKey);

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
  }, [visibleData, dummy, color]);

  if (visibleData.length === 0) return null;

  return (
    <group position={earthPos || [0, 0, 0]}>
      <ManualApproachClickDetector
        pickMeshRef={pickMeshRef}
        visibleData={visibleData}
        onSelectApproach={onSelectApproach}
      />

      <instancedMesh ref={meshRef} args={[null, null, visibleData.length]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={pickMeshRef} args={[null, null, visibleData.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
    </group>
  );
}
