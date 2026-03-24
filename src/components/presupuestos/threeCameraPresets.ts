import * as THREE from 'three';

export interface SceneBounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CameraFrameResult {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Camera preset aligned with the Z0 reading:
 * - X0Y0Z0 must stay visually near the front-left anchor
 * - +X reads toward right/down on screen
 * - +Y (mapped to world Z) reads toward background/up on screen
 * - Z remains vertical
 */
export function computeZ0AlignedCamera(bounds: SceneBounds3D): CameraFrameResult {
  const dx = Math.max(bounds.maxX - bounds.minX, 1);
  const dy = Math.max(bounds.maxY - bounds.minY, 1);
  const dz = Math.max(bounds.maxZ - bounds.minZ, 1);
  const maxPlanDim = Math.max(dx, dz, 1);
  const dist = Math.max(maxPlanDim * 2.2, dy * 2.9, 4.5);

  const center = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );

  const originAnchor = new THREE.Vector3(
    bounds.minX <= 0 && bounds.maxX >= 0 ? 0 : bounds.minX,
    bounds.minY <= 0 && bounds.maxY >= 0 ? 0 : bounds.minY,
    bounds.minZ <= 0 && bounds.maxZ >= 0 ? 0 : bounds.minZ,
  );

  const target = originAnchor.clone().lerp(center, 0.42);
  target.y = THREE.MathUtils.lerp(originAnchor.y, center.y, 0.62);

  const offset = new THREE.Vector3(-1.1, 0.9, 1.1)
    .normalize()
    .multiplyScalar(dist);

  return {
    position: target.clone().add(offset),
    target,
  };
}