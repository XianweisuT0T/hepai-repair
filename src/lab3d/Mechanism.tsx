import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { BeveledBox } from './Geometry';
import type { LabMaterials } from './materials';
import type { Lab3DState } from './types';

/** A separate pinned cylinder drives the comb; the spaced gears use a shaft,
 * rather than pretending that their non-touching teeth directly mesh. */
export default function Mechanism({state,materials,z=-.11,stageClearance=false}:{state:Lab3DState;materials:LabMaterials;z?:number;stageClearance?:boolean}){
  const cylinder=useRef<Group>(null);
  useEffect(()=>{if(cylinder.current)cylinder.current.rotation.x=0;},[state.epoch]);
  useFrame((_,delta)=>{if(cylinder.current&&state.playing&&!state.reduceMotion){cylinder.current.rotation.x+=Math.min(delta,.08)*.9;_.invalidate();}});
  return <group name="pinned-cylinder-mechanism">
    {[-2.4,2.4].map(x=><group key={x} position={[x,1.38,z]}>
      <BeveledBox size={[.18,.14,.32]} radius={.02} material={materials.brassDark}/>
      <mesh rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow><cylinderGeometry args={[.125,.125,.10,24]}/></mesh>
    </group>)}
    <group ref={cylinder} position={[0,1.385,z]} userData={{captureNeutralRotor:true}}>
      {stageClearance?[-1.58,1.58].map(x=><mesh key={x} position={[x,0,0]} rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow receiveShadow><cylinderGeometry args={[.10,.10,1.52,48]}/></mesh>):<mesh rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow receiveShadow><cylinderGeometry args={[.10,.10,4.6,48]}/></mesh>}
      {Array.from({length:40},(_,index)=>{const a=index*.83,x=-2.18+index*.112;if(stageClearance&&Math.abs(x)<.85)return null;return <mesh key={index} position={[x,Math.cos(a)*.112,Math.sin(a)*.112]} material={materials.brassDark} castShadow><sphereGeometry args={[.011,6,5]}/></mesh>;})}
    </group>
    {stageClearance?[-1.58,1.58].map(x=><BeveledBox key={x} size={[1.52,.035,.10]} position={[x,1.385,z+.20]} radius={.015} material={materials.brassDark}/>):<BeveledBox size={[2.5,.035,.10]} position={[0,1.385,z+.20]} radius={.015} material={materials.brassDark}/>}
    {Array.from({length:stageClearance?40:20},(_,index)=>{const x=stageClearance?-2.25+index*.116:-1.12+index*.118;if(stageClearance&&Math.abs(x)<.85)return null;return <BeveledBox key={index} size={[.078,.018,.14]} position={[x,1.412,z+.185]} radius={.005} material={materials.brass}/>;})}
  </group>;
}
