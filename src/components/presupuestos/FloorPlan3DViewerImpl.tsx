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

/**
 * Build a wall as an ExtrudeGeometry lying flat along the X axis (width=wallLen),
 * standing up along Y (height=wallH), extruded along Z (depth=thickness).
 * Openings are cut as rectangular holes.
 *
 * The geometry origin is at (0,0,0) = bottom-left-front corner.
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
    // posX is fraction 0..1 of the wall length
    const center = op.posX * wallLen;
    const halfW = op.width / 2;
    let ox = center - halfW;
    // Clamp so hole doesn't overflow wall edges
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
 * Each wall is placed in world space using a <group> with position + rotation.
 * Wall indices: 1=top (north), 2=right (east), 3=bottom (south), 4=left (west).
 *
 * Convention (top-down, Z = "into screen" = south):
 *   - Room occupies [posX .. posX+width] on X, [posY .. posY+length] on Z.
 *   - Wall 1 (top/north): runs along X at Z = posY, faces outward (toward -Z)
 *   - Wall 3 (bottom/south): runs along X at Z = posY + length, faces outward (toward +Z)
 *   - Wall 4 (left/west): runs along Z at X = posX, faces outward (toward -X)
 *   - Wall 2 (right/east): runs along Z at X = posX + width, faces outward (toward +X)
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
      if (effectiveType === 'invisible') return;

      const ext = effectiveType === 'externa';
      const thickness = wall.thickness || (ext ? plan.externalWallThickness : plan.internalWallThickness);
      const color = ext ? '#c4a882' : '#d8cfc0';

      const openings = wall.openings.map((op) => ({
        posX: op.positionX,
        width: op.width,
        height: op.height,
        isDoor: op.openingType.startsWith('puerta'),
      }));

      // Determine wall length along its run direction
      const isHorizontal = wall.wallIndex === 1 || wall.wallIndex === 3;
      const wallLen = isHorizontal ? room.width : room.length;

      const geo = buildWallGeometry(wallLen, h, thickness, openings);

      // Position and rotation for each wall so it sits correctly in world space.
      // The geometry goes from x=0..wallLen, y=0..h, and extrudes z=0..thickness.
      let px: number, py: number, pz: number;
      let ry = 0; // rotation around Y axis

      switch (wall.wallIndex) {
        case 1: // Top (north) wall: runs along X at room's north edge
          // Wall faces -Z. Place so the front face (z=0 of geo) is at room.posY,
          // and the thickness goes into -Z. We achieve this by placing at z=posY and rotating 180° on Y
          // OR simply offset: place geo at z = posY - thickness (extrude goes +Z toward posY).
          px = room.posX;
          py = 0;
          pz = room.posY - thickness;
          ry = 0;
          break;
        case 3: // Bottom (south) wall: runs along X at room's south edge
          px = room.posX;
          py = 0;
          pz = room.posY + room.length;
          ry = 0;
          break;
        case 4: // Left (west) wall: runs along Z at room's west edge
          // Rotate -90° around Y so the wall length runs along Z.
          // After rotation, geo's X axis maps to -Z and Z axis maps to X.
          // We want the wall to span from posY to posY+length along Z.
          // Place origin at (posX, 0, posY + length) and rotate -90°.
          px = room.posX;
          py = 0;
          pz = room.posY + room.length;
          ry = -Math.PI / 2;
          break;
        case 2: // Right (east) wall: runs along Z at room's east edge
          // Similar to left but on the right side.
          // Place at (posX + width + thickness, 0, posY + length) and rotate -90°.
          px = room.posX + room.width + thickness;
          py = 0;
          pz = room.posY + room.length;
          ry = -Math.PI / 2;
          break;
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

function RoomFloor({ room, plan }: { room: RoomData; plan: FloorPlanData }) {
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

  // All geometry hooks must be called unconditionally (React rules of hooks)
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

function Scene({ plan, rooms }: { plan: FloorPlanData; rooms: RoomData[] }) {
  const { camera } = useThree();
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

  useMemo(() => {
    const dist = Math.max(bounds.w, bounds.l) * 1.8;
    camera.position.set(bounds.cx + dist * 0.6, plan.defaultHeight * 2.5, bounds.cz + dist * 0.6);
    camera.lookAt(bounds.cx, plan.defaultHeight / 2, bounds.cz);
  }, [bounds, plan.defaultHeight]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[bounds.cx + bounds.w, plan.defaultHeight * 4, bounds.cz - bounds.l]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={['#87ceeb', '#8fbc8f', 0.3]} />
      <Ground cx={bounds.cx} cz={bounds.cz} size={Math.max(bounds.w, bounds.l) * 3} />
      {rooms.map((room) => (
        <group key={room.id}>
          <RoomFloor room={room} plan={plan} />
          <RoomCeiling room={room} plan={plan} />
          <RoomWalls room={room} plan={plan} wallClassification={wallClassification} />
        </group>
      ))}
      <Roof plan={plan} rooms={rooms} />
      <OrbitControls
        target={[bounds.cx, plan.defaultHeight / 2, bounds.cz]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={3}
        maxDistance={Math.max(bounds.w, bounds.l) * 4}
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
    <div
      className="w-full h-[500px] rounded-lg overflow-hidden border"
      style={{ background: 'linear-gradient(to bottom, #bae6fd, #e0f2fe)' }}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground">Cargando vista 3D…</div>
        }
      >
        <Canvas shadows gl={{ antialias: true }}>
          <PerspectiveCamera makeDefault fov={50} near={0.1} far={200} />
          <Scene plan={plan} rooms={rooms} />
        </Canvas>
      </Suspense>
    </div>
  );
}
