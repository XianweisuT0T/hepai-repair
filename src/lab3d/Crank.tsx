import { useEffect, useRef, type MutableRefObject } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Plane, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BeveledBox } from './Geometry';
import { CRANK_CENTER } from './config';
import type { Lab3DState } from './types';
import type { LabMaterials } from './materials';

interface CrankProps{state:Lab3DState;materials:LabMaterials;onWind:(fraction:number)=>void;controlsRef:MutableRefObject<OrbitControls|null>;dragging:MutableRefObject<boolean>;groupRef:(group:Group|null)=>void}
type CaptureTarget={hasPointerCapture:(id:number)=>boolean;releasePointerCapture:(id:number)=>void;setPointerCapture:(id:number)=>void};
export default function Crank({state,materials,onWind,controlsRef,dragging,groupRef}:CrankProps){
  const {gl,invalidate}=useThree();
  const gesture=useRef<{id:number;angle:number;target:CaptureTarget}|null>(null);
  const stateRef=useRef(state);stateRef.current=state;
  const plane=useRef(new Plane(new Vector3(1,0,0),-(CRANK_CENTER[0]+.29)));
  const intersection=useRef(new Vector3());
  const reset=()=>{
    const previous=gesture.current;gesture.current=null;dragging.current=false;
    if(previous){try{if(previous.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);}catch{/* Browser can release capture before pointercancel. */}}
    if(controlsRef.current)controlsRef.current.enabled=stateRef.current.mode==='observe';
    invalidate();
  };
  useEffect(()=>{
    const canvas=gl.domElement;canvas.addEventListener('pointercancel',reset);canvas.addEventListener('lostpointercapture',reset);window.addEventListener('blur',reset);
    return()=>{canvas.removeEventListener('pointercancel',reset);canvas.removeEventListener('lostpointercapture',reset);window.removeEventListener('blur',reset);reset();};
  },[gl]);
  useEffect(()=>{reset();},[state.epoch,state.mode,state.lidOpen,state.playing]);
  const enabled=state.mode==='assemble'&&state.lidOpen&&!state.lidMoving&&state.installed&&state.installingAt===null&&!state.playing&&state.winding<1;
  const angleAt=(event:ThreeEvent<PointerEvent>)=>{
    const hit=event.ray.intersectPlane(plane.current,intersection.current);if(!hit)return null;
    const y=hit.y-CRANK_CENTER[1],z=hit.z-CRANK_CENTER[2];
    if(Math.hypot(y,z)<.15)return null;
    return Math.atan2(z,y);
  };
  return <group position={[...CRANK_CENTER]} name="crank-axis">
    <mesh rotation={[0,0,Math.PI/2]} position={[-.13,0,0]} material={materials.brassDark} castShadow><cylinderGeometry args={[.14,.14,.42,32]}/></mesh>
    <mesh rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow><cylinderGeometry args={[.072,.072,.48,24]}/></mesh>
    <group ref={groupRef} rotation={[-state.winding*Math.PI*2,0,0]} name="crank-rotor"
      onPointerDown={event=>{if(!enabled||event.button!==0)return;const angle=angleAt(event);if(angle===null)return;event.stopPropagation();dragging.current=true;if(controlsRef.current)controlsRef.current.enabled=false;const target=event.target as unknown as CaptureTarget;gesture.current={id:event.pointerId,angle,target};target.setPointerCapture(event.pointerId);invalidate();}}
      onPointerMove={event=>{const current=gesture.current;if(!current||current.id!==event.pointerId||!enabled)return;event.stopPropagation();const angle=angleAt(event);if(angle===null)return;let delta=angle-current.angle;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;current.angle=angle;if(Math.abs(delta)<.7)onWind(-delta/(Math.PI*2));invalidate();}}
      onPointerUp={event=>{if(gesture.current?.id===event.pointerId){event.stopPropagation();reset();}}}>
      <BeveledBox size={[.13,.62,.13]} position={[.15,.27,0]} radius={.035} material={materials.brass}/>
      <mesh position={[.29,.57,0]} rotation={[0,0,Math.PI/2]} material={materials.woodEdge} castShadow><cylinderGeometry args={[.105,.105,.46,24]}/></mesh>
      <mesh position={[.51,.57,0]} rotation={[0,0,Math.PI/2]} material={materials.brassDark}><cylinderGeometry args={[.109,.109,.035,24]}/></mesh>
      <mesh position={[.29,.57,0]} rotation={[0,0,Math.PI/2]} visible={enabled}>
        <cylinderGeometry args={[.18,.18,.53,16]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
      </mesh>
    </group>
  </group>;
}
