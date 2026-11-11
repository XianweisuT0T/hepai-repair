import type { Gear } from '../../shared/types';
import type { BoxSocket } from '../lab3d/BoxBody';

export const PRODUCTION_SOCKETS:readonly BoxSocket[]=[
  {id:'slot-1',x:-1.65,z:.64,radius:.65},
  {id:'slot-2',x:-.15,z:.64,radius:.65},
  {id:'slot-3',x:1.50,z:.64,radius:.65},
];
export const NOTE_POSITIONS=[-1.8,-.6,.6,1.8].map(x=>[x,1.415,1.54] as const);
export const ARM_POSITION=[2.45,1.44,-.70] as const;
export const SIZE_RADII:Record<Gear['size'],number>={small:.52,medium:.65,large:.73};
// A modest right offset shows the wooden side and crank while the plaque stays readable.
// Home, preparation, performance and keepsake views share this initial composition.
export const FRONT_CAMERA={position:[2.45,4.75,10.65]as const,target:[0,2.02,0]as const};
export const LAUNCH_CRANK_CAMERA={position:[6.1,3.8,4.0]as const,target:[2.48,1.18,-.12]as const};
export const LAUNCH_ARM_CAMERA={position:[3.30,4.04,.55]as const,target:[2.45,1.44,-.70]as const};
export function roomEpoch(key:string){let hash=2166136261;for(const character of key)hash=Math.imul(hash^character.charCodeAt(0),16777619);return hash>>>0;}
