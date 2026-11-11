import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA } from '../lab3d/config';
import { FRONT_CAMERA, LAUNCH_ARM_CAMERA, LAUNCH_CRANK_CAMERA } from './productionConfig';
import type { CollaborativeSceneProps } from './types';

const enteredGearRooms=new Set<string>();
const TRANSITION_MS=1100;
interface Pose {position:Vector3;target:Vector3;fov:number;fit:number;view:'box'|'mechanism'|'winding';minPolarAngle:number;minDistance:number}
interface Motion {from:Pose;to:Pose;at:number}
// Stage layouts can remount the Canvas. Keep the actually displayed pose so
// ready -> assembly begins where the two people were looking, not a hidden reset.
const lastRoomPoses=new Map<string,{pose:Pose;stage:CollaborativeSceneProps['stage'];preparing:boolean}>();

function preset(props:CollaborativeSceneProps,aspect:number,forceBox=false):Pose{
  const canObserve=props.mode==='observe'&&(props.stage==='preview'||props.stage==='performance'||props.stage==='complete');
  const view=forceBox||canObserve?'box':props.view;
  const noteFocus=props.stage==='melody'?.27:0;
  const overhead=view==='mechanism'&&(props.stage==='gears'||props.stage==='melody');
  const completion=view==='box'&&!forceBox&&(props.stage==='complete'||!!props.work);
  // A newly mounted gear scene starts from the same front pose shown before both people ready.
  const preparation=view==='box'&&(props.cameraPreparing||(forceBox&&props.stage==='gears'));
  const front=completion||preparation||(view==='box'&&(props.stage==='preview'||props.stage==='performance'));
  const armView=view==='winding'&&props.stage==='launch'&&props.role==='guide';
  const composing=props.stage==='arrange';
  const launchCamera=armView?LAUNCH_ARM_CAMERA:LAUNCH_CRANK_CAMERA;
  // The score preview is a short, wide window. Frame the complete carrier and
  // its four front lamps, rather than using the tree crown as the visual centre.
  const target=new Vector3(...(composing?[0,2.20,-.94]:view==='mechanism'?(overhead?[0,1.38,.80+noteFocus]:[0,1.38,.86+noteFocus]):view==='winding'?launchCamera.target:front?FRONT_CAMERA.target:CAMERA.target) as [number,number,number]);
  // 6.4 units above and 1.48 units in front gives a 77° perspective view.
  // X stays on the box centre so all three shafts form a level horizontal row.
  const raw=new Vector3(...(composing?[.65,4.7,1.05]:view==='mechanism'?(overhead?[0,7.78,2.28+noteFocus]:[1.75,6.9,5.6+noteFocus]):view==='winding'?launchCamera.position:front?FRONT_CAMERA.position:CAMERA.position) as [number,number,number]);
  const fit=view==='box'?Math.max(1,1.2/aspect):Math.max(.55,1.55/aspect);
  return{position:raw.sub(target).multiplyScalar(fit).add(target),target,fov:view==='box'?35:32,fit,view,minPolarAngle:Math.PI*(overhead?.035:.14),minDistance:composing?2:armView?2.2:view==='box'?9.2:4};
}

export default function ProductionControls({props,controlsRef,dragging,moving,host}:{props:CollaborativeSceneProps;controlsRef:MutableRefObject<OrbitControls|null>;dragging:MutableRefObject<boolean>;moving:MutableRefObject<boolean>;host:RefObject<HTMLDivElement|null>}){
  const {camera,gl,size,invalidate}=useThree();
  const live=useRef(props);live.current=props;
  const initialized=useRef(false),motion=useRef<Motion|null>(null);
  const remember=()=>{
    const controls=controlsRef.current;if(!controls||!initialized.current)return;
    const current=live.current;
    lastRoomPoses.set(current.roomKey,{stage:current.stage,preparing:!!current.cameraPreparing,pose:{position:camera.position.clone(),target:controls.target.clone(),fov:camera instanceof PerspectiveCamera?camera.fov:35,fit:1,view:current.view,minPolarAngle:controls.minPolarAngle,minDistance:controls.minDistance}});
    if(lastRoomPoses.size>100)lastRoomPoses.delete(lastRoomPoses.keys().next().value!);
  };
  const report=(value:boolean)=>{
    if(host.current){host.current.dataset.cameraMoving=String(value);host.current.dataset.cameraTransitioning=String(value);}
    if(moving.current!==value){moving.current=value;live.current.onCameraMoving?.(value);}
  };
  const observing=()=>live.current.mode==='observe'&&(live.current.stage==='preview'||live.current.stage==='performance'||live.current.stage==='complete');
  const apply=(pose:Pose)=>{
    const controls=controlsRef.current;if(!controls)return;
    camera.position.copy(pose.position);controls.target.copy(pose.target);
    if(camera instanceof PerspectiveCamera){camera.fov=pose.fov;camera.updateProjectionMatrix();}
    controls.update();
  };
  const finish=(pose:Pose)=>{
    const controls=controlsRef.current;if(!controls)return;
    controls.minPolarAngle=pose.minPolarAngle;
    apply(pose);motion.current=null;controls.saveState();controls.enableDamping=true;
    controls.enabled=observing()&&!dragging.current;report(false);
  };
  useEffect(()=>{
    const controls=new OrbitControls(camera,gl.domElement);controlsRef.current=controls;
    controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.11;controls.rotateSpeed=.6;controls.zoomSpeed=.6;
    controls.minPolarAngle=Math.PI*.14;controls.maxPolarAngle=Math.PI*.43;controls.minAzimuthAngle=-1.15;controls.maxAzimuthAngle=Infinity;controls.minAzimuthAngle=-Infinity;
    const changed=()=>{remember();invalidate();};controls.addEventListener('change',changed);controls.addEventListener('start',changed);
    return()=>{remember();motion.current=null;report(false);controls.removeEventListener('change',changed);controls.removeEventListener('start',changed);controls.dispose();controlsRef.current=null;};
  },[camera,gl,invalidate,controlsRef]);
  useEffect(()=>{
    const controls=controlsRef.current;if(!controls||!size.width||!size.height)return;
    const aspect=size.width/size.height,target=preset(props,aspect);
    // Keep the old steep pose valid while travelling back to another preset.
    controls.minPolarAngle=Math.min(controls.minPolarAngle,target.minPolarAngle);
    controls.enableDamping=false;controls.update();
    controls.enabled=false;
    const firstGearEntry=props.stage==='gears'&&!enteredGearRooms.has(props.roomKey);
    if(firstGearEntry){
      enteredGearRooms.add(props.roomKey);
      if(enteredGearRooms.size>100)enteredGearRooms.delete(enteredGearRooms.values().next().value!);
    }
    const remembered=!initialized.current?lastRoomPoses.get(props.roomKey):undefined;
    const continuingScene=!!remembered&&(remembered.stage!==props.stage||remembered.preparing!==!!props.cameraPreparing);
    const enteringCloseup=!initialized.current&&(firstGearEntry||props.stage==='launch'||continuingScene);
    if(enteringCloseup&&!props.reduceMotion){
      if(continuingScene)controls.minPolarAngle=Math.min(controls.minPolarAngle,remembered!.pose.minPolarAngle);
      apply(continuingScene?remembered!.pose:preset(props,aspect,true));
    }
    const from:Pose={position:camera.position.clone(),target:controls.target.clone(),fov:camera instanceof PerspectiveCamera?camera.fov:35,fit:target.fit,view:target.view,minPolarAngle:controls.minPolarAngle,minDistance:target.minDistance};
    controls.minDistance=Math.min(target.minDistance*target.fit,from.position.distanceTo(from.target));
    controls.maxDistance=Math.max(22*target.fit,from.position.distanceTo(from.target));
    const differs=from.position.distanceToSquared(target.position)>.000001||from.target.distanceToSquared(target.target)>.000001||Math.abs(from.fov-target.fov)>.001;
    const animate=!props.reduceMotion&&differs&&(initialized.current||enteringCloseup);
    initialized.current=true;
    if(host.current){host.current.dataset.cameraMode=observing()?'observe':'fixed';host.current.dataset.cameraPreset=props.cameraPreparing?'waiting-front':(props.stage==='complete'||props.work)?'complete-front':props.stage==='performance'?'performance-front':props.stage==='preview'?'home-front':props.stage==='launch'&&target.view==='winding'?props.role==='guide'?'launch-arm':'launch-crank':target.view;}
    if(animate){motion.current={from,to:target,at:performance.now()};report(true);}
    else finish(target);
    invalidate();
  },[props.mode,props.view,props.stage,props.role,props.viewRevision,props.roomKey,props.cameraPreparing,props.reduceMotion,size.width,size.height,camera,controlsRef,dragging,invalidate]);
  useFrame(()=>{
    const controls=controlsRef.current;if(!controls)return;
    const active=motion.current;
    if(active){
      const t=Math.min(1,(performance.now()-active.at)/TRANSITION_MS),eased=t*t*t*(t*(t*6-15)+10);
      camera.position.lerpVectors(active.from.position,active.to.position,eased);controls.target.lerpVectors(active.from.target,active.to.target,eased);
      if(camera instanceof PerspectiveCamera){camera.fov=active.from.fov+(active.to.fov-active.from.fov)*eased;camera.updateProjectionMatrix();}
      controls.update();
      if(t>=1)finish(active.to);else invalidate();
    }else if(controls.enabled)controls.update();
  },-2);
  return null;
}
