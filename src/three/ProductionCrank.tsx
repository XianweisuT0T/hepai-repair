import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Plane, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BeveledBox } from '../lab3d/Geometry';
import { CRANK_CENTER } from '../lab3d/config';
import type { LabMaterials } from '../lab3d/materials';
import type { CollaborativeSceneProps } from './types';

type CaptureTarget={hasPointerCapture:(id:number)=>boolean;releasePointerCapture:(id:number)=>void;setPointerCapture:(id:number)=>void};
const MIN_TURN=Math.PI/9;
interface CrankProps{props:CollaborativeSceneProps;materials:LabMaterials;controlsRef:MutableRefObject<OrbitControls|null>;dragging:MutableRefObject<boolean>;groupRef:(group:Group|null)=>void;host:RefObject<HTMLDivElement|null>;canInteract:()=>boolean}
export default function ProductionCrank({props,materials,controlsRef,dragging,groupRef,host,canInteract}:CrankProps){
  const {gl,invalidate}=useThree();const rotor=useRef<Group>(null);
  const live=useRef(props);live.current=props;
  const gesture=useRef<{id:number;last:number;travel:number;base:number;target:CaptureTarget}|null>(null);
  const pending=useRef(false),suppressClick=useRef(false),releasedAngle=useRef(-props.windingProgress*Math.PI*2),releaseProgress=useRef(props.windingProgress),endDirection=useRef(-1);
  const shown=useRef(-props.windingProgress*Math.PI*2);
  const pendingTimer=useRef<number|null>(null);
  const hintTimer=useRef<number|null>(null),hintText=useRef<string|null>(null);
  const plane=useRef(new Plane(new Vector3(1,0,0),-(CRANK_CENTER[0]+.29))),hit=useRef(new Vector3());
  const hint=(message:string|null,duration=0)=>{
    if(hintText.current===message&&!duration)return;
    if(hintTimer.current!==null){window.clearTimeout(hintTimer.current);hintTimer.current=null;}
    hintText.current=message;if(host.current)host.current.dataset.crankHint=message||'';live.current.onCrankHint?.(message);
    if(duration)hintTimer.current=window.setTimeout(()=>{hintTimer.current=null;hintText.current=null;if(host.current)host.current.dataset.crankHint='';live.current.onCrankHint?.(null);},duration);
  };
  const reset=()=>{
    const current=gesture.current;gesture.current=null;dragging.current=false;
    if(current){try{if(current.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);}catch{/* Capture may already have been released by the browser. */}}
    if(controlsRef.current)controlsRef.current.enabled=live.current.mode==='observe';invalidate();
  };
  useEffect(()=>{
    const cancel=()=>{if(gesture.current){suppressClick.current=true;hint(null);reset();}};
    const blur=()=>{suppressClick.current=true;hint(null);reset();};
    const canvas=gl.domElement;canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',blur);
    return()=>{canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',blur);if(pendingTimer.current!==null)window.clearTimeout(pendingTimer.current);if(hintTimer.current!==null)window.clearTimeout(hintTimer.current);reset();};
  },[gl]);
  useEffect(()=>{reset();hint(null);pending.current=false;releasedAngle.current=-props.windingProgress*Math.PI*2;releaseProgress.current=props.windingProgress;},[props.roomKey]);
  useEffect(()=>{if(!props.windingStarted&&!pending.current){releasedAngle.current=-props.windingProgress*Math.PI*2;releaseProgress.current=props.windingProgress;}},[props.windingProgress,props.windingStarted]);
  useEffect(()=>{if(!props.lidOpen||props.mode!=='assemble'||props.stage!=='launch'){hint(null);reset();}},[props.lidOpen,props.mode,props.stage]);
  useEffect(()=>{if(props.windingStarted){hint(null);if(pendingTimer.current!==null){window.clearTimeout(pendingTimer.current);pendingTimer.current=null;}}},[props.windingStarted]);
  const enabled=()=>canInteract()&&live.current.stage==='launch'&&live.current.canWind&&!live.current.windingStarted&&live.current.windingProgress<1&&!pending.current;
  const submit=(angle=shown.current)=>{
    if(!enabled())return;hint(null);pending.current=true;releasedAngle.current=angle;releaseProgress.current=live.current.windingProgress;endDirection.current=angle>0?1:-1;
    if(pendingTimer.current!==null)window.clearTimeout(pendingTimer.current);pendingTimer.current=window.setTimeout(()=>{if(!live.current.windingStarted){pending.current=false;invalidate();}pendingTimer.current=null;},2500);
    props.onWind();invalidate();
  };
  const angleAt=(event:ThreeEvent<PointerEvent>)=>{const point=event.ray.intersectPlane(plane.current,hit.current);if(!point)return null;const y=point.y-CRANK_CENTER[1],z=point.z-CRANK_CENTER[2];return Math.hypot(y,z)<.14?null:Math.atan2(z,y);};
  useFrame(()=>{
    const current=gesture.current;
    if(current)shown.current=current.base+current.travel;
    else if(pending.current||props.windingStarted){const t=props.reduceMotion&&props.windingProgress<1?0:Math.max(0,Math.min(1,(props.windingProgress-releaseProgress.current)/Math.max(.001,1-releaseProgress.current)));shown.current=releasedAngle.current+(endDirection.current*Math.PI*2-releasedAngle.current)*t;}
    else shown.current=-props.windingProgress*Math.PI*2;
    if(rotor.current)rotor.current.rotation.x=shown.current;
    if(host.current){host.current.dataset.crankAngle=(shown.current*180/Math.PI).toFixed(3);host.current.dataset.crankDragging=String(dragging.current);host.current.dataset.crankMinDegrees='20';}
  });
  return <group position={[...CRANK_CENTER]} name="production-crank-axis">
    <mesh rotation={[0,0,Math.PI/2]} position={[-.13,0,0]} material={materials.brassDark} castShadow><cylinderGeometry args={[.14,.14,.42,32]}/></mesh>
    <mesh rotation={[0,0,Math.PI/2]} material={materials.brass} castShadow><cylinderGeometry args={[.072,.072,.48,24]}/></mesh>
    <group ref={node=>{rotor.current=node;groupRef(node);}} name="production-crank-rotor" rotation={[-props.windingProgress*Math.PI*2,0,0]}
      onPointerDown={event=>{if(!enabled()||event.button!==0)return;const angle=angleAt(event);if(angle===null)return;event.stopPropagation();suppressClick.current=false;const target=event.target as unknown as CaptureTarget;gesture.current={id:event.pointerId,last:angle,travel:0,base:shown.current,target};dragging.current=true;hint('轻转后松手，即可开始上弦');if(controlsRef.current)controlsRef.current.enabled=false;target.setPointerCapture(event.pointerId);invalidate();}}
      onPointerMove={event=>{const current=gesture.current;if(!current||current.id!==event.pointerId)return;event.stopPropagation();const angle=angleAt(event);if(angle===null)return;let delta=angle-current.last;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;current.last=angle;if(Math.abs(delta)<.7)current.travel+=delta;hint(Math.abs(current.travel)>=MIN_TURN?'可以松手了':'再转一点，松手即可开始');invalidate();}}
      onPointerUp={event=>{const current=gesture.current;if(!current||current.id!==event.pointerId)return;event.stopPropagation();const travel=current.travel;reset();if(Math.abs(travel)>=MIN_TURN){suppressClick.current=true;submit(current.base+travel);}else if(Math.abs(travel)>.035){suppressClick.current=true;hint('再转一点就好，也可以点按摇柄',2200);}else hint(null);}}
      onClick={event=>{
        // One DOM click can intersect the enlarged hit mesh and the handle.
        // Keep drag suppression until the next valid pointerDown, and stop
        // every intersection before it can dispatch this group a second time.
        event.stopPropagation();if(suppressClick.current)return;if(enabled())submit();
      }}>
      <BeveledBox size={[.13,.62,.13]} position={[.15,.27,0]} radius={.035} material={materials.brass}/>
      <mesh position={[.29,.57,0]} rotation={[0,0,Math.PI/2]} material={materials.woodEdge} castShadow><cylinderGeometry args={[.105,.105,.46,24]}/></mesh>
      <mesh position={[.51,.57,0]} rotation={[0,0,Math.PI/2]} material={materials.brassDark}><cylinderGeometry args={[.109,.109,.035,24]}/></mesh>
      {props.stage==='launch'&&<mesh position={[.29,.57,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.19,.19,.55,16]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>}
    </group>
  </group>;
}
