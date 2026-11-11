import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Vector3 } from 'three';
import type { Gear } from '../../shared/types';
import { gearShape } from '../lab3d/Gear';
import { flatExtrusion, useGeometry } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';
import { SIZE_RADII } from './productionConfig';

const SEAT_HEIGHT=.12;
const SEAT_MS=160;

export default function ProductionGear({gear,position,materials,playing,reduceMotion,arriving=false,index=0}:{gear:Gear;position:readonly[number,number,number];materials:LabMaterials;playing:boolean;reduceMotion:boolean;arriving?:boolean;index?:number}){
  const radius=SIZE_RADII[gear.size];
  const geometry=useGeometry(()=>flatExtrusion(gearShape(radius,gear.size==='large'?20:gear.size==='medium'?18:14,gear.notches),.105,.014),[gear.size,gear.notches]);
  const outer=useRef<Group>(null),rotor=useRef<Group>(null),born=useRef(performance.now());
  const landing=useRef(arriving),target=useRef(new Vector3(...position));
  const initialPosition=useRef<[number,number,number]>([position[0],position[1]+(arriving&&!reduceMotion?SEAT_HEIGHT:0),position[2]]);
  const metadata=useRef({gearId:gear.id,installing:arriving&&!reduceMotion});
  useEffect(()=>{target.current.set(...position);},[position[0],position[1],position[2]]);
  useFrame((state,delta)=>{
    if(!outer.current||!rotor.current)return;
    let t=1;
    if(landing.current&&!reduceMotion)t=Math.min(1,(performance.now()-born.current)/SEAT_MS);
    // A dropped part seats where it was released: a tiny axial settle, with no travel from another pad.
    outer.current.position.set(target.current.x,target.current.y+SEAT_HEIGHT*(1-MathUtils.smoothstep(t,0,1)),target.current.z);
    outer.current.userData.installing=t<1;
    if(t<1)state.invalidate();
    if(playing&&!reduceMotion){rotor.current.rotation.y+=Math.min(delta,.08)*(index%2===0?1:-1)*(.52/radius);state.invalidate();}
  },-1);
  return <group ref={outer} position={initialPosition.current} name={`installed-${gear.id}`} userData={metadata.current}>
    <group ref={rotor} userData={{captureNeutralRotor:true}}>
      <mesh geometry={geometry} material={materials.brass} castShadow receiveShadow/>
      <mesh position={[0,.123,0]} rotation={[-Math.PI/2,0,0]} material={materials.brassDark}><ringGeometry args={[radius*.70,radius*.708,64]}/></mesh>
    </group>
  </group>;
}
