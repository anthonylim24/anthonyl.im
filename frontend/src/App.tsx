import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text, Float, Stars } from '@react-three/drei'
import { Astronaut } from './components/Astronaut'
import './App.css'

function Scene() {
  return (
    <>
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 10, 20]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      {/* Floating name */}
      <Float
        speed={2}
        rotationIntensity={0.5}
        floatIntensity={0.5}
      >
        <Text
          fontSize={1.5}
          position={[0, 2, 0]}
          maxWidth={4}
          textAlign="center"
        >
          ANTHONY LIM
          <meshStandardMaterial
            color="#ffffff"
            emissive="#cc00ff"
            emissiveIntensity={0.2}
            roughness={0.3}
            metalness={0.8}
          />
        </Text>
      </Float>

      {/* Background elements */}
      <Stars 
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />

      {/* Astronaut */}
      <group position={[0, -1, -4]}>
        <Astronaut />
      </group>

      <OrbitControls 
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 2}
      />
    </>
  )
}

function App() {
  return (
    <div className="app">
      <Canvas className="canvas">
        <Scene />
      </Canvas>
      
      <div className="content">
        <nav>
          <a href="#work">Workout</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
        
        <div className="title-container">
          <h2 className="subtitle">Full-Stack Developer</h2>
        </div>
      </div>
    </div>
  )
}

export default App
