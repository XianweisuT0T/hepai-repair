import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group, MathUtils, Path, Shape, Vector3 } from 'three';
import { flatExtrusion, hole, roundShape, useGeometry } from './Geometry';
import { BOX, GEARS, GEAR_TARGET, PAD_POSITION } from './config';
import { LAB_INSTALL_MS, type Lab3DState } from './types';
import type { LabMaterials } from './materials';

export function gearShape(radius: number, teeth: number, notches: number) {
  const shape=new Shape();
  for(let index=0;index<teeth*4;index++){
    const angle=index*Math.PI*2/(teeth*4);
    const r=index%4===0||index%4===3?radius*.86:radius;
    const x=Math.cos(angle)*r,y=Math.sin(angle)*r;
    if(index===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  shape.closePath();hole(shape,0,0,.091);
  for(const angle of [Math.PI*.18,Math.PI*.82,Math.PI*1.5])hole(shape,Math.cos(angle)*radius*.43,Math.sin(angle)*radius*.43,radius*.105);
  for(let index=0;index<notches;index++){
    const groove=roundShape(.034,radius*.23,.015);
    // Round through-slots make each engraved mark legible from side views too.
    const path=new Path(groove.getPoints(12).map(point=>point.set(point.x+(index-(notches-1)/2)*.101,point.y+radius*.59)));shape.holes.push(path);
  }
  return shape;
}

interface GearProps { index:number; state:Lab3DState; materials:LabMaterials; onSelect:()=>void; groupRef?:(group:Group|null)=>void }
export default function Gear({ index,state,materials,onSelect,groupRef }:GearProps){
  const config=GEARS[index];const last=index===2;
  const outer=useRef<Group>(null),rotor=useRef<Group>(null);
  const geometry=useGeometry(()=>flatExtrusion(gearShape(config.radius,config.teeth,config.notches),.105,.015),[index]);
  const down=useRef<{x:number;y:number}|null>(null);
  const start=new Vector3(PAD_POSITION[0],PAD_POSITION[1]+.1,PAD_POSITION[2]);
  const above=new Vector3(GEAR_TARGET[0],2.22,GEAR_TARGET[2]);
  const destination=new Vector3(...GEAR_TARGET);
  useEffect(()=>{
    if(rotor.current)rotor.current.rotation.y=0;
    if(outer.current){
      outer.current.rotation.x=0;
      outer.current.position.set(last&&!state.installed?PAD_POSITION[0]:config.x,last&&!state.installed?PAD_POSITION[1]+.1:BOX.deckTop+.04,last&&!state.installed?PAD_POSITION[2]:config.z);
    }
  },[state.epoch]);
  useFrame((_,delta)=>{
    if(!outer.current||!rotor.current)return;
    delta=Math.min(delta,.05);
    let moving=false;
    if(last){
      if(state.installingAt!==null){
        const t=Math.min(1,Math.max(0,(Date.now()-state.installingAt)/LAB_INSTALL_MS));
        if(state.reduceMotion)outer.current.position.copy(destination);
        else if(t<.62)outer.current.position.lerpVectors(start,above,MathUtils.smoothstep(t,0,.62));
        else outer.current.position.lerpVectors(above,destination,MathUtils.smoothstep(t,.62,1));
        outer.current.rotation.x=0;moving=t<1;
      }else{
        const target=state.installed?destination:new Vector3(start.x,start.y+(state.selected?.23:0),start.z);
        if(state.reduceMotion)outer.current.position.copy(target);else outer.current.position.lerp(target,1-Math.exp(-delta*12));
        const tilt=state.selected&&!state.installed?-.13:0;
        outer.current.rotation.x=state.reduceMotion?tilt:MathUtils.damp(outer.current.rotation.x,tilt,12,delta);
        moving=outer.current.position.distanceToSquared(target)>.000001||Math.abs(outer.current.rotation.x-tilt)>.0005;
      }
    }
    if(state.playing&&!state.reduceMotion&&(state.installed||!last)){rotor.current.rotation.y+=Math.min(delta,.08)*(index%2===0?1:-1)*(.52/config.radius);moving=true;}
    if(moving)_.invalidate();
  });
  const canSelect=last&&state.mode==='assemble'&&state.lidOpen&&!state.lidMoving&&!state.installed&&state.installingAt===null&&!state.playing;
  const click=(event:ThreeEvent<MouseEvent>)=>{
    if(!canSelect||!down.current)return;
    if(Math.hypot(event.clientX-down.current.x,event.clientY-down.current.y)>7)return;
    event.stopPropagation();onSelect();
  };
  return <group ref={node=>{outer.current=node;groupRef?.(node);}} name={last?'repair-gear':'installed-gear'} position={last?[PAD_POSITION[0],PAD_POSITION[1]+.1,PAD_POSITION[2]]:[config.x,BOX.deckTop+.04,config.z]}>
    <group ref={rotor}>
      <mesh name={`gear-${config.id}`} geometry={geometry} material={materials.brass} castShadow receiveShadow
        onPointerDown={event=>{if(canSelect){event.stopPropagation();down.current={x:event.clientX,y:event.clientY};}}} onClick={click}/>
      <mesh position={[0,.121,0]} rotation={[-Math.PI/2,0,0]} material={materials.brassDark}><ringGeometry args={[config.radius*.7,config.radius*.705,64]}/></mesh>
    </group>
    {last&&state.selected&&!state.installed&&<mesh position={[0,-.012,0]} rotation={[-Math.PI/2,0,0]} material={materials.brass}><ringGeometry args={[config.radius+.08,config.radius+.105,64]}/></mesh>}
  </group>;
}
