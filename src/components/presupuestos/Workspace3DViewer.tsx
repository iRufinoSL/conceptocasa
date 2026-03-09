import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Maximize2, Minimize2 } from 'lucide-react';

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
  faceType: string;
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
  onVertexEdit?: (faceType: string, faceIndex: number, vertices: { x: number; y: number; z: number }[]) => void;
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

/** Calculate area of a 3D polygon using cross product */
function calcFaceAreaM2(vertices: THREE.Vector3[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  const v0 = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = new THREE.Vector3().subVectors(vertices[i], v0);
    const b = new THREE.Vector3().subVectors(vertices[i + 1], v0);
    area += a.cross(b).length() / 2;
  }
  return area;
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
  workspaceName: string;
  areaM2: number;
}

function FaceMesh({ vertices, color, label, labelPosition, labelRotation, isSelected, onClick, onDoubleClick, opacity = 0.7, workspaceName, areaM2 }: FaceMeshProps) {
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

  const fullLabel = `${label}\n${workspaceName}\n${areaM2.toFixed(2)} m²`;

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
        fontSize={0.1}
        color={isSelected ? '#ff0000' : '#000000'}
        fontWeight={700}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#ffffff"
        textAlign="center"
        lineHeight={1.4}
      >
        {fullLabel}
      </Text>
    </group>
  );
}

/** Edge length label at midpoint of an edge with axis coordinates */
function EdgeLengthLabel({ from, to, lengthMm, axisLabel }: { from: THREE.Vector3; to: THREE.Vector3; lengthMm: number; axisLabel?: string }) {
  const mid = useMemo(() => new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5), [from, to]);
  const displayVal = lengthMm >= 1000 ? `${(lengthMm / 1000).toFixed(2)}m` : `${Math.round(lengthMm)}mm`;
  const label = axisLabel ? `${displayVal}\n${axisLabel}` : displayVal;
  return (
    <Text
      position={[mid.x, mid.y + 0.04, mid.z]}
      fontSize={0.05}
      color="#0066cc"
      fontWeight={600}
      anchorX="center"
      anchorY="bottom"
      outlineWidth={0.006}
      outlineColor="#ffffff"
      textAlign="center"
      lineHeight={1.3}
    >
      {label}
    </Text>
  );
}

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

/** Draggable vertex node sphere */
function DraggableVertex({ 
  position, 
  vertexIndex, 
  isTop,
  onDragEnd,
  label,
  orbitRef,
}: { 
  position: THREE.Vector3; 
  vertexIndex: number;
  isTop: boolean;
  onDragEnd: (vertexIndex: number, isTop: boolean, newPos: THREE.Vector3) => void;
  label: string;
  orbitRef: React.RefObject<any>;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl, raycaster } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e as any).nativeEvent?.stopImmediatePropagation?.();
    
    // Disable orbit controls during drag
    if (orbitRef.current) orbitRef.current.enabled = false;
    
    setDragging(true);
    gl.domElement.style.cursor = 'grabbing';
    
    // Create drag plane perpendicular to camera
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    dragPlane.current.setFromNormalAndCoplanarPoint(camDir, position);
    
    // Calculate offset
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersection);
    offset.current.subVectors(position, intersection);
    
    gl.domElement.setPointerCapture((e as any).nativeEvent.pointerId);
  }, [camera, gl, position, raycaster, orbitRef]);

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersection);
    if (intersection && meshRef.current) {
      const newPos = intersection.add(offset.current);
      meshRef.current.position.copy(newPos);
    }
  }, [dragging, raycaster]);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    setDragging(false);
    gl.domElement.style.cursor = 'auto';
    
    // Re-enable orbit controls
    if (orbitRef.current) orbitRef.current.enabled = true;
    
    if (meshRef.current) {
      onDragEnd(vertexIndex, isTop, meshRef.current.position.clone());
    }
    
    gl.domElement.releasePointerCapture((e as any).nativeEvent.pointerId);
  }, [dragging, gl, vertexIndex, isTop, onDragEnd, orbitRef]);

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        onPointerOver={() => { setHovered(true); gl.domElement.style.cursor = 'grab'; }}
        onPointerOut={() => { if (!dragging) { setHovered(false); gl.domElement.style.cursor = 'auto'; } }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <sphereGeometry args={[hovered || dragging ? 0.06 : 0.04, 16, 16]} />
        <meshStandardMaterial 
          color={dragging ? '#ff0000' : (hovered ? '#ff6600' : (isTop ? '#0066ff' : '#006600'))}
          emissive={dragging ? '#ff0000' : '#000000'}
          emissiveIntensity={dragging ? 0.3 : 0}
        />
      </mesh>
      {(hovered || dragging) && (
        <Text
          position={[position.x, position.y + 0.1, position.z]}
          fontSize={0.06}
          color="#000000"
          fontWeight={700}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.006}
          outlineColor="#ffffff"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

interface PrismModelProps extends Omit<Workspace3DViewerProps, 'name' | 'onFaceEdit' | 'onVertexEdit'> {
  onFaceDoubleClick?: (face: FaceEditData) => void;
  workspaceName: string;
  showDraggableNodes?: boolean;
  onNodeDrag?: (vertexIndex: number, isTop: boolean, newPos: THREE.Vector3) => void;
  orbitRef?: React.RefObject<any>;
}

function PrismModel({ polygon, height, walls, scaleXY = 625, scaleZ = 250, zBase = 0, onFaceClick, onFaceDoubleClick, selectedFace, workspaceName, showDraggableNodes, onNodeDrag, orbitRef }: PrismModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { baseVerts3D, topVerts3D, heightM, cornerLabels, cx, cz } = useMemo(() => {
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

    const zScaleBlocks = scaleZ / 1000;
    const labels: { pos: THREE.Vector3; text: string }[] = [];
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const vx = polygon[i].x;
      const vy = polygon[i].y;
      const zBaseLabel = zBase;
      labels.push({
        pos: new THREE.Vector3(centered[i].x, centered[i].y - 0.05, centered[i].z),
        text: `(X${vx},Y${vy},Z${zBaseLabel})`,
      });
      const wall = walls.find(w => w.wall_index === i + 1);
      const hM = wall?.height != null ? wall.height : heightM;
      const zTopVal = zBase + Math.round(hM / zScaleBlocks);
      labels.push({
        pos: new THREE.Vector3(top[i].x, top[i].y + 0.08, top[i].z),
        text: `(X${vx},Y${vy},Z${zTopVal})`,
      });
    }

    return { baseVerts3D: centered, topVerts3D: top, heightM, cornerLabels: labels, cx, cz };
  }, [polygon, height, walls, scaleXY, scaleZ, zBase]);

  const faces = useMemo(() => {
    const result: Array<{
      type: string; index: number; label: string;
      vertices: THREE.Vector3[]; labelPos: THREE.Vector3; labelRot?: [number, number, number];
      color: string; realVertices: { x: number; y: number; z: number }[];
    }> = [];

    const n = baseVerts3D.length;
    if (n < 3) return result;

    const zScaleBlocks = scaleZ / 1000;

    // Suelo (S1)
    const floorCenter = new THREE.Vector3(
      baseVerts3D.reduce((s, v) => s + v.x, 0) / n, -0.01,
      baseVerts3D.reduce((s, v) => s + v.z, 0) / n
    );
    result.push({
      type: 'suelo', index: 1, label: 'S1',
      vertices: [...baseVerts3D], labelPos: floorCenter, labelRot: [-Math.PI / 2, 0, 0],
      color: FACE_COLORS.suelo,
      realVertices: polygon.map(v => ({ x: v.x, y: v.y, z: zBase })),
    });

    // Paredes (P1, P2, ...)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b1 = baseVerts3D[i]; const b2 = baseVerts3D[next];
      const t1 = topVerts3D[i]; const t2 = topVerts3D[next];
      const wallVerts = [b1, b2, t2, t1];
      const wallCenter = new THREE.Vector3(
        (b1.x + b2.x + t1.x + t2.x) / 4, (b1.y + b2.y + t1.y + t2.y) / 4, (b1.z + b2.z + t1.z + t2.z) / 4
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
        vertices: wallVerts, labelPos: wallCenter,
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
      vertices: [...topVerts3D], labelPos: topCenter, labelRot: [-Math.PI / 2, 0, 0],
      color: FACE_COLORS.techo,
      realVertices: polygon.map((v, i) => {
        const wall = walls.find(w => w.wall_index === i + 1);
        const hM = wall?.height != null ? wall.height : height;
        return { x: v.x, y: v.y, z: zBase + Math.round(hM / zScaleBlocks) };
      }),
    });

    return result;
  }, [baseVerts3D, topVerts3D, walls, polygon, zBase, height, scaleZ]);

  // Compute edge lengths
  const edgeLengths = useMemo(() => {
    const items: { from: THREE.Vector3; to: THREE.Vector3; lengthMm: number; axisLabel: string }[] = [];
    const n = baseVerts3D.length;
    const sMxy = scaleXY;
    const zScaleBlocks = scaleZ / 1000;

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const dx = (polygon[next].x - polygon[i].x) * sMxy;
      const dy = (polygon[next].y - polygon[i].y) * sMxy;
      const len = Math.sqrt(dx * dx + dy * dy);
      items.push({ from: baseVerts3D[i], to: baseVerts3D[next], lengthMm: len,
        axisLabel: `X${polygon[i].x},Y${polygon[i].y}→X${polygon[next].x},Y${polygon[next].y}` });
    }
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const dx = (polygon[next].x - polygon[i].x) * sMxy;
      const dy = (polygon[next].y - polygon[i].y) * sMxy;
      const len = Math.sqrt(dx * dx + dy * dy);
      items.push({ from: topVerts3D[i], to: topVerts3D[next], lengthMm: len,
        axisLabel: `X${polygon[i].x},Y${polygon[i].y}→X${polygon[next].x},Y${polygon[next].y}` });
    }
    for (let i = 0; i < n; i++) {
      const hDiff = topVerts3D[i].y - baseVerts3D[i].y;
      const wall = walls.find(w => w.wall_index === i + 1);
      const hM = wall?.height != null ? wall.height : height;
      const zTopVal = zBase + Math.round(hM / zScaleBlocks);
      items.push({ from: baseVerts3D[i], to: topVerts3D[i], lengthMm: Math.abs(hDiff) * 1000,
        axisLabel: `Z${zBase}→Z${zTopVal}` });
    }
    return items;
  }, [baseVerts3D, topVerts3D, polygon, scaleXY, scaleZ, walls, height, zBase]);

  const handleFaceDoubleClick = useCallback((face: typeof faces[0]) => {
    if (!onFaceDoubleClick) return;
    const wallData = face.type === 'pared' ? walls.find(w => w.wall_index === face.index) : undefined;
    onFaceDoubleClick({
      faceType: face.type, faceIndex: face.index, label: face.label,
      wallType: wallData?.wall_type, heightM: wallData?.height ?? height,
      vertices: face.realVertices,
    });
  }, [faces, walls, height, onFaceDoubleClick]);

  // Draggable node labels
  const nodeLabels = useMemo(() => {
    if (!showDraggableNodes) return [];
    const zScaleBlocks = scaleZ / 1000;
    const n = polygon.length;
    const result: { pos: THREE.Vector3; idx: number; isTop: boolean; label: string }[] = [];
    for (let i = 0; i < n; i++) {
      result.push({
        pos: baseVerts3D[i].clone(),
        idx: i, isTop: false,
        label: `V${i + 1} base (X${polygon[i].x},Y${polygon[i].y},Z${zBase})`,
      });
      const wall = walls.find(w => w.wall_index === i + 1);
      const hM = wall?.height != null ? wall.height : height;
      const zTopVal = zBase + Math.round(hM / zScaleBlocks);
      result.push({
        pos: topVerts3D[i].clone(),
        idx: i, isTop: true,
        label: `V${i + 1} top (X${polygon[i].x},Y${polygon[i].y},Z${zTopVal})`,
      });
    }
    return result;
  }, [showDraggableNodes, baseVerts3D, topVerts3D, polygon, zBase, height, walls, scaleZ]);

  return (
    <group ref={groupRef}>
      {faces.map((face) => {
        const faceKey = `${face.type}_${face.index}`;
        const areaM2 = calcFaceAreaM2(face.vertices);
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
            workspaceName={workspaceName}
            areaM2={areaM2}
          />
        );
      })}
      {edgeLengths.map((el, i) => (
        <EdgeLengthLabel key={`elen-${i}`} from={el.from} to={el.to} lengthMm={el.lengthMm} axisLabel={el.axisLabel} />
      ))}
      {baseVerts3D.map((bv, i) => (
        <Line key={`edge-${i}`} points={[bv, topVerts3D[i]]} color="#555555" lineWidth={1} />
      ))}
      {!showDraggableNodes && cornerLabels.map((cl, i) => (
        <CornerLabel key={`corner-${i}`} position={cl.pos} text={cl.text} />
      ))}
      {/* Draggable vertex nodes */}
      {showDraggableNodes && orbitRef && nodeLabels.map((nl, i) => (
        <DraggableVertex
          key={`dv-${i}`}
          position={nl.pos}
          vertexIndex={nl.idx}
          isTop={nl.isTop}
          label={nl.label}
          onDragEnd={onNodeDrag || (() => {})}
          orbitRef={orbitRef}
        />
      ))}
      <axesHelper args={[0.5]} />
    </group>
  );
}

/** Face properties editing panel (shown on double-click) */
function FaceEditPanel({ data, onClose, onSave, onVertexSave }: {
  data: FaceEditData;
  onClose: () => void;
  onSave: (updates: { wallType?: string; height?: number }) => void;
  onVertexSave?: (vertices: { x: number; y: number; z: number }[]) => void;
}) {
  const [wallType, setWallType] = useState(data.wallType || 'exterior');
  const [heightVal, setHeightVal] = useState(String(data.heightM || ''));
  const [editVerts, setEditVerts] = useState(data.vertices.map(v => ({ ...v })));

  const updateVert = (idx: number, axis: 'x' | 'y' | 'z', val: string) => {
    setEditVerts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [axis]: parseFloat(val) || 0 };
      return next;
    });
  };

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

      {/* Editable vertices */}
      <div className="space-y-1">
        <span className="text-[9px] font-medium text-muted-foreground">Vértices (coordenadas editables)</span>
        <div className="space-y-1">
          {editVerts.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] font-mono w-6 text-muted-foreground">V{i + 1}:</span>
              <span className="text-[8px] text-muted-foreground">X</span>
              <Input
                type="number"
                step="1"
                value={v.x}
                onChange={e => updateVert(i, 'x', e.target.value)}
                className="h-5 text-[9px] w-14 px-1 font-mono"
              />
              <span className="text-[8px] text-muted-foreground">Y</span>
              <Input
                type="number"
                step="1"
                value={v.y}
                onChange={e => updateVert(i, 'y', e.target.value)}
                className="h-5 text-[9px] w-14 px-1 font-mono"
              />
              <span className="text-[8px] text-muted-foreground">Z</span>
              <Input
                type="number"
                step="1"
                value={v.z}
                onChange={e => updateVert(i, 'z', e.target.value)}
                className="h-5 text-[9px] w-14 px-1 font-mono"
              />
            </div>
          ))}
        </div>
        {onVertexSave && (
          <Button
            variant="outline"
            size="sm"
            className="h-5 text-[9px] mt-1"
            onClick={() => onVertexSave(editVerts)}
          >
            Aplicar vértices
          </Button>
        )}
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

/** Custom OrbitControls with centered target and smooth zoom */
function CenteredOrbitControls({ orbitRef }: { orbitRef: React.RefObject<any> }) {
  return (
    <OrbitControls
      ref={orbitRef}
      enableDamping
      dampingFactor={0.15}
      zoomSpeed={0.5}
      rotateSpeed={0.8}
      panSpeed={0.6}
      minDistance={0.5}
      maxDistance={30}
      target={[0, 0, 0]}
    />
  );
}

export function Workspace3DViewer({ name, polygon, height, walls, scaleXY, scaleZ = 250, zBase = 0, onFaceClick, onFaceEdit, onVertexEdit, selectedFace }: Workspace3DViewerProps) {
  const [editingFace, setEditingFace] = useState<FaceEditData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNodes, setShowNodes] = useState(false);
  const orbitRef = useRef<any>(null);

  const handleNodeDrag = useCallback((vertexIndex: number, isTop: boolean, newPos: THREE.Vector3) => {
    if (!onVertexEdit) return;
    const zScaleBlocks = scaleZ / 1000;
    const sMxy = (scaleXY || 625) / 1000;
    
    // Recompute centered offset
    const base = polygon.map(v => new THREE.Vector3(v.x * sMxy, 0, v.y * sMxy));
    const cx = base.reduce((s, v) => s + v.x, 0) / base.length;
    const cz = base.reduce((s, v) => s + v.z, 0) / base.length;

    if (isTop) {
      // Convert the new Y position back to a Z coordinate change
      const allVerts = polygon.map((v, i) => {
        const wall = walls.find(w => w.wall_index === i + 1);
        const hM = wall?.height != null ? wall.height : height;
        const zTopVal = zBase + Math.round(hM / zScaleBlocks);
        if (i === vertexIndex) {
          // New height from dragged Y position
          const newZTop = zBase + Math.round(newPos.y / zScaleBlocks);
          return { x: v.x, y: v.y, z: newZTop };
        }
        return { x: v.x, y: v.y, z: zTopVal };
      });
      onVertexEdit('techo', 1, allVerts);
    }
  }, [onVertexEdit, polygon, walls, height, zBase, scaleZ, scaleXY]);

  if (!polygon || polygon.length < 3) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
        Se necesitan al menos 3 vértices para la vista 3D
      </div>
    );
  }

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-background flex flex-col'
    : 'space-y-2';

  const canvasHeight = isFullscreen ? 'flex-1' : 'h-80';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2 p-1 flex-wrap">
        <span className="text-xs font-semibold">🧊 Vista 3D — {name}</span>
        <span className="text-[9px] text-muted-foreground">Arrastra para rotar · Scroll para zoom · Doble clic en cara para editar</span>
        <div className="ml-auto flex gap-1">
          <Button
            variant={showNodes ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-[9px] gap-1 px-2"
            onClick={() => setShowNodes(n => !n)}
          >
            🔵 Nodos
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[9px] gap-1 px-2"
            onClick={() => setIsFullscreen(f => !f)}
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {isFullscreen ? 'Salir' : 'Pantalla completa'}
          </Button>
        </div>
      </div>
      <div className={`${canvasHeight} rounded-lg border bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden`}>
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
            workspaceName={name}
            showDraggableNodes={showNodes}
            onNodeDrag={handleNodeDrag}
            orbitRef={orbitRef}
          />
          <CenteredOrbitControls orbitRef={orbitRef} />
          <gridHelper args={[6, 12, '#888888', '#cccccc']} />
        </Canvas>
      </div>

      {editingFace && (
        <div className={isFullscreen ? 'p-2 max-w-xl mx-auto w-full' : ''}>
          <FaceEditPanel
            data={editingFace}
            onClose={() => setEditingFace(null)}
            onSave={(updates) => {
              onFaceEdit?.(editingFace.faceType, editingFace.faceIndex, updates);
            }}
            onVertexSave={onVertexEdit ? (verts) => {
              onVertexEdit(editingFace.faceType, editingFace.faceIndex, verts);
              setEditingFace(null);
            } : undefined}
          />
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[9px] px-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.suelo }} /> Suelo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.techo }} /> Techo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_exterior }} /> Pared ext.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.pared_interior }} /> Pared int.</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: FACE_COLORS.selected }} /> Seleccionada</span>
        {showNodes && (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: '#006600' }} /> Nodo base</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: '#0066ff' }} /> Nodo superior</span>
          </>
        )}
      </div>
    </div>
  );
}
