import React, { useRef, useEffect, useCallback, useState, useMemo, Suspense } from 'react';
import { Canvas, useThree, useFrame, extend } from '@react-three/fiber';
import { AsteroidSwarm } from './AsteroidSwarm';
import { CloseApproaches } from './CloseApproaches';
import { TrajectoryLines } from './TrajectoryLines';
import * as THREE from 'three';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

extend({ ThreeOrbitControls });

const AU_TO_UNITS = 20;
const planets = [
  { name: 'Mercury', a: 0.387, color: '#a8a8a8', size: 0.019, speed: 4.15 },
  { name: 'Venus', a: 0.723, color: '#e3bb76', size: 0.047, speed: 1.62 },
  { name: 'Mars', a: 1.523, color: '#c1440e', size: 0.026, speed: 0.53 }
];

const DEFAULT_SUN_VIEW = { x: 0, y: 35, z: 50 };

function StarField() {
  const starCount = 3500;

  const pseudo = (seed) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const positions = useMemo(() => {
    const array = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const radius = 60 + pseudo(i + 1) * 140;
      const theta = pseudo(i + 2) * Math.PI * 2;
      const phi = Math.acos(2 * pseudo(i + 3) - 1);
      array[i3] = radius * Math.sin(phi) * Math.cos(theta);
      array[i3 + 1] = radius * Math.cos(phi);
      array[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return array;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={starCount} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#dbeafe" size={0.11} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}

function CameraControlsRig({ controlsRef }) {
  const { camera, gl } = useThree();
  const localControlsRef = useRef(null);

  useEffect(() => {
    const controls = localControlsRef.current;
    controlsRef.current = controls;
    return () => {
      if (controlsRef.current === controls) {
        controlsRef.current = null;
      }
    };
  }, [controlsRef]);

  useFrame(() => {
    if (localControlsRef.current) {
      localControlsRef.current.update();
    }
  });

  return (
    <threeOrbitControls
      ref={localControlsRef}
      args={[camera, gl.domElement]}
      enablePan
      enableZoom
      enableRotate
      autoRotate={false}
    />
  );
}

function UnifiedPicker({ orbitPickMeshRef, orbitCentersRef, orbitRadiiRef, orbitDataRef, approachPickMeshRef, approachDataRef, onSelectOrbit, onSelectApproach }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tempPoint = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downPointerId = null;

    const pickOrbit = (clientX, clientY) => {
      if (!orbitPickMeshRef.current || !onSelectOrbit) return false;
      const orbits = orbitDataRef.current || [];
      if (orbits.length === 0 || orbitPickMeshRef.current.count === 0) return false;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObject(orbitPickMeshRef.current);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const orbit = orbits[intersects[0].instanceId];
        if (orbit) {
          onSelectOrbit(orbit);
          return true;
        }
      }

      const centers = orbitCentersRef.current;
      const radii = orbitRadiiRef.current;
      if (!centers || !radii) return false;

      let bestIndex = -1;
      let bestScore = Infinity;

      for (let i = 0; i < orbits.length; i++) {
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
        const orbit = orbits[bestIndex];
        if (orbit) {
          onSelectOrbit(orbit);
          return true;
        }
      }

      return false;
    };

    const pickApproach = (clientX, clientY) => {
      if (!approachPickMeshRef.current || !onSelectApproach) return false;
      const approaches = approachDataRef.current || [];
      if (approaches.length === 0 || approachPickMeshRef.current.count === 0) return false;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObject(approachPickMeshRef.current);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const approach = approaches[intersects[0].instanceId];
        if (approach) {
          onSelectApproach(approach);
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
      if (moved <= 5) {
        const didPickOrbit = pickOrbit(event.clientX, event.clientY);
        if (!didPickOrbit) {
          pickApproach(event.clientX, event.clientY);
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
  }, [approachDataRef, approachPickMeshRef, camera, gl, onSelectApproach, onSelectOrbit, orbitCentersRef, orbitDataRef, orbitPickMeshRef, orbitRadiiRef, raycaster, tempPoint]);

  return null;
}

// Handles the recenter/return camera animation via GSAP
function CameraRecenter({ controlsRef, doRecenter, onRecenterDone, earthPos, isRecentered }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!doRecenter || !controlsRef.current) return;

    const target = controlsRef.current.target;
    const tl = gsap.timeline({
      onComplete: () => onRecenterDone(),
      onUpdate: () => controlsRef.current.update()
    });

    tl.to(target, {
      x: 0, y: 0, z: 0,
      duration: 1.5,
      ease: 'power2.inOut'
    }, 0);
    tl.to(camera.position, {
      x: DEFAULT_SUN_VIEW.x,
      y: DEFAULT_SUN_VIEW.y,
      z: DEFAULT_SUN_VIEW.z,
      duration: 1.5,
      ease: 'power2.inOut'
    }, 0);

    return () => tl.kill();
  }, [camera, controlsRef, doRecenter, onRecenterDone]);

  // Animate back to Earth when un-recentered
  useEffect(() => {
    if (isRecentered || !controlsRef.current) return;

    const target = controlsRef.current.target;
    const tl = gsap.timeline({
      onUpdate: () => controlsRef.current.update()
    });

    tl.to(target, {
      x: earthPos.x, y: earthPos.y, z: earthPos.z,
      duration: 1.2,
      ease: 'power2.inOut'
    }, 0);
    tl.to(camera.position, {
      x: earthPos.x,
      y: 20,
      z: earthPos.z + 30,
      duration: 1.2,
      ease: 'power2.inOut'
    }, 0);

    return () => tl.kill();
  }, [camera, controlsRef, earthPos.x, earthPos.y, earthPos.z, isRecentered]);

  return null;
}

export function SpaceCanvas({ approachesData, filterType, selectedOrbit, onSelectOrbit, onSelectApproach, activeYear, searchTerm, isRecentered }) {
  const controlsRef = useRef();
  const [doRecenter, setDoRecenter] = useState(false);
  const orbitPickMeshRef = useRef(null);
  const orbitCentersRef = useRef(null);
  const orbitRadiiRef = useRef(null);
  const orbitDataRef = useRef([]);
  const approachPickMeshRef = useRef(null);
  const approachDataRef = useRef([]);

  const handleOrbitPickDataChange = useCallback(({ centers, radii, orbits }) => {
    orbitCentersRef.current = centers;
    orbitRadiiRef.current = radii;
    orbitDataRef.current = orbits;
  }, []);

  const handleApproachDataChange = useCallback((visibleApproaches) => {
    approachDataRef.current = visibleApproaches;
  }, []);

  const earthAngle = (activeYear - 2000) * (Math.PI * 2);
  const earthRadius = 1.0 * AU_TO_UNITS;
  const earthPos = useMemo(
    () => new THREE.Vector3(earthRadius * Math.cos(earthAngle), 0, earthRadius * Math.sin(earthAngle)),
    [earthAngle, earthRadius]
  );

  // Dynamically lock OrbitControls to follow Earth (only when NOT recentered)
  useEffect(() => {
    if (isRecentered) return;
    if (controlsRef.current) {
      controlsRef.current.target.copy(earthPos);
      controlsRef.current.update();
    }
  }, [earthPos, isRecentered]);

  // Handle recenter trigger from parent
  useEffect(() => {
    if (isRecentered) {
      setDoRecenter(true);
    }
  }, [isRecentered]);

  const handleRecenterDone = useCallback(() => {
    setDoRecenter(false);
  }, []);

  return (
    <div className="canvas-container">
      <Canvas camera={{ position: [earthPos.x, 20, earthPos.z + 30], fov: 45 }}>
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 0, 0]} intensity={1.5} color="#fffcf5" />

        <Suspense fallback={null}>
          <StarField />
          
          {/* Central Heliocentric Hub */}
          <group position={[0, 0, 0]}>
              <mesh>
                <sphereGeometry args={[1.5, 32, 32]} />
                <meshBasicMaterial color="#ffcc00" />
              </mesh>
              {/* Earth Orbit Line */}
              <mesh rotation={[-Math.PI/2, 0, 0]}>
                  <ringGeometry args={[earthRadius - 0.05, earthRadius + 0.05, 128]} />
                  <meshBasicMaterial color="#2d5e9e" opacity={0.3} transparent side={THREE.DoubleSide} />
              </mesh>
          </group>

          {/* Earth Tracking Model */}
          <mesh position={earthPos.toArray()}>
            <sphereGeometry args={[0.05, 32, 32]} />
            <meshStandardMaterial color="#2d5e9e" roughness={0.7} metalness={0.1} />
            <mesh>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.3} />
            </mesh>
          </mesh>

          {/* Scale Reference Planets */}
          {planets.map(p => {
              const r = p.a * AU_TO_UNITS;
              const angle = (activeYear - 2000) * p.speed * (Math.PI * 2);
              const px = r * Math.cos(angle);
              const pz = r * Math.sin(angle);
              return (
                  <group key={p.name}>
                      <mesh rotation={[-Math.PI/2, 0, 0]}>
                          <ringGeometry args={[r - 0.05, r + 0.05, 128]} />
                          <meshBasicMaterial color={p.color} opacity={0.3} transparent side={THREE.DoubleSide} />
                      </mesh>
                        <mesh position={[px, 0, pz]}>
                          <sphereGeometry args={[p.size, 32, 32]} />
                          <meshStandardMaterial color={p.color} roughness={0.7} metalness={0.1} />
                        </mesh>
                  </group>
              );
          })}

          <AsteroidSwarm
            filterType={filterType}
            onSelectOrbit={onSelectOrbit}
            selectedOrbit={selectedOrbit}
            activeYear={activeYear}
            searchTerm={searchTerm}
            pickMeshRef={orbitPickMeshRef}
            onOrbitPickDataChange={handleOrbitPickDataChange}
          />
          {selectedOrbit && <TrajectoryLines orbit={selectedOrbit} activeYear={activeYear} />}
          {filterType !== 'NONE' && approachesData && (
            <CloseApproaches
              data={approachesData}
              earthPos={earthPos.toArray()}
              filterType={filterType}
              pickMeshRef={approachPickMeshRef}
              onApproachDataChange={handleApproachDataChange}
            />
          )}

        </Suspense>

        <CameraRecenter
          controlsRef={controlsRef}
          doRecenter={doRecenter}
          onRecenterDone={handleRecenterDone}
          earthPos={earthPos}
          isRecentered={isRecentered}
        />

        <UnifiedPicker
          orbitPickMeshRef={orbitPickMeshRef}
          orbitCentersRef={orbitCentersRef}
          orbitRadiiRef={orbitRadiiRef}
          orbitDataRef={orbitDataRef}
          approachPickMeshRef={approachPickMeshRef}
          approachDataRef={approachDataRef}
          onSelectOrbit={onSelectOrbit}
          onSelectApproach={onSelectApproach}
        />

        {/* NO target prop — managed entirely via useEffect and GSAP to prevent React from overwriting animated values */}
        <CameraControlsRig controlsRef={controlsRef} />
      </Canvas>
    </div>
  );
}
