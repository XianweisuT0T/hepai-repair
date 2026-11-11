import { useEffect, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, MathUtils, Plane, Vector3 } from 'three';
import { BeveledBox } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';
import { ARM_POSITION } from './productionConfig';
import type { CollaborativeSceneProps } from './types';

const REST_ANGLE=-.30,READY_ANGLE=.30,READY_THRESHOLD=.65;
const HANDLE_RADIUS=.32,HANDLE_Y=.047;
type CaptureTarget={hasPointerCapture:(id:number)=>boolean;releasePointerCapture:(id:number)=>void;setPointerCapture:(id:number)=>void};
interface ArmGesture{id:number;last:number;travel:number;base:number;x:number;y:number;moved:boolean;target:CaptureTarget}

export default function ProductionArm({props,materials,canInteract,groupRef}:{props:CollaborativeSceneProps;materials:LabMaterials;canInteract:()=>boolean;groupRef:(group:Group|null)=>void}){
  const {camera,gl,invalidate}=useThree();
  const lever=useRef<Group>(null),pending=useRef(false),gesture=useRef<ArmGesture|null>(null);
  const live=useRef(props);live.current=props;
  const interaction=useRef(canInteract);interaction.current=canInteract;
  const suppressClick=useRef(false),clickEligible=useRef(false),pendingTimer=useRef<number|null>(null);
  const plane=useRef(new Plane(new Vector3(0,1,0),-(ARM_POSITION[1]+HANDLE_Y))),hit=useRef(new Vector3());
  const host=useRef<HTMLElement|null>(null);
  const allowed=()=>interaction.current()&&live.current.stage==='launch'&&live.current.role==='guide'&&live.current.canArm&&!live.current.guideReady&&!pending.current;
  const reset=()=>{
    const current=gesture.current;gesture.current=null;
    // Clear our gesture before releasing capture: lostpointercapture is also
    // fired on a successful release and must not cancel the accepted intent.
    if(current){try{if(current.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);}catch{/* A cancelled browser gesture may already have released capture. */}}
    invalidate();
  };
  const cancel=()=>{if(gesture.current){suppressClick.current=true;clickEligible.current=false;reset();}};
  const clearPending=()=>{if(pendingTimer.current!==null){window.clearTimeout(pendingTimer.current);pendingTimer.current=null;}};
  const submit=()=>{
    if(!allowed())return;pending.current=true;clickEligible.current=false;clearPending();
    pendingTimer.current=window.setTimeout(()=>{pendingTimer.current=null;if(!live.current.guideReady){pending.current=false;invalidate();}},2500);
    live.current.onArm();invalidate();
  };
  // The mechanism actually pivots around its Y shaft. Ray/plane intersection
  // follows that real arc, so "forward" stays correct for any role camera.
  const angleAt=(event:ThreeEvent<PointerEvent>)=>{
    const point=event.ray.intersectPlane(plane.current,hit.current);if(!point)return null;
    const x=point.x-ARM_POSITION[0],z=point.z-ARM_POSITION[2];
    return Math.hypot(x,z)<.075?null:Math.atan2(x,z);
  };
  useEffect(()=>{
    host.current=gl.domElement.closest<HTMLElement>('[data-testid="production-canvas"]');
    const blur=()=>{suppressClick.current=true;clickEligible.current=false;reset();};
    const canvas=gl.domElement;canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',blur);
    return()=>{canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',blur);clearPending();reset();};
  },[gl]);
  useEffect(()=>{cancel();clearPending();pending.current=false;clickEligible.current=false;},[props.roomKey]);
  useEffect(()=>{
    if(props.guideReady){cancel();clearPending();pending.current=false;}
    if(!props.canArm||!props.lidOpen||props.mode!=='assemble'||props.stage!=='launch'||props.role!=='guide'||props.playing)cancel();
    if(props.stage!=='launch'){clearPending();pending.current=false;}
  },[props.guideReady,props.canArm,props.lidOpen,props.mode,props.stage,props.role,props.playing]);
  useFrame((state,delta)=>{
    const object=lever.current;if(!object)return;
    const current=gesture.current;
    const target=current?MathUtils.clamp(current.base+current.travel,REST_ANGLE,READY_ANGLE):props.guideReady||pending.current?READY_ANGLE:REST_ANGLE;
    object.rotation.y=current||props.reduceMotion?target:MathUtils.damp(object.rotation.y,target,16,Math.min(delta,.05));
    if(Math.abs(object.rotation.y-target)>.001)state.invalidate();
    const element=host.current;
    if(element){
      element.dataset.armDragging=String(!!current);element.dataset.armProgress=((object.rotation.y-REST_ANGLE)/(READY_ANGLE-REST_ANGLE)).toFixed(4);
      element.dataset.armAngle=(object.rotation.y*180/Math.PI).toFixed(3);element.dataset.armThreshold=String(READY_THRESHOLD);
      element.dataset.armReady=String(props.guideReady);
      // Public geometry coordinates only. They are also useful to verify that
      // real raycasting and touch follow the same visible mechanism.
      object.parent?.updateWorldMatrix(true,false);
      element.dataset.armPath=JSON.stringify(Array.from({length:17},(_,index)=>{
        const angle=REST_ANGLE+(READY_ANGLE-REST_ANGLE)*index/16;
        const point=new Vector3(Math.sin(angle)*HANDLE_RADIUS,HANDLE_Y,Math.cos(angle)*HANDLE_RADIUS);
        if(object.parent)point.applyMatrix4(object.parent.matrixWorld);point.project(camera);
        return[Number(point.x.toFixed(6)),Number(point.y.toFixed(6))];
      }));
    }
  });
  return <group position={[...ARM_POSITION]} name="guide-arm-mechanism">
    <BeveledBox size={[.54,.035,.61]} radius={.05} material={materials.brassDark}/>
    <mesh position={[0,.027,0]} material={materials.brass}><cylinderGeometry args={[.10,.10,.025,24]}/></mesh>
    <group ref={node=>{lever.current=node;groupRef(node);}} name="guide-arm-lever" rotation={[0,props.guideReady?READY_ANGLE:REST_ANGLE,0]}
      onPointerDown={event=>{
        if(!allowed()||event.button!==0)return;const angle=angleAt(event);if(angle===null)return;
        event.stopPropagation();suppressClick.current=false;clickEligible.current=true;
        const target=event.target as unknown as CaptureTarget;
        gesture.current={id:event.pointerId,last:angle,travel:0,base:lever.current?.rotation.y??REST_ANGLE,x:event.clientX,y:event.clientY,moved:false,target};
        target.setPointerCapture(event.pointerId);invalidate();
      }}
      onPointerMove={event=>{
        const current=gesture.current;if(!current||current.id!==event.pointerId)return;event.stopPropagation();
        if(!allowed()){cancel();return;}const angle=angleAt(event);if(angle===null)return;
        let change=angle-current.last;if(change>Math.PI)change-=Math.PI*2;if(change< -Math.PI)change+=Math.PI*2;
        current.last=angle;if(Math.abs(change)<.75)current.travel+=change;
        if(Math.abs(current.travel)>.02||Math.hypot(event.clientX-current.x,event.clientY-current.y)>5){current.moved=true;clickEligible.current=false;}
        invalidate();
      }}
      onPointerUp={event=>{
        const current=gesture.current;if(!current||current.id!==event.pointerId)return;event.stopPropagation();
        const progress=(MathUtils.clamp(current.base+current.travel,REST_ANGLE,READY_ANGLE)-REST_ANGLE)/(READY_ANGLE-REST_ANGLE);
        const dragged=current.moved||Math.abs(current.travel)>.02;
        reset();
        if(dragged){suppressClick.current=true;clickEligible.current=false;if(current.travel>0&&progress>=READY_THRESHOLD)submit();}
      }}
      onClick={event=>{
        // A single click may hit the transparent target and brass underneath.
        // Suppress the whole drag-derived click, not merely its first hit.
        event.stopPropagation();if(suppressClick.current||!clickEligible.current)return;submit();
      }}>
      <BeveledBox size={[.095,.045,.39]} position={[0,.035,.14]} radius={.022} material={materials.brass}/>
      <BeveledBox size={[.21,.06,.14]} position={[0,.047,.32]} radius={.035} material={props.guideReady?materials.paperShade:materials.brass}/>
      {props.stage==='launch'&&<mesh position={[0,.045,.28]}>
        <boxGeometry args={[.36,.14,.42]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
      </mesh>}
    </group>
  </group>;
}
