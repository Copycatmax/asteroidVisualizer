import React, { useRef, useEffect, useCallback, useState, useMemo, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Html } from '@react-three/drei';
import { AsteroidSwarm } from './AsteroidSwarm';
import { CloseApproaches } from './CloseApproaches';
import { TrajectoryLines } from './TrajectoryLines';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';

const AU_TO_UNITS = 20;
const planets = [
  { name: 'Mercury', a: 0.387, color: '#a8a8a8', size: 0.019, speed: 4.15 },
  { name: 'Venus', a: 0.723, color: '#e3bb76', size: 0.047, speed: 1.62 },
  { name: 'Mars', a: 1.523, color: '#c1440e', size: 0.026, speed: 0.53 }
];

const DEFAULT_SUN_VIEW = { x: 0, y: 35, z: 50 };

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

export function SpaceCanvas({ approachesData, filterType, selectedOrbit, onSelectOrbit, onSelectApproach, activeYear, isRecentered }) {
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
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          {/* Central Heliocentric Hub */}
          <group position={[0, 0, 0]}>
              <Sphere args={[1.5, 32, 32]}>
                <meshBasicMaterial color="#ffcc00" />
                <Html distanceFactor={25} wrapperClass="label-no-events">
                  <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '12px' }}>SUN</div>
                </Html>
              </Sphere>
              {/* Earth Orbit Line */}
              <mesh rotation={[-Math.PI/2, 0, 0]}>
                  <ringGeometry args={[earthRadius - 0.05, earthRadius + 0.05, 128]} />
                  <meshBasicMaterial color="#2d5e9e" opacity={0.3} transparent side={THREE.DoubleSide} />
              </mesh>
          </group>

          {/* Earth Tracking Model */}
          <Sphere args={[0.05, 32, 32]} position={earthPos.toArray()}>
            <meshStandardMaterial color="#2d5e9e" roughness={0.7} metalness={0.1} />
            <mesh>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.3} />
            </mesh>
            <Html distanceFactor={8} wrapperClass="label-no-events">
               <div style={{ color: '#aaddff', fontSize: '11px', background: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }}>Earth</div>
            </Html>
          </Sphere>

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
                      <Sphere args={[p.size, 32, 32]} position={[px, 0, pz]}>
                          <meshStandardMaterial color={p.color} roughness={0.7} metalness={0.1} />
                          <Html distanceFactor={15} wrapperClass="label-no-events">
                            <div style={{ color: 'white', fontSize: '10px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '4px' }}>{p.name}</div>
                          </Html>
                      </Sphere>
                  </group>
              );
          })}

          <AsteroidSwarm
            filterType={filterType}
            onSelectOrbit={onSelectOrbit}
            selectedOrbit={selectedOrbit}
            activeYear={activeYear}
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

          {/* Selective Bloom: High luminance threshold so only emissive objects glow */}
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.9}
              luminanceSmoothing={0.3}
              intensity={0.8}
              radius={0.4}
              mipmapBlur
            />
          </EffectComposer>
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
        <OrbitControls 
          ref={controlsRef}
          makeDefault
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
