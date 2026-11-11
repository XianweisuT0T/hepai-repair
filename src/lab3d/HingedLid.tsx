import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, ExtrudeGeometry, Path } from 'three';
import { BeveledBox, roundShape, useGeometry } from './Geometry';
import { BOX } from './config';
import type { LabMaterials } from './materials';
import type { Lab3DState } from './types';

export default function HingedLid({state,materials,openness,pivotRef}:{state:Lab3DState;materials:LabMaterials;openness:RefObject<number>;pivotRef:(group:Group|null)=>void}){
  const innerInlay=useGeometry(()=>{
    const shape=roundShape(5.86,3.32,.07);shape.holes.push(new Path(roundShape(5.83,3.29,.06).getPoints(16)));
    const geometry=new ExtrudeGeometry(shape,{depth:.004,bevelEnabled:false,curveSegments:14});geometry.rotateX(Math.PI/2);return geometry;
  },[]);
  const outsideInlay=useGeometry(()=>{
    const shape=roundShape(6.10,3.60,.10);shape.holes.push(new Path(roundShape(6.075,3.575,.09).getPoints(16)));
    const geometry=new ExtrudeGeometry(shape,{depth:.003,bevelEnabled:false,curveSegments:14});geometry.rotateX(-Math.PI/2);return geometry;
  },[]);
  const pivot=useRef<Group>(null);
  const motion=useRef({from:openness.current,to:openness.current,at:0});
  useEffect(()=>{motion.current={from:openness.current,to:state.lidOpen?1:0,at:performance.now()};},[state.lidOpen,state.epoch,openness]);
  useEffect(()=>{
    const value=state.lidOpen?1:0;openness.current=value;
    motion.current={from:value,to:value,at:performance.now()-800};
    if(pivot.current)pivot.current.rotation.x=-value*Math.PI*.59;
  },[state.epoch,openness]);
  useFrame((_,delta)=>{
    const target=state.lidOpen?1:0;
    const t=Math.min(1,(performance.now()-motion.current.at)/800);
    const eased=t*t*(3-2*t);
    openness.current=state.reduceMotion?target:motion.current.from+(motion.current.to-motion.current.from)*eased;
    if(pivot.current)pivot.current.rotation.x=-openness.current*Math.PI*.59;
    if(t<1)_.invalidate();
  });
  return <>
    {[-2.1,2.1].map(x=><group key={x} position={[x,BOX.rimY,BOX.hingeZ]}>
      <mesh rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow><cylinderGeometry args={[.085,.085,.52,24]}/></mesh>
      {[-.10,.10].map(seam=><mesh key={seam} position={[seam,0,0]} rotation={[0,Math.PI/2,0]} material={materials.brassDark}><torusGeometry args={[.085,.004,4,20]}/></mesh>)}
      <BeveledBox size={[.48,.035,.34]} position={[0,-.04,.13]} radius={.015} material={materials.brass}/>
    </group>)}
    <group ref={node=>{pivot.current=node;pivotRef(node);}} position={[0,BOX.rimY,BOX.hingeZ]} rotation={[-Math.PI*.59,0,0]} name="lid-hinge-pivot">
      <BeveledBox size={[BOX.width,.28,BOX.depth]} position={[0,.14,BOX.depth/2]} radius={.065} material={materials.wood}/>
      <mesh geometry={outsideInlay} position={[0,.279,BOX.depth/2]} material={materials.brassDark}/>
      <BeveledBox size={[6.17,.017,3.66]} position={[0,-.010,BOX.depth/2]} radius={.07} material={materials.woodEdge}/>
      <BeveledBox size={[6.05,.045,3.54]} position={[0,-.023,BOX.depth/2]} radius={.06} material={materials.velvet}/>
      {[-2.99,2.99].map(x=><BeveledBox key={x} size={[.045,.022,3.49]} position={[x,-.054,1.95]} radius={.008} material={materials.brass}/>)}
      {[.21,3.69].map(z=><BeveledBox key={z} size={[5.99,.022,.045]} position={[0,-.054,z]} radius={.008} material={materials.brass}/>)}
      <mesh geometry={innerInlay} position={[0,-.047,1.95]} material={materials.brassDark}/>
      {[-2.1,2.1].map(x=><group key={x} position={[x,-.054,.27]}>
        <BeveledBox size={[.43,.011,.32]} radius={.025} material={materials.brassDark}/>
        {[-.13,.13].map(offset=><mesh key={offset} position={[offset,-.010,.025]} material={materials.brass}><cylinderGeometry args={[.024,.024,.007,12]}/></mesh>)}
      </group>)}
      <mesh position={[0,-.054,1.7]} rotation={[Math.PI/2,0,0]} scale={[1.88,1,1]} material={materials.brassDark}><torusGeometry args={[1.0,.008,6,72,Math.PI]}/></mesh>
      <mesh position={[0,-.054,1.7]} rotation={[Math.PI/2,0,0]} scale={[1.86,1,1]} material={materials.brassDark}><torusGeometry args={[1.1,.004,5,72,Math.PI]}/></mesh>
      <BeveledBox size={[.66,.09,.16]} position={[0,.15,3.93]} radius={.02} material={materials.brass}/>
      {([[-2.65,.7],[-2.1,2.6],[-1.6,3.12],[-1.16,1.5],[-.65,2.75],[-.24,.7],[.35,3.2],[.8,2.65],[1.3,.9],[1.75,3.2],[2.18,1.8],[2.65,2.9],[2.55,.65]] as const).map(([x,z],index)=><group key={index} position={[x,-.064,z]}>
        {index%4===0?<><BeveledBox size={[.09,.009,.014]} radius={.003} material={materials.brass}/><BeveledBox size={[.014,.009,.09]} radius={.003} material={materials.brass}/></>:<mesh material={materials.brass}><sphereGeometry args={[index%3===0?.016:.011,8,6]}/></mesh>}
      </group>)}
    </group>
  </>;
}
