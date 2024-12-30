import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export function Astronaut() {
  const astronautRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (astronautRef.current) {
      astronautRef.current.rotation.y += 0.005
      astronautRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.2
    }
  })

  return (
    <group ref={astronautRef} position={[0, 0, 0]} scale={2}>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <capsuleGeometry args={[1, 2, 4, 8]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

useGLTF.preload('/astronaut.glb') 