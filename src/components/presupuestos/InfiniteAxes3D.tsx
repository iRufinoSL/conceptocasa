import { useMemo } from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

const AXIS_LENGTH = 500; // extends ±500 units — effectively infinite

interface InfiniteAxes3DProps {
  /** Distance from origin where the arrow + label appear */
  labelDistance?: number;
}

/**
 * XYZ axes that extend from origin to ±infinity (visually),
 * with SketchUp-standard colors: X=Red, Y=Green, Z=Blue.
 *
 * Three.js mapping: X→X(red), Z→Y(green/depth), Y→Z(blue/up).
 */
export function InfiniteAxes3D({ labelDistance = 1.5 }: InfiniteAxes3DProps) {
  const coneRadius = 0.045;
  const coneHeight = 0.13;

  const axes = useMemo(() => [
    { dir: [1, 0, 0] as [number, number, number], color: '#c0392b', label: 'X' },
    { dir: [0, 0, 1] as [number, number, number], color: '#27ae60', label: 'Y' },
    { dir: [0, 1, 0] as [number, number, number], color: '#2980b9', label: 'Z' },
  ], []);

  return (
    <group>
      {/* Origin sphere */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color="#333333" />
      </mesh>

      {axes.map(({ dir, color, label }) => {
        // Infinite line: from -AXIS_LENGTH to +AXIS_LENGTH along axis
        const negEnd: [number, number, number] = [
          dir[0] * -AXIS_LENGTH,
          dir[1] * -AXIS_LENGTH,
          dir[2] * -AXIS_LENGTH,
        ];
        const posEnd: [number, number, number] = [
          dir[0] * AXIS_LENGTH,
          dir[1] * AXIS_LENGTH,
          dir[2] * AXIS_LENGTH,
        ];

        // Arrow cone at labelDistance
        const conePos: [number, number, number] = [
          dir[0] * (labelDistance + coneHeight / 2),
          dir[1] * (labelDistance + coneHeight / 2),
          dir[2] * (labelDistance + coneHeight / 2),
        ];
        const labelPos: [number, number, number] = [
          dir[0] * (labelDistance + coneHeight + 0.12),
          dir[1] * (labelDistance + coneHeight + 0.12),
          dir[2] * (labelDistance + coneHeight + 0.12),
        ];

        const quat = new THREE.Quaternion();
        quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
        const euler = new THREE.Euler().setFromQuaternion(quat);

        return (
          <group key={label}>
            {/* Infinite line */}
            <Line
              points={[negEnd, posEnd]}
              color={color}
              lineWidth={1.5}
              transparent
              opacity={0.7}
            />
            {/* Positive-side thicker highlight near origin */}
            <Line
              points={[[0, 0, 0], [dir[0] * labelDistance, dir[1] * labelDistance, dir[2] * labelDistance]]}
              color={color}
              lineWidth={3}
            />
            {/* Arrowhead */}
            <mesh position={conePos} rotation={euler}>
              <coneGeometry args={[coneRadius, coneHeight, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Label */}
            <Text
              position={labelPos}
              fontSize={0.12}
              color={color}
              fontWeight={700}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.008}
              outlineColor="#ffffff"
            >
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
