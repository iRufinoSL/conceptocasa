import { useMemo, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls } from '@/lib/floor-plan-calculations';

const ROOM_COLORS: Record<string, string> = {
  salón: '#e8d5b7',
  cocina: '#c4d4aa',
  habitación: '#b5c8d8',
  baño: '#d4e6f1',
  despensa: '#f0e6d3',
  pasillo: '#ddd8d0',
  entrada: '#e0d4c0',
  principal: '#c8b8d8',
};

function getRoomColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(ROOM_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#ddd8d0';
}

function WallMesh({
  position,
  size,
  color,
  openings,
  rotation,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  openings: { posX: number; width: number; height: number }[];
  rotation?: [number, number, number];
}) {
  const geometry = useMemo(() => {
    const [w, h, d] = size;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, h);
    shape.lineTo(0, h);
    shape.closePath();

    openings.forEach((op) => {
      const hole = new THREE.Path();
      const ox = Math.max(0.05, Math.min(op.posX, w - op.width - 0.05));
      const oy = op.height > 1.5 ? 0 : 0.9;
      hole.moveTo(ox, oy);
      hole.lineTo(ox + op.width, oy);
      hole.lineTo(ox + op.width, oy + op.height);
      hole.lineTo(ox, oy + op.height);
      hole.closePath();
      shape.holes.push(hole);
    });

    return new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  }, [size, openings]);

  return (
    <mesh position={position} rotation={rotation || [0, 0, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function RoomFloor({ room, plan }: { room: RoomData; plan: FloorPlanData }) {
  const color = getRoomColor(room.name);
  return (
    <group>
      <mesh position={[room.posX + room.width / 2, 0.01, room.posY + room.length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.length]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <Text
        position={[room.posX + room.width / 2, 0.05, room.posY + room.length / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(0.3, room.width / 6)}
        color="#333"
        anchorX="center"
        anchorY="middle"
        maxWidth={room.width - 0.2}
      >
        {room.name}
      </Text>
    </group>
  );
}

function RoomWalls({ room, plan, wallClassification }: { room: RoomData; plan: FloorPlanData; wallClassification?: Map<string, string> }) {
  const h = room.height || plan.defaultHeight;

  return (
    <>
      {room.walls.map((wall) => {
        const wallKey = `${room.id}::${wall.wallIndex}`;
        const effectiveType = wallClassification?.get(wallKey) || wall.wallType;
        
        // Skip invisible walls - they don't render in 3D
        if (effectiveType === 'invisible') return null;
        
        const ext = effectiveType === 'externa';
        const thickness = wall.thickness || (ext ? plan.externalWallThickness : plan.internalWallThickness);
        const color = ext ? '#c4a882' : '#d8cfc0';
        const openings = wall.openings.map((op) => ({
          posX: op.positionX,
          width: op.width,
          height: op.height,
        }));

        let pos: [number, number, number];
        let size: [number, number, number];
        let rot: [number, number, number] = [0, 0, 0];

        switch (wall.wallIndex) {
          case 1: // Top
            pos = [room.posX, 0, room.posY - thickness];
            size = [room.width, h, thickness];
            break;
          case 3: // Bottom
            pos = [room.posX, 0, room.posY + room.length];
            size = [room.width, h, thickness];
            break;
          case 4: // Left
            pos = [room.posX - thickness, 0, room.posY + room.length];
            size = [room.length, h, thickness];
            rot = [0, -Math.PI / 2, 0];
            break;
          case 2: // Right
            pos = [room.posX + room.width + thickness, 0, room.posY + room.length];
            size = [room.length, h, thickness];
            rot = [0, -Math.PI / 2, 0];
            break;
          default:
            return null;
        }

        return (
          <WallMesh
            key={`${room.id}-wall-${wall.wallIndex}`}
            position={pos}
            size={size}
            color={color}
            openings={openings}
            rotation={rot}
          />
        );
      })}
    </>
  );
}

function Ground({ width, length }: { width: number; length: number }) {
  const size = Math.max(width, length) * 3;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, -0.01, length / 2]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#8fbc8f" roughness={1} />
    </mesh>
  );
}

function HipRoof({ cx, cz, h, halfW, halfL, rise }: { cx: number; cz: number; h: number; halfW: number; halfL: number; rise: number }) {
  const geometry = useMemo(() => {
    const vertices = new Float32Array([
      -halfW, 0, -halfL,
      halfW, 0, -halfL,
      halfW, 0, halfL,
      -halfW, 0, halfL,
      0, rise, 0,
    ]);
    const indices = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [halfW, halfL, rise]);

  return (
    <mesh position={[cx, h, cz]} geometry={geometry} castShadow>
      <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Roof({ plan, rooms }: { plan: FloorPlanData; rooms: RoomData[] }) {
  const h = plan.defaultHeight;
  const overhang = plan.roofOverhang;
  const slopeRatio = plan.roofSlopePercent / 100;

  // Compute bounding box from actual rooms instead of plan dimensions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.posX);
    minY = Math.min(minY, r.posY);
    maxX = Math.max(maxX, r.posX + r.width);
    maxY = Math.max(maxY, r.posY + r.length);
  });
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = plan.width; maxY = plan.length; }

  const roomsW = maxX - minX;
  const roomsL = maxY - minY;
  const w = roomsW + 2 * overhang;
  const l = roomsL + 2 * overhang;
  const cx = minX + roomsW / 2;
  const cz = minY + roomsL / 2;
  const halfW = w / 2;
  const halfL = l / 2;
  const rise = halfW * slopeRatio;

  const gableGeometry = useMemo(() => {
    if (plan.roofType !== 'dos_aguas') return null;
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(0, rise);
    shape.lineTo(halfW, 0);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false });
  }, [plan.roofType, halfW, rise, l]);

  if (plan.roofType === 'plana') {
    return (
      <mesh position={[cx, h + 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[w, l]} />
        <meshStandardMaterial color="#8b7355" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  if (plan.roofType === 'dos_aguas' && gableGeometry) {
    return (
      <mesh position={[cx, h, cz - l / 2]} geometry={gableGeometry} castShadow>
        <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  return <HipRoof cx={cx} cz={cz} h={h} halfW={halfW} halfL={halfL} rise={rise} />;
}

function Scene({ plan, rooms }: { plan: FloorPlanData; rooms: RoomData[] }) {
  const { camera } = useThree();
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);

  useMemo(() => {
    const dist = Math.max(plan.width, plan.length) * 1.8;
    camera.position.set(plan.width / 2 + dist * 0.6, plan.defaultHeight * 2.5, plan.length / 2 + dist * 0.6);
    camera.lookAt(plan.width / 2, plan.defaultHeight / 2, plan.length / 2);
  }, [plan.width, plan.length, plan.defaultHeight]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[plan.width * 2, plan.defaultHeight * 4, -plan.length]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={['#87ceeb', '#8fbc8f', 0.3]} />
      <Ground width={plan.width} length={plan.length} />
      {rooms.map((room) => (
        <group key={room.id}>
          <RoomFloor room={room} plan={plan} />
          <RoomWalls room={room} plan={plan} wallClassification={wallClassification} />
        </group>
      ))}
      <Roof plan={plan} rooms={rooms} />
      <OrbitControls
        target={[plan.width / 2, plan.defaultHeight / 2, plan.length / 2]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={3}
        maxDistance={Math.max(plan.width, plan.length) * 4}
      />
    </>
  );
}

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden border" style={{ background: 'linear-gradient(to bottom, #bae6fd, #e0f2fe)' }}>
      <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Cargando vista 3D…</div>}>
        <Canvas shadows gl={{ antialias: true }}>
          <PerspectiveCamera makeDefault fov={50} near={0.1} far={200} />
          <Scene plan={plan} rooms={rooms} />
        </Canvas>
      </Suspense>
    </div>
  );
}
