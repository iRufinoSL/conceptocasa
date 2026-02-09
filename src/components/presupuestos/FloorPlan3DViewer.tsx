import { useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

// Separate component so hooks aren't conditional
function HipRoofMesh({ position, vertices, indices }: { position: [number, number, number]; vertices: Float32Array; indices: number[] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [vertices, indices]);

  return (
    <mesh position={position} geometry={geometry} castShadow>
      <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Room colors mapped by name keywords
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

// Create wall geometry with openings cut out
function WallMesh({
  position,
  size,
  color,
  openings,
  wallThickness,
}: {
  position: [number, number, number];
  size: [number, number, number]; // width, height, depth
  color: string;
  openings: { posX: number; width: number; height: number }[];
  wallThickness: number;
}) {
  const geometry = useMemo(() => {
    const [w, h, d] = size;
    // Base wall shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, h);
    shape.lineTo(0, h);
    shape.closePath();

    // Cut openings
    openings.forEach((op) => {
      const hole = new THREE.Path();
      const ox = Math.max(0.05, Math.min(op.posX, w - op.width - 0.05));
      const oy = op.height > 1.5 ? 0 : 0.9; // doors start at floor, windows at 0.9m
      hole.moveTo(ox, oy);
      hole.lineTo(ox + op.width, oy);
      hole.lineTo(ox + op.width, oy + op.height);
      hole.lineTo(ox, oy + op.height);
      hole.closePath();
      shape.holes.push(hole);
    });

    const extrudeSettings = { depth: d, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [size, openings]);

  return (
    <mesh position={position} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

// Floor tile for a room
function RoomFloor({
  posX, posY, width, length, color, name, height,
}: {
  posX: number; posY: number; width: number; length: number; color: string; name: string; height: number;
}) {
  return (
    <group>
      {/* Floor */}
      <mesh position={[posX + width / 2, 0.01, posY + length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Room label */}
      <Text
        position={[posX + width / 2, 0.05, posY + length / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color="#333"
        anchorX="center"
        anchorY="middle"
        maxWidth={width - 0.2}
      >
        {name}
      </Text>
    </group>
  );
}

// Build walls for a room
function RoomWalls({
  room, plan, isExternal,
}: {
  room: RoomData;
  plan: FloorPlanData;
  isExternal: (roomId: string, wallIndex: number) => boolean;
}) {
  const walls = useMemo(() => {
    const result: JSX.Element[] = [];
    const h = room.height || plan.defaultHeight;

    room.walls.forEach((wall) => {
      const ext = isExternal(room.id, wall.wallIndex);
      const thickness = wall.thickness || (ext ? plan.externalWallThickness : plan.internalWallThickness);
      const color = ext ? '#c4a882' : '#d8cfc0';

      const openings = wall.openings.map((op) => ({
        posX: op.positionX,
        width: op.width,
        height: op.height,
      }));

      let pos: [number, number, number];
      let size: [number, number, number];
      let rotation: [number, number, number] = [0, 0, 0];

      switch (wall.wallIndex) {
        case 1: // Top wall (along width, at posY)
          pos = [room.posX, 0, room.posY - thickness];
          size = [room.width, h, thickness];
          break;
        case 3: // Bottom wall (along width, at posY + length)
          pos = [room.posX, 0, room.posY + room.length];
          size = [room.width, h, thickness];
          break;
        case 4: // Left wall (along length, at posX)
          pos = [room.posX, 0, room.posY];
          size = [room.length, h, thickness];
          rotation = [0, Math.PI / 2, 0];
          break;
        case 2: // Right wall (along length, at posX + width)
          pos = [room.posX + room.width + thickness, 0, room.posY];
          size = [room.length, h, thickness];
          rotation = [0, Math.PI / 2, 0];
          break;
        default:
          return;
      }

      result.push(
        <group key={`${room.id}-wall-${wall.wallIndex}`} rotation={rotation}>
          <WallMesh
            position={pos}
            size={size}
            color={color}
            openings={openings}
            wallThickness={thickness}
          />
        </group>
      );
    });

    return result;
  }, [room, plan, isExternal]);

  return <>{walls}</>;
}

// Ground plane
function Ground({ width, length }: { width: number; length: number }) {
  const size = Math.max(width, length) * 3;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, -0.01, length / 2]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#8fbc8f" roughness={1} />
    </mesh>
  );
}

// Roof
function Roof({ plan }: { plan: FloorPlanData }) {
  const h = plan.defaultHeight;
  const overhang = plan.roofOverhang;
  const slopeRatio = plan.roofSlopePercent / 100;
  const w = plan.width + 2 * overhang;
  const l = plan.length + 2 * overhang;
  const cx = plan.width / 2;
  const cz = plan.length / 2;

  if (plan.roofType === 'plana') {
    return (
      <mesh position={[cx, h + 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[w, l]} />
        <meshStandardMaterial color="#8b7355" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  const halfW = w / 2;
  const rise = halfW * slopeRatio;

  if (plan.roofType === 'dos_aguas') {
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(0, rise);
    shape.lineTo(halfW, 0);
    shape.closePath();

    const extrudeSettings = { depth: l, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    return (
      <mesh
        position={[cx, h, cz - l / 2]}
        rotation={[0, 0, 0]}
        geometry={geometry}
        castShadow
      >
        <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  // cuatro_aguas - simplified pyramid
  const vertices = new Float32Array([
    // base
    -halfW, 0, -l / 2,
    halfW, 0, -l / 2,
    halfW, 0, l / 2,
    -halfW, 0, l / 2,
    // peak
    0, rise, 0,
  ]);

  const indices = [
    0, 1, 4, // front
    1, 2, 4, // right
    2, 3, 4, // back
    3, 0, 4, // left
    0, 2, 1, 0, 3, 2, // base
  ];

  return (
    <HipRoofMesh position={[cx, h, cz]} vertices={vertices} indices={indices} />
  );
}

// Auto-frame camera
function CameraSetup({ width, length, height }: { width: number; height: number; length: number }) {
  const { camera } = useThree();
  useMemo(() => {
    const dist = Math.max(width, length) * 1.8;
    camera.position.set(width / 2 + dist * 0.6, height * 2.5, length / 2 + dist * 0.6);
    camera.lookAt(width / 2, height / 2, length / 2);
  }, [width, length, height]);
  return null;
}

// Main 3D scene
function FloorPlan3DScene({
  plan,
  rooms,
}: {
  plan: FloorPlanData;
  rooms: RoomData[];
}) {
  const isExternal = (roomId: string, wallIndex: number): boolean => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return false;
    const wall = room.walls.find((w) => w.wallIndex === wallIndex);
    return wall?.wallType === 'externa';
  };

  return (
    <>
      <CameraSetup width={plan.width} length={plan.length} height={plan.defaultHeight} />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[plan.width * 2, plan.defaultHeight * 4, -plan.length]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight args={['#87ceeb', '#8fbc8f', 0.3]} />

      <Ground width={plan.width} length={plan.length} />

      {rooms.map((room) => (
        <group key={room.id}>
          <RoomFloor
            posX={room.posX}
            posY={room.posY}
            width={room.width}
            length={room.length}
            color={getRoomColor(room.name)}
            name={room.name}
            height={room.height || plan.defaultHeight}
          />
          <RoomWalls room={room} plan={plan} isExternal={isExternal} />
        </group>
      ))}

      <Roof plan={plan} />

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
    <div className="w-full h-[500px] rounded-lg overflow-hidden border bg-gradient-to-b from-sky-200 to-sky-100">
      <Canvas shadows gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault fov={50} near={0.1} far={200} />
        <FloorPlan3DScene plan={plan} rooms={rooms} />
      </Canvas>
    </div>
  );
}
