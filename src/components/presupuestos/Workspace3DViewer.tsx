import React, { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

interface PolygonVertex {
  x: number;
  y: number;
}

interface WallData {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  height: number | null;
}

interface Workspace3DViewerProps {
  name: string;
  polygon: PolygonVertex[];
  height: number; // meters
  walls: WallData[];
  scaleXY?: number; // mm per grid unit (default 625)
  scaleZ?: number;  // mm per grid unit (default 250)
  onFaceClick?: (faceType: string, faceIndex: number) => void;
  selectedFace?: string | null;
}

const FACE_COLORS: Record<string, string> = {
  suelo: '#d4a574',
  techo: '#7ab8e0',
  pared_exterior: '#8bc48b',
  pared_interior: '#e0c87a',
  pared_invisible: '#cccccc',
  pared_default: '#b0b0b0',
  selected: '#ff6b6b',
};

function getWallColor(wallType?: string): string {
  if (!wallType) return FACE_COLORS.pared_default;
  if (wallType.includes('exterior')) return FACE_COLORS.pared_exterior;
  if (wallType.includes('interior')) return FACE_COLORS.pared_interior;
  if (wallType.includes('invisible')) return FACE_COLORS.pared_invisible;
  return FACE_COLORS.pared_default;
}

interface FaceMeshProps {
  vertices: THREE.Vector3[];
  color: string;
  label: string;
  labelPosition: THREE.Vector3;
  labelRotation?: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
  opacity?: number;
}

function FaceMesh({ vertices, color, label, labelPosition, labelRotation, isSelected, onClick, opacity = 0.7 }: FaceMeshProps) {
  const [hovered, setHovered] = useState(false);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (vertices.length < 3) return geo;
    
    // Triangulate the face (fan from first vertex)
    const positions: number[] = [];
    for (let i = 1; i < vertices.length - 1; i++) {
      positions.push(vertices[0].x, vertices[0].y, vertices[0].z);
      positions.push(vertices[i].x, vertices[i].y, vertices[i].z);
      positions.push(vertices[i + 1].x, vertices[i + 1].y, vertices[i + 1].z);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [vertices]);

  const edgePoints = useMemo(() => {
    if (vertices.length < 2) return [];
    return [...vertices, vertices[0]];
  }, [vertices]);

  const displayColor = isSelected ? FACE_COLORS.selected : (hovered ? '#ffaa44' : color);

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={displayColor}
          transparent
          opacity={isSelected ? 0.85 : (hovered ? 0.8 : opacity)}
          side={THREE.DoubleSide}
        />
      </mesh>
      {edgePoints.length > 1 && (
        <Line
          points={edgePoints}
          color={isSelected ? '#ff0000' : '#333333'}
          lineWidth={isSelected ? 3 : 1.5}
        />
      )}
      <Text
        position={labelPosition}
        rotation={labelRotation}
        fontSize={0.15}
        color={isSelected ? '#ff0000' : '#000000'}
        fontWeight={700}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#ffffff"
      >
        {label}
      </Text>
    </group>
  );
}

function PrismModel({ polygon, height, walls, scaleXY = 625, scaleZ = 250, onFaceClick, selectedFace }: Omit<Workspace3DViewerProps, 'name'>) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Convert polygon to meters and center
  const { baseVerts3D, topVerts3D, center, heightM } = useMemo(() => {
    const sMxy = scaleXY / 1000;
    const heightM = height;
    
    // Convert to meters
    const base = polygon.map(v => new THREE.Vector3(v.x * sMxy, 0, v.y * sMxy));
    
    // Center
    const cx = base.reduce((s, v) => s + v.x, 0) / base.length;
    const cz = base.reduce((s, v) => s + v.z, 0) / base.length;
    const centered = base.map(v => new THREE.Vector3(v.x - cx, 0, v.z - cz));
    const top = centered.map((v, i) => {
      const wall = walls.find(w => w.wall_index === i + 1);
      const h = wall?.height != null ? wall.height : heightM;
      return new THREE.Vector3(v.x, h, v.z);
    });
    
    return { baseVerts3D: centered, topVerts3D: top, center: new THREE.Vector3(cx, 0, cz), heightM };
  }, [polygon, height, walls, scaleXY]);

  const faces = useMemo(() => {
    const result: Array<{
      type: string;
      index: number;
      label: string;
      vertices: THREE.Vector3[];
      labelPos: THREE.Vector3;
      labelRot?: [number, number, number];
      color: string;
    }> = [];

    const n = baseVerts3D.length;
    if (n < 3) return result;

    // Suelo (S1)
    const floorCenter = new THREE.Vector3(
      baseVerts3D.reduce((s, v) => s + v.x, 0) / n,
      -0.01,
      baseVerts3D.reduce((s, v) => s + v.z, 0) / n
    );
    result.push({
      type: 'suelo', index: 1, label: 'S1',
      vertices: [...baseVerts3D],
      labelPos: floorCenter,
      labelRot: [-Math.PI / 2, 0, 0],
      color: FACE_COLORS.suelo,
    });

    // Paredes (P1, P2, ...)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b1 = baseVerts3D[i];
      const b2 = baseVerts3D[next];
      const t1 = topVerts3D[i];
      const t2 = topVerts3D[next];
      
      const wallVerts = [b1, b2, t2, t1];
      const wallCenter = new THREE.Vector3(
        (b1.x + b2.x + t1.x + t2.x) / 4,
        (b1.y + b2.y + t1.y + t2.y) / 4,
        (b1.z + b2.z + t1.z + t2.z) / 4
      );
      
      // Push label slightly outward
      const midBase = new THREE.Vector3((b1.x + b2.x) / 2, 0, (b1.z + b2.z) / 2);
      const outward = midBase.clone().normalize().multiplyScalar(0.05);
      wallCenter.add(outward);
      
      const wall = walls.find(w => w.wall_index === i + 1);
      
      result.push({
        type: 'pared', index: i + 1, label: `P${i + 1}`,
        vertices: wallVerts,
        labelPos: wallCenter,
        color: getWallColor(wall?.wall_type),
      });
    }

    // Techo (T1)
    const topCenter = new THREE.Vector3(
      topVerts3D.reduce((s, v) => s + v.x, 0) / n,
      topVerts3D.reduce((s, v) => s + v.y, 0) / n + 0.01,
      topVerts3D.reduce((s, v) => s + v.z, 0) / n
    );
    result.push({
      type: 'techo', index: 1, label: 'T1',
      vertices: [...topVerts3D],
      labelPos: topCenter,
      labelRot: [-Math.PI / 2, 0, 0],
      color: FACE_COLORS.techo,
    });

    return result;
  }, [baseVerts3D, topVerts3D, walls]);

  // Edge vertices (wireframe outline)
  const edgeLines = useMemo(() => {
    const lines: THREE.Vector3[][] = [];
    const n = baseVerts3D.length;
    // Vertical edges
    for (let i = 0; i < n; i++) {
      lines.push([baseVerts3D[i], topVerts3D[i]]);
    }
    return lines;
  }, [baseVerts3D, topVerts3D]);

  return (
    <group ref={groupRef}>
      {faces.map((face) => {
        const faceKey = `${face.type}_${face.index}`;
        return (
          <FaceMesh
            key={faceKey}
            vertices={face.vertices}
            color={face.color}
            label={face.label}
            labelPosition={face.labelPos}
            labelRotation={face.labelRot}
            isSelected={selectedFace === faceKey}
            onClick={() => onFaceClick?.(face.type, face.index)}
          />
        );
      })}
      {edgeLines.map((line, i) => (
        <Line key={`edge-${i}`} points={line} color="#555555" lineWidth={1} />
      ))}
      {/* Axes helper */}
      <axesHelper args={[0.5]} />
    </group>
  );
}

export function Workspace3DViewer({ name, polygon, height, walls, scaleXY, scaleZ, onFaceClick, selectedFace }: Workspace3DViewerProps) {
  if (!polygon || polygon.length < 3) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
        Se necesitan al menos 3 vértices para la vista 3D
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">🧊 Vista 3D — {name}</span>
        <span className="text-[9px] text-muted-foreground">Arrastra para rotar · Scroll para zoom · Click en cara para seleccionar</span>
      </div>
      <div className="h-80 rounded-lg border bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} />
          <directionalLight position={[-3, 4, -3]} intensity={0.3} />
          <PrismModel
            polygon={polygon}
            height={height}
            walls={walls}
            scaleXY={scaleXY}
            scaleZ={scaleZ}
            onFaceClick={onFaceClick}
            selectedFace={selectedFace}
          />
          <OrbitControls enableDamping dampingFactor={0.1} />
          <gridHelper args={[6, 12, '#888888', '#cccccc']} />
        </Canvas>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.suelo }} /> Suelo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.techo }} /> Techo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_exterior }} /> Pared ext.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_interior }} /> Pared int.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.selected }} /> Seleccionada</span>
      </div>
    </div>
  );
}
