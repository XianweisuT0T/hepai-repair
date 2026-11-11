import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Path, Shape, type BufferGeometry, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ThreeElements } from '@react-three/fiber';

export function useGeometry<T extends BufferGeometry>(make: () => T, dependencies: readonly unknown[]) {
  const geometry = useMemo(make, dependencies);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function BeveledBox({ size, radius = .035, material, ...props }: {
  size: readonly [number, number, number]; radius?: number; material: Material;
} & Omit<ThreeElements['mesh'], 'geometry' | 'material'>) {
  const geometry = useGeometry(() => new RoundedBoxGeometry(...size, 2, radius), [size[0], size[1], size[2], radius]);
  return <mesh {...props} geometry={geometry} material={material} castShadow receiveShadow/>;
}

export function roundShape(width: number, height: number, radius: number) {
  const shape = new Shape();
  const x = -width / 2, y = -height / 2, r = radius;
  shape.moveTo(x+r,y); shape.lineTo(x+width-r,y); shape.quadraticCurveTo(x+width,y,x+width,y+r);
  shape.lineTo(x+width,y+height-r); shape.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  shape.lineTo(x+r,y+height); shape.quadraticCurveTo(x,y+height,x,y+height-r);
  shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
  return shape;
}

export function hole(shape: Shape, x: number, y: number, radius: number) {
  const path = new Path(); path.absarc(x,y,radius,0,Math.PI*2,true); shape.holes.push(path);
}

export function flatExtrusion(shape: Shape, depth: number, bevel = .015) {
  const geometry = new ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0, bevelSegments: 2, bevelSize: bevel, bevelThickness: bevel, curveSegments: 32 });
  geometry.rotateX(-Math.PI/2);
  return geometry;
}
