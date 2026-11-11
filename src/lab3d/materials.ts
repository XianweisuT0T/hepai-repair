import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Finish } from '../../shared/types';

export interface LabMaterials {
  wood: MeshStandardMaterial;
  woodEdge: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  brassDark: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  velvet: MeshStandardMaterial;
  paper: MeshStandardMaterial;
  paperShade: MeshStandardMaterial;
  table: MeshStandardMaterial;
}

/** Small deterministic grain. Variations stay subtle so the material reads as
    unfinished warm wood rather than striped plastic or a high-contrast photo. */
function makeWoodGrain() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(canvas.width, canvas.height);
  let seed = 0x48a7f351;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width, v = y / canvas.height;
    // Whole-number wave periods meet at the repeating texture edges.
    const bend = Math.sin(u * Math.PI * 2) * .7 + Math.sin(u * Math.PI * 6) * .19;
    const broad = Math.sin(v * Math.PI * 8 + bend) * 1.4;
    const fine = Math.sin(v * Math.PI * 28 + bend * 2) * .45;
    const cloud = Math.sin(v * Math.PI * 4 + Math.sin(u * Math.PI * 2)) * 1.2;
    const grain = broad + fine + cloud + (random() - .5);
    const index = (y * canvas.width + x) * 4;
    pixels.data[index] = 158 + grain;
    pixels.data[index + 1] = 115 + grain * .84;
    pixels.data[index + 2] = 80 + grain * .66;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

/** One small linear-data texture adds restrained surface variation without
    drawing scratches, bright speckles or another layer of visible grain. */
function makeSurfaceRoughness() {
  const canvas = document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d');if(!context)return null;
  const pixels=context.createImageData(128,128);let seed=0x179bc031;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const value=239+Math.sin(x/128*Math.PI*4)*2+Math.cos(y/128*Math.PI*6)*2+(seed/0x100000000-.5)*4;
    const index=(y*128+x)*4;pixels.data[index]=value;pixels.data[index+1]=value;pixels.data[index+2]=value;pixels.data[index+3]=255;
  }
  context.putImageData(pixels,0,0);
  const texture=new CanvasTexture(canvas);texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(5,5);
  return texture;
}

/** Shared per mounted music box. Call inside its component, then reuse these
    instances on meshes; no material/texture allocation occurs during animation. */
export function useLabMaterials(finish: Finish = 'walnut'): LabMaterials {
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const grain = makeWoodGrain();
    const surface = makeSurfaceRoughness();
    const edgeGrain = grain?.clone() ?? null;
    if (edgeGrain) {
      edgeGrain.repeat.set(.8, 1);
      edgeGrain.needsUpdate = true;
    }
    const materials: LabMaterials = {
      wood: new MeshStandardMaterial({ name: 'lab-warm-wood', color: '#b69272', map: grain, roughness: .85, roughnessMap: surface, metalness: 0, envMapIntensity: .6 }),
      woodEdge: new MeshStandardMaterial({ name: 'lab-wood-edge', color: '#886144', map: edgeGrain, roughness: .89, roughnessMap: surface, metalness: 0, envMapIntensity: .5 }),
      brass: new MeshStandardMaterial({ name: 'lab-satin-brass', color: '#c2a06a', metalness: .78, roughness: .47, roughnessMap: surface, envMapIntensity: .85 }),
      brassDark: new MeshStandardMaterial({ name: 'lab-aged-brass', color: '#80643c', metalness: .75, roughness: .51, roughnessMap: surface, envMapIntensity: .8 }),
      steel: new MeshStandardMaterial({ name: 'lab-mechanism-steel', color: '#3a5146', metalness: .82, roughness: .45, roughnessMap: surface, envMapIntensity: .55 }),
      velvet: new MeshStandardMaterial({ name: 'lab-green-lining', color: '#243e32', metalness: 0, roughness: 1, envMapIntensity: .3 }),
      paper: new MeshStandardMaterial({ name: 'lab-cream-paper', color: '#eee6cc', metalness: 0, roughness: .95, side: DoubleSide, envMapIntensity: .45 }),
      paperShade: new MeshStandardMaterial({ name: 'lab-sage-paper', color: '#a5b49a', metalness: 0, roughness: .95, side: DoubleSide, envMapIntensity: .4 }),
      table: new MeshStandardMaterial({ name: 'lab-workshop-table', color: '#0d211b', metalness: 0, roughness: .97, envMapIntensity: .2 })
    };
    return { materials, textures: [grain, edgeGrain, surface] };
  }, []);

  // Update the shared wood colors without reallocating the grain or materials.
  // Explicit invalidation also updates a paused demand-rendered work view.
  useLayoutEffect(() => {
    resources.materials.wood.color.set(finish === 'cherry' ? '#d3a58e' : '#b69272');
    resources.materials.woodEdge.color.set(finish === 'cherry' ? '#a67456' : '#886144');
    invalidate();
  }, [finish, resources, invalidate]);

  useEffect(() => () => {
    for (const material of Object.values(resources.materials)) material.dispose();
    for (const texture of resources.textures) texture?.dispose();
  }, [resources]);

  return resources.materials;
}
