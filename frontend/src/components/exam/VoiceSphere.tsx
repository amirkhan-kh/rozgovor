import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Sparkles, Environment, Stars } from "@react-three/drei";
import * as THREE from "three";

export type VoiceSphereStatus = "idle" | "listening" | "speaking" | "thinking";

interface VoiceSphereProps {
  aiLevel: number;
  micLevel: number;
  frequencyData?: Uint8Array;
  status: VoiceSphereStatus;
}

// Yangi palitra — har holat uchun ko'plab gradient layerlar
const STATUS_PALETTE: Record<
  VoiceSphereStatus,
  {
    core: string;       // ichki yorug'lik
    mid: string;        // o'rta tonus
    outer: string;      // tashqi shu'la
    emissive: string;   // glow
    sparkle: string;    // particle rang
  }
> = {
  idle: {
    core: "#5b6cff",
    mid: "#3b3eaa",
    outer: "#1b1f55",
    emissive: "#1e2a78",
    sparkle: "#a5b4fc",
  },
  listening: {
    core: "#22d3ee",
    mid: "#0ea5e9",
    outer: "#0c4a6e",
    emissive: "#0e7490",
    sparkle: "#67e8f9",
  },
  speaking: {
    core: "#f0abfc",
    mid: "#c084fc",
    outer: "#6b21a8",
    emissive: "#7c3aed",
    sparkle: "#fbcfe8",
  },
  thinking: {
    core: "#fbbf24",
    mid: "#f59e0b",
    outer: "#78350f",
    emissive: "#b45309",
    sparkle: "#fef3c7",
  },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface OrbProps extends VoiceSphereProps {}

const Orb: React.FC<OrbProps> = ({ aiLevel, micLevel, frequencyData, status }) => {
  const groupRef = useRef<THREE.Group>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<unknown>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);

  const palette = STATUS_PALETTE[status];
  const coreColor = useMemo(() => new THREE.Color(palette.core), [palette.core]);
  const midColor = useMemo(() => new THREE.Color(palette.mid), [palette.mid]);
  const outerColor = useMemo(() => new THREE.Color(palette.outer), [palette.outer]);
  const emissiveColor = useMemo(() => new THREE.Color(palette.emissive), [palette.emissive]);
  const sparkleColor = useMemo(() => new THREE.Color(palette.sparkle), [palette.sparkle]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const energy = Math.max(aiLevel, micLevel * 0.9);

    // FFT'dan past chastotalar (bass) — pulse uchun
    let bass = 0;
    if (frequencyData && frequencyData.length > 0) {
      const bins = Math.min(8, frequencyData.length);
      let s = 0;
      for (let i = 0; i < bins; i++) s += frequencyData[i];
      bass = s / (bins * 255);
    }

    // Group nimaki tebranishi va aylanishi
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (status === "speaking" ? 0.4 : 0.15);
      groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.08;
      // Audio shake (Google Meet uslubidagi)
      const shake = energy * 0.06;
      groupRef.current.position.x = Math.sin(t * 18) * shake;
      groupRef.current.position.y = Math.cos(t * 21) * shake;
    }

    // Asosiy distort sphere
    if (coreMeshRef.current) {
      const idlePulse = 1 + Math.sin(t * 1.4) * 0.04;
      const scale = idlePulse + energy * 0.9 + bass * 0.5;
      coreMeshRef.current.scale.setScalar(
        lerp(coreMeshRef.current.scale.x, scale, 0.18),
      );
    }

    // Distort material — speed va distort darajasi
    if (matRef.current) {
      const m = matRef.current as { distort: number; speed: number };
      const targetDistort = 0.35 + energy * 1.6 + bass * 0.4;
      m.distort = lerp(m.distort, targetDistort, 0.18);
      const targetSpeed =
        status === "speaking" ? 6 : status === "listening" ? 3.5 : 1.5;
      m.speed = lerp(m.speed, targetSpeed, 0.1);
    }

    // Ichki yorug'lik
    if (innerGlowRef.current) {
      const innerScale = 0.6 + energy * 0.6 + Math.sin(t * 2) * 0.05;
      innerGlowRef.current.scale.setScalar(innerScale);
      const mat = innerGlowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + energy * 0.4;
    }

    // Tashqi halo (eng tashqi shu'la)
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * 0.05;
      const scale = 2.4 + Math.sin(t * 0.8) * 0.08 + energy * 0.3;
      haloRef.current.scale.setScalar(scale);
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + energy * 0.25;
    }

    // 3 ta orbital ring — har biri farqli speed/eccentricity
    [ring1Ref, ring2Ref, ring3Ref].forEach((ref, i) => {
      if (!ref.current) return;
      const dir = i % 2 === 0 ? 1 : -1;
      ref.current.rotation.z += delta * (0.2 + i * 0.15) * dir;
      ref.current.rotation.x = Math.sin(t * 0.4 + i * 0.7) * 0.15;
      const baseR = 1.65 + i * 0.18;
      const r = baseR + Math.sin(t * (0.6 + i * 0.3)) * 0.04 + energy * (0.12 + i * 0.05);
      ref.current.scale.setScalar(r / baseR);
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + energy * 0.5 + bass * 0.2;
    });
  });

  return (
    <>
      {/* Sahnaning yorug'lik to'plami — kinematic, bo'sh joylar */}
      <ambientLight intensity={0.3} />
      <pointLight position={[6, 6, 6]} intensity={1.6} color={coreColor} />
      <pointLight position={[-6, -3, 5]} intensity={1.0} color={midColor} />
      <pointLight position={[0, 0, 7]} intensity={0.7} color="#ffffff" />
      <pointLight position={[0, -6, -3]} intensity={0.5} color={outerColor} />

      <group ref={groupRef}>
        {/* Inner glow — eng ichki shu'la (ko'rinmas mesh, faqat opacity bilan) */}
        <mesh ref={innerGlowRef}>
          <sphereGeometry args={[1.0, 32, 32]} />
          <meshBasicMaterial color={coreColor} transparent opacity={0.4} />
        </mesh>

        {/* Asosiy distort sphere — yuqori sifatli geometriya */}
        <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.3}>
          <mesh ref={coreMeshRef}>
            <icosahedronGeometry args={[1.2, 96]} />
            <MeshDistortMaterial
              ref={matRef as React.Ref<never>}
              color={coreColor}
              emissive={emissiveColor}
              emissiveIntensity={0.9}
              roughness={0.1}
              metalness={0.6}
              distort={0.35}
              speed={2}
              clearcoat={1}
              clearcoatRoughness={0.1}
            />
          </mesh>
        </Float>

        {/* 3 ta orbital ring */}
        <mesh ref={ring1Ref} rotation={[Math.PI / 2.05, 0, 0]}>
          <ringGeometry args={[1.65, 1.7, 128]} />
          <meshBasicMaterial color={coreColor} transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={ring2Ref} rotation={[Math.PI / 1.7, 0.3, 0]}>
          <ringGeometry args={[1.85, 1.88, 128]} />
          <meshBasicMaterial color={midColor} transparent opacity={0.18} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={ring3Ref} rotation={[Math.PI / 2.4, -0.2, 0.4]}>
          <ringGeometry args={[2.05, 2.07, 128]} />
          <meshBasicMaterial color={sparkleColor} transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>

        {/* Tashqi halo */}
        <mesh ref={haloRef}>
          <sphereGeometry args={[1.0, 32, 32]} />
          <meshBasicMaterial
            color={outerColor}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>

        {/* Particle field — galaktika uslubidagi sparkles */}
        <Sparkles
          count={120}
          scale={[5, 5, 5]}
          size={3}
          speed={status === "speaking" ? 1.5 : 0.6}
          color={sparkleColor}
          opacity={0.6}
        />
        <Sparkles
          count={60}
          scale={[3.2, 3.2, 3.2]}
          size={2}
          speed={1}
          color={coreColor}
          opacity={0.8}
        />
      </group>

      {/* Background stars — chuqurlik hissi */}
      <Stars
        radius={20}
        depth={50}
        count={400}
        factor={2}
        saturation={0.5}
        fade
        speed={0.2}
      />

      <Environment preset="night" />
    </>
  );
};

export const VoiceSphere: React.FC<VoiceSphereProps> = (props) => {
  // Status'ga qarab CSS glow rangi
  const glowColor: Record<VoiceSphereStatus, string> = {
    idle: "rgba(99, 102, 241, 0.25)",
    listening: "rgba(34, 211, 238, 0.3)",
    speaking: "rgba(192, 132, 252, 0.35)",
    thinking: "rgba(245, 158, 11, 0.3)",
  };

  return (
    <div className="relative w-full aspect-square max-w-[600px] mx-auto">
      {/* Tashqi yumshoq glow — CSS bilan */}
      <div
        className="absolute inset-[-8%] rounded-full blur-3xl pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: glowColor[props.status] }}
      />
      <div className="absolute inset-12 rounded-full bg-cyan-500/8 blur-2xl pointer-events-none" />
      <div className="absolute inset-20 rounded-full bg-violet-500/8 blur-2xl pointer-events-none" />

      <Canvas
        camera={{ position: [0, 0, 4.8], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <Orb {...props} />
      </Canvas>
    </div>
  );
};

export default VoiceSphere;
