import { useMemo, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';
import { autoClassifyWalls, isExteriorType, isInvisibleType } from '@/lib/floor-plan-calculations';

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

/**
 * Build a wall geometry: lies along X (0..wallLen), stands along Y (0..wallH),
 * extruded along Z (0..thickness). Openings cut as rectangular holes.
 */
function buildWallGeometry(
  wallLen: number,
  wallH: number,
  thickness: number,
  openings: { posX: number; width: number; height: number; isDoor: boolean }[],
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(wallLen, 0);
  shape.lineTo(wallLen, wallH);
  shape.lineTo(0, wallH);
  shape.closePath();

  openings.forEach((op) => {
    const hole = new THREE.Path();
    const center = op.posX * wallLen;
    const halfW = op.width / 2;
    let ox = center - halfW;
    ox = Math.max(0.02, Math.min(ox, wallLen - op.width - 0.02));
    const oy = op.isDoor ? 0 : 0.9;
    hole.moveTo(ox, oy);
    hole.lineTo(ox + op.width, oy);
    hole.lineTo(ox + op.width, oy + op.height);
    hole.lineTo(ox, oy + op.height);
    hole.closePath();
    shape.holes.push(hole);
  });

  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
}

/**
 * Wall placement convention (top-down view, +X = right, +Z = south):
 *   Room occupies [posX..posX+width] on X, [posY..posY+length] on Z.
 *
 * Rotation -PI/2 around Y maps local (x,y,z) → world offset (-z, y, x)
 * Rotation +PI/2 around Y maps local (x,y,z) → world offset (z, y, -x)
 */
function RoomWalls({
  room,
  plan,
  wallClassification,
}: {
  room: RoomData;
  plan: FloorPlanData;
  wallClassification: Map<string, string>;
}) {
  const h = room.height || plan.defaultHeight;

  const wallElements = useMemo(() => {
    const elements: JSX.Element[] = [];

    room.walls.forEach((wall) => {
      const wallKey = `${room.id}::${wall.wallIndex}`;
      const effectiveType = wallClassification.get(wallKey) || wall.wallType;
      if (isInvisibleType(effectiveType)) return;

      const ext = isExteriorType(effectiveType);
      const thickness = wall.thickness || (ext ? plan.externalWallThickness : plan.internalWallThickness);
      const color = ext ? '#c4a882' : '#d8cfc0';

      const openings = wall.openings.map((op) => ({
        posX: op.positionX,
        width: op.width,
        height: op.height,
        isDoor: op.openingType.startsWith('puerta'),
      }));

      const isHorizontal = wall.wallIndex === 1 || wall.wallIndex === 3;
      const wallLen = isHorizontal ? room.width : room.length;

      const geo = buildWallGeometry(wallLen, h, thickness, openings);

      let px: number, py: number, pz: number;
      let ry = 0;

      switch (wall.wallIndex) {
        case 1: // North wall: runs along X at Z = posY
          // Geo goes x=0..width, z=0..thickness (toward +Z = into room)
          // Place so front face is at posY, thickness goes outward (-Z)
          px = room.posX;
          py = 0;
          pz = room.posY - thickness;
          ry = 0;
          break;
        case 3: // South wall: runs along X at Z = posY + length
          // Geo goes x=0..width, z=0..thickness (toward +Z = outward)
          px = room.posX;
          py = 0;
          pz = room.posY + room.length;
          ry = 0;
          break;
        case 4: {
          // West wall: runs along Z at X = posX
          // Rotate +PI/2: local(x,y,z) → world(z, y, -x)
          // local x=0..wallLen → world z=0..wallLen → offset from posY
          // local z=0..thickness → world x=0..-thickness → extends toward -X (outward)
          px = room.posX;
          py = 0;
          pz = room.posY;
          ry = Math.PI / 2;
          break;
        }
        case 2: {
          // East wall: runs along Z at X = posX + width
          // Rotate -PI/2: local(x,y,z) → world(-z, y, x)
          // local x=0..wallLen → world z=x (from 0 to wallLen)
          // local z=0..thickness → world x=-z (from 0 to -thickness)
          // Position at (posX+width+thickness) so x spans [posX+width, posX+width+thickness]
          px = room.posX + room.width + thickness;
          py = 0;
          pz = room.posY;
          ry = -Math.PI / 2;
          break;
        }
        default:
          return;
      }

      elements.push(
        <mesh
          key={`${room.id}-wall-${wall.wallIndex}`}
          position={[px, py, pz]}
          rotation={[0, ry, 0]}
          geometry={geo}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>,
      );
    });

    return elements;
  }, [room, plan, wallClassification, h]);

  return <>{wallElements}</>;
}

function RoomFloor({ room }: { room: RoomData }) {
  if (room.hasFloor === false) return null;
  const color = getRoomColor(room.name);
  return (
    <group>
      <mesh
        position={[room.posX + room.width / 2, 0.01, room.posY + room.length / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
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

function RoomCeiling({ room, plan }: { room: RoomData; plan: FloorPlanData }) {
  if (room.hasCeiling === false) return null;
  const h = room.height || plan.defaultHeight;
  return (
    <mesh
      position={[room.posX + room.width / 2, h - 0.01, room.posY + room.length / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[room.width, room.length]} />
      <meshStandardMaterial color="#f5f0e8" roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.6} />
    </mesh>
  );
}

function Ground({ cx, cz, size }: { cx: number; cz: number; size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#8fbc8f" roughness={1} />
    </mesh>
  );
}

function Roof({ plan, rooms }: { plan: FloorPlanData; rooms: RoomData[] }) {
  const roofRooms = rooms.filter((r) => r.hasRoof !== false);
  const h = plan.defaultHeight;
  const overhang = plan.roofOverhang;
  const slopeRatio = plan.roofSlopePercent / 100;

  const bounds = useMemo(() => {
    if (roofRooms.length === 0) return null;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    roofRooms.forEach((r) => {
      minX = Math.min(minX, r.posX);
      minZ = Math.min(minZ, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxZ = Math.max(maxZ, r.posY + r.length);
    });
    if (!isFinite(minX)) return null;
    const rw = maxX - minX;
    const rl = maxZ - minZ;
    const w = rw + 2 * overhang;
    const l = rl + 2 * overhang;
    return {
      cx: minX + rw / 2,
      cz: minZ + rl / 2,
      w,
      l,
      halfW: w / 2,
      halfL: l / 2,
      rise: (Math.min(w, l) / 2) * slopeRatio,
    };
  }, [roofRooms, overhang, slopeRatio]);

  const ridgeAlongZ = bounds ? bounds.l >= bounds.w : true;

  const gableGeo = useMemo(() => {
    if (!bounds || plan.roofType !== 'dos_aguas') return null;
    const shape = new THREE.Shape();
    if (ridgeAlongZ) {
      shape.moveTo(-bounds.halfW, 0);
      shape.lineTo(0, bounds.rise);
      shape.lineTo(bounds.halfW, 0);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: bounds.l, bevelEnabled: false });
    } else {
      shape.moveTo(-bounds.halfL, 0);
      shape.lineTo(0, bounds.rise);
      shape.lineTo(bounds.halfL, 0);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: bounds.w, bevelEnabled: false });
    }
  }, [bounds, ridgeAlongZ, plan.roofType]);

  const hipGeo = useMemo(() => {
    if (!bounds || plan.roofType !== 'cuatro_aguas') return null;
    const hw = bounds.halfW;
    const hl = bounds.halfL;
    const r = bounds.rise;
    const verts = new Float32Array([
      -hw, 0, -hl,
       hw, 0, -hl,
       hw, 0,  hl,
      -hw, 0,  hl,
        0, r,   0,
    ]);
    const idx = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [bounds, plan.roofType]);

  if (!bounds) return null;

  if (plan.roofType === 'plana') {
    return (
      <mesh position={[bounds.cx, h + 0.05, bounds.cz]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[bounds.w, bounds.l]} />
        <meshStandardMaterial color="#8b7355" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  if (plan.roofType === 'dos_aguas' && gableGeo) {
    if (ridgeAlongZ) {
      return (
        <mesh position={[bounds.cx, h, bounds.cz - bounds.halfL]} geometry={gableGeo} castShadow>
          <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      );
    } else {
      return (
        <mesh position={[bounds.cx + bounds.halfW, h, bounds.cz]} rotation={[0, Math.PI / 2, 0]} geometry={gableGeo} castShadow>
          <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      );
    }
  }

  if (hipGeo) {
    return (
      <mesh position={[bounds.cx, h, bounds.cz]} geometry={hipGeo} castShadow>
        <meshStandardMaterial color="#8b4513" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  return null;
}

/** Sets up camera to frame the scene properly */
function CameraSetup({ bounds, defaultHeight }: { bounds: { w: number; l: number; cx: number; cz: number }; defaultHeight: number }) {
  const { camera } = useThree();

  useEffect(() => {
    const dist = Math.max(bounds.w, bounds.l) * 1.8;
    camera.position.set(bounds.cx + dist * 0.6, defaultHeight * 2.5, bounds.cz + dist * 0.6);
    camera.lookAt(bounds.cx, defaultHeight / 2, bounds.cz);
    camera.updateProjectionMatrix();
  }, [camera, bounds, defaultHeight]);

  return null;
}

function Scene({ plan, rooms }: { plan: FloorPlanData; rooms: RoomData[] }) {
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);

  const bounds = useMemo(() => {
    let minX = 0, minZ = 0, maxX = plan.width, maxZ = plan.length;
    rooms.forEach((r) => {
      minX = Math.min(minX, r.posX);
      minZ = Math.min(minZ, r.posY);
      maxX = Math.max(maxX, r.posX + r.width);
      maxZ = Math.max(maxZ, r.posY + r.length);
    });
    const w = maxX - minX;
    const l = maxZ - minZ;
    return { minX, minZ, maxX, maxZ, w, l, cx: minX + w / 2, cz: minZ + l / 2 };
  }, [rooms, plan]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[bounds.cx + bounds.w, plan.defaultHeight * 4, bounds.cz - bounds.l]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={['#87ceeb', '#8fbc8f', 0.3]} />
      <CameraSetup bounds={bounds} defaultHeight={plan.defaultHeight} />
      <Ground cx={bounds.cx} cz={bounds.cz} size={Math.max(bounds.w, bounds.l) * 3} />
      {rooms.map((room) => (
        <group key={room.id}>
          <RoomFloor room={room} />
          <RoomCeiling room={room} plan={plan} />
          <RoomWalls room={room} plan={plan} wallClassification={wallClassification} />
        </group>
      ))}
      <Roof plan={plan} rooms={rooms} />
      <OrbitControls
        target={[bounds.cx, plan.defaultHeight / 2, bounds.cz]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2}
        maxDistance={Math.max(bounds.w, bounds.l) * 5}
        enableDamping
        dampingFactor={0.1}
      />
    </>
  );
}

interface FloorPlan3DViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
}

export function FloorPlan3DViewer({ plan, rooms }: FloorPlan3DViewerProps) {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="w-full h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-2 p-4">
          <p className="text-sm text-destructive font-medium">Error al cargar vista 3D</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            className="text-xs underline text-primary"
            onClick={() => setError(null)}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!rooms || rooms.length === 0) {
    return (
      <div className="w-full h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Añade estancias para ver la vista 3D</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden border relative" style={{ background: 'linear-gradient(to bottom, #bae6fd, #e0f2fe)' }}>
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
        onError={() => setError('WebGL no disponible o error de renderizado')}
      >
        <PerspectiveCamera makeDefault fov={50} near={0.1} far={500} />
        <Scene plan={plan} rooms={rooms} />
      </Canvas>
      <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-muted-foreground pointer-events-none">
        🖱️ Arrastrar: rotar · Scroll: zoom · Clic derecho: desplazar
      </div>
    </div>
  );
}
