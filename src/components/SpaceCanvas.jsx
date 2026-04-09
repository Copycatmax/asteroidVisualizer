import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere } from '@react-three/drei';
import { AsteroidSwarm } from './AsteroidSwarm';
import { CloseApproaches } from './CloseApproaches';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

export function SpaceCanvas({ approachesData }) {
  return (
    <div className="canvas-container">
      <Canvas camera={{ position: [0, 40, 60], fov: 45 }}>
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 0, 0]} intensity={1.5} color="#fffcf5" />

        <Suspense fallback={null}>
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          {/* Earth Placeholder (At Origin) */}
          <Sphere args={[2, 32, 32]} position={[0, 0, 0]}>
            <meshStandardMaterial color="#2d5e9e" roughness={0.7} metalness={0.1} />
          </Sphere>

          <AsteroidSwarm />
          {approachesData && <CloseApproaches data={approachesData} />}

          <EffectComposer>
            <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} />
          </EffectComposer>
        </Suspense>

        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          maxDistance={300}
        />
      </Canvas>
    </div>
  );
}
