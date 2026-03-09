import React, { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

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

interface FaceEditData {
  faceType: string; // suelo, pared, techo
  faceIndex: number;
  label: string;
  wallType?: string;
  heightM?: number;
  vertices: { x: number; y: number; z: number }[];
}

interface Workspace3DViewerProps {
  name: string;
  polygon: PolygonVertex[];
  height: number;
  walls: WallData[];
  scaleXY?: number;
  scaleZ?: number;
  zBase?: number;
  onFaceClick?: (faceType: string, faceIndex: number) => void;
  onFaceEdit?: (faceType: string, faceIndex: number, data: { wallType?: string; height?: number }) => void;
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

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'interior_invisible', label: 'Int. invisible' },
];

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
  onDoubleClick: () => void;
  opacity?: number;
}

function FaceMesh({ vertices, color, label, labelPosition, labelRotation, isSelected, onClick, onDoubleClick, opacity = 0.7 }: FaceMeshProps) {
  const [hovered, setHovered] = useState(false);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (vertices.length < 3) return geo;
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
        onDoubleClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onDoubleClick(); }}
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

/** Small coordinate label at a 3D corner */
function CornerLabel({ position, text }: { position: THREE.Vector3; text: string }) {
  return (
    <Text
      position={position}
      fontSize={0.08}
      color="#1a1a1a"
      fontWeight={600}
      anchorX="center"
      anchorY="bottom"
      outlineWidth={0.008}
      outlineColor="#ffffff"
      fillOpacity={0.95}
    >
      {text}
    </Text>
  );
}

interface PrismModelProps extends Omit<Workspace3DViewerProps, 'name' | 'onFaceEdit'> {
  onFaceDoubleClick?: (face: FaceEditData) => void;
}

function PrismModel({ polygon, height, walls, scaleXY = 625, scaleZ = 250, zBase = 0, onFaceClick, onFaceDoubleClick, selectedFace }: PrismModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { baseVerts3D, topVerts3D, center, heightM, cornerLabels } = useMemo(() => {
    const sMxy = scaleXY / 1000;
    const heightM = height;

    const base = polygon.map(v => new THREE.Vector3(v.x * sMxy, 0, v.y * sMxy));

    const cx = base.reduce((s, v) => s + v.x, 0) / base.length;
    const cz = base.reduce((s, v) => s + v.z, 0) / base.length;
    const centered = base.map(v => new THREE.Vector3(v.x - cx, 0, v.z - cz));
    const top = centered.map((v, i) => {
      const wall = walls.find(w => w.wall_index === i + 1);
      const h = wall?.height != null ? wall.height : heightM;
      return new THREE.Vector3(v.x, h, v.z);
    });

    // Compute real XYZ coordinate labels for each corner
    const zScaleBlocks = scaleZ / 1000; // meters per Z block
    const labels: { pos: THREE.Vector3; text: string }[] = [];
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const vx = polygon[i].x;
      const vy = polygon[i].y;
      // Base corner
      const zBaseLabel = zBase;
      labels.push({
        pos: new THREE.Vector3(centered[i].x, centered[i].y - 0.05, centered[i].z),
        text: `(X${vx},Y${vy},Z${zBaseLabel})`,
      });
      // Top corner
      const wall = walls.find(w => w.wall_index === i + 1);
      const hM = wall?.height != null ? wall.height : heightM;
      const zTopVal = zBase + Math.round(hM / zScaleBlocks);
      labels.push({
        pos: new THREE.Vector3(top[i].x, top[i].y + 0.08, top[i].z),
        text: `(X${vx},Y${vy},Z${zTopVal})`,
      });
    }

    return { baseVerts3D: centered, topVerts3D: top, center: new THREE.Vector3(cx, 0, cz), heightM, cornerLabels: labels };
  }, [polygon, height, walls, scaleXY, scaleZ, zBase]);

  const faces = useMemo(() => {
    const result: Array<{
      type: string;
      index: number;
      label: string;
      vertices: THREE.Vector3[];
      labelPos: THREE.Vector3;
      labelRot?: [number, number, number];
      color: string;
      realVertices: { x: number; y: number; z: number }[];
    }> = [];

    const n = baseVerts3D.length;
    if (n < 3) return result;

    const zScaleBlocks = scaleZ / 1000;

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
      realVertices: polygon.map(v => ({ x: v.x, y: v.y, z: zBase })),
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

      const midBase = new THREE.Vector3((b1.x + b2.x) / 2, 0, (b1.z + b2.z) / 2);
      const outward = midBase.clone().normalize().multiplyScalar(0.05);
      wallCenter.add(outward);

      const wall = walls.find(w => w.wall_index === i + 1);
      const hM1 = wall?.height != null ? wall.height : height;
      const wallNext = walls.find(w => w.wall_index === next + 1);
      const hM2 = wallNext?.height != null ? wallNext.height : height;

      result.push({
        type: 'pared', index: i + 1, label: `P${i + 1}`,
        vertices: wallVerts,
        labelPos: wallCenter,
        color: getWallColor(wall?.wall_type),
        realVertices: [
          { x: polygon[i].x, y: polygon[i].y, z: zBase },
          { x: polygon[next].x, y: polygon[next].y, z: zBase },
          { x: polygon[next].x, y: polygon[next].y, z: zBase + Math.round(hM2 / zScaleBlocks) },
          { x: polygon[i].x, y: polygon[i].y, z: zBase + Math.round(hM1 / zScaleBlocks) },
        ],
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
      realVertices: polygon.map((v, i) => {
        const wall = walls.find(w => w.wall_index === i + 1);
        const hM = wall?.height != null ? wall.height : height;
        return { x: v.x, y: v.y, z: zBase + Math.round(hM / zScaleBlocks) };
      }),
    });

    return result;
  }, [baseVerts3D, topVerts3D, walls, polygon, zBase, height, scaleZ]);

  const edgeLines = useMemo(() => {
    const lines: THREE.Vector3[][] = [];
    const n = baseVerts3D.length;
    for (let i = 0; i < n; i++) {
      lines.push([baseVerts3D[i], topVerts3D[i]]);
    }
    return lines;
  }, [baseVerts3D, topVerts3D]);

  const handleFaceDoubleClick = useCallback((face: typeof faces[0]) => {
    if (!onFaceDoubleClick) return;
    const wallData = face.type === 'pared' ? walls.find(w => w.wall_index === face.index) : undefined;
    onFaceDoubleClick({
      faceType: face.type,
      faceIndex: face.index,
      label: face.label,
      wallType: wallData?.wall_type,
      heightM: wallData?.height ?? height,
      vertices: face.realVertices,
    });
  }, [faces, walls, height, onFaceDoubleClick]);

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
            onDoubleClick={() => handleFaceDoubleClick(face)}
          />
        );
      })}
      {edgeLines.map((line, i) => (
        <Line key={`edge-${i}`} points={line} color="#555555" lineWidth={1} />
      ))}
      {/* Corner coordinate labels */}
      {cornerLabels.map((cl, i) => (
        <CornerLabel key={`corner-${i}`} position={cl.pos} text={cl.text} />
      ))}
      <axesHelper args={[0.5]} />
    </group>
  );
}

/** Face properties editing panel (shown on double-click) */
function FaceEditPanel({ data, onClose, onSave }: {
  data: FaceEditData;
  onClose: () => void;
  onSave: (updates: { wallType?: string; height?: number }) => void;
}) {
  const [wallType, setWallType] = useState(data.wallType || 'exterior');
  const [heightVal, setHeightVal] = useState(String(data.heightM || ''));

  return (
    <div className="border rounded-lg p-3 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          📐 Propiedades de {data.label} ({data.faceType === 'suelo' ? 'Suelo' : data.faceType === 'techo' ? 'Techo' : 'Pared'})
        </span>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Vertices display */}
      <div className="space-y-1">
        <span className="text-[9px] font-medium text-muted-foreground">Vértices (coordenadas reales)</span>
        <div className="grid grid-cols-2 gap-1">
          {data.vertices.map((v, i) => (
            <div key={i} className="text-[9px] bg-muted/50 rounded px-1.5 py-0.5 font-mono">
              V{i + 1}: (X{v.x}, Y{v.y}, Z{v.z})
            </div>
          ))}
        </div>
      </div>

      {/* Wall type selector (only for paredes) */}
      {data.faceType === 'pared' && (
        <div className="space-y-1">
          <Label className="text-[10px]">Tipo de superficie</Label>
          <Select value={wallType} onValueChange={setWallType}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WALL_TYPES.map(wt => (
                <SelectItem key={wt.value} value={wt.value} className="text-xs">
                  {wt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Height editor (only for paredes) */}
      {data.faceType === 'pared' && (
        <div className="space-y-1">
          <Label className="text-[10px]">Altura (m)</Label>
          <Input
            type="number"
            step="0.1"
            value={heightVal}
            onChange={e => setHeightVal(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      )}

      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-[10px]"
          onClick={() => {
            onSave({
              wallType: data.faceType === 'pared' ? wallType : undefined,
              height: data.faceType === 'pared' ? parseFloat(heightVal) || undefined : undefined,
            });
            onClose();
          }}
        >
          Guardar
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function Workspace3DViewer({ name, polygon, height, walls, scaleXY, scaleZ = 250, zBase = 0, onFaceClick, onFaceEdit, selectedFace }: Workspace3DViewerProps) {
  const [editingFace, setEditingFace] = useState<FaceEditData | null>(null);

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
        <span className="text-[9px] text-muted-foreground">Arrastra para rotar · Scroll para zoom · Doble clic en cara para editar</span>
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
            zBase={zBase}
            onFaceClick={onFaceClick}
            onFaceDoubleClick={(faceData) => setEditingFace(faceData)}
            selectedFace={selectedFace}
          />
          <OrbitControls enableDamping dampingFactor={0.1} />
          <gridHelper args={[6, 12, '#888888', '#cccccc']} />
        </Canvas>
      </div>

      {/* Face edit panel (shown on double-click) */}
      {editingFace && (
        <FaceEditPanel
          data={editingFace}
          onClose={() => setEditingFace(null)}
          onSave={(updates) => {
            onFaceEdit?.(editingFace.faceType, editingFace.faceIndex, updates);
          }}
        />
      )}

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
