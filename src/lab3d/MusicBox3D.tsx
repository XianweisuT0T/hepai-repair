import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import BoxBody from './BoxBody';
import Gear from './Gear';
import HingedLid from './HingedLid';
import PaperStage from './PaperStage';
import Crank from './Crank';
import Controls from './Controls';
import Lighting from './Lighting';
import Mechanism from './Mechanism';
import { useLabMaterials } from './materials';
import { CAMERA, CRANK_CENTER, GEARS, GEAR_TARGET } from './config';
import type { MusicBox3DProps } from './types';

let webGL2Supported:boolean|undefined;

/** Fiber's async configure rejection is outside React's render boundary.
 * Probe once per lab module, then release that temporary context immediately. */
export function supportsWebGL2(){
  if(webGL2Supported!==undefined)return webGL2Supported;
  try{
    const probe=document.createElement('canvas');
    const context=probe.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
    webGL2Supported=Boolean(context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    probe.width=probe.height=1;
  }catch{webGL2Supported=false;}
  return webGL2Supported;
}

function Scene({state,onSelect,onInstall,onWind,onError,host}:{host:React.RefObject<HTMLDivElement|null>}&MusicBox3DProps){
  const materials=useLabMaterials();const {gl,camera,invalidate}=useThree();
  const controls=useRef<OrbitControls|null>(null),dragging=useRef(false),openness=useRef(state.lidOpen?1:0);
  const gear=useRef<Group|null>(null),lid=useRef<Group|null>(null),crank=useRef<Group|null>(null);
  const slotDown=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{invalidate();},[state,invalidate]);
  useEffect(()=>{
    const element=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onError('WebGL 图形上下文已丢失，请返回原版或重新载入试验。');};
    element.addEventListener('webglcontextlost',lost);
    if(host.current)host.current.dataset.webgl='ready';
    return()=>{element.removeEventListener('webglcontextlost',lost);if(host.current)delete host.current.dataset.webgl;};
  },[gl,host,onError]);
  useFrame(()=>{
    const element=host.current;if(!element)return;
    const put=(prefix:string,point:Vector3)=>{point.project(camera);element.dataset[`${prefix}NdcX`]=point.x.toFixed(6);element.dataset[`${prefix}NdcY`]=point.y.toFixed(6);};
    camera.updateMatrixWorld();
    if(gear.current){gear.current.updateWorldMatrix(true,false);put('gear',gear.current.localToWorld(new Vector3(GEARS[2].radius*.79,.13,0)));}
    put('slot',new Vector3(...GEAR_TARGET));
    put('crank',new Vector3(...CRANK_CENTER));
    if(crank.current){crank.current.updateWorldMatrix(true,false);put('crankHandle',crank.current.localToWorld(new Vector3(.29,.57,0)));}
    const circle=Array.from({length:17},(_,index)=>{const angle=-index*Math.PI/8;const point=new Vector3(CRANK_CENTER[0]+.29,CRANK_CENTER[1]+Math.cos(angle)*.57,CRANK_CENTER[2]+Math.sin(angle)*.57).project(camera);return[Number(point.x.toFixed(6)),Number(point.y.toFixed(6))];});element.dataset.crankPath=JSON.stringify(circle);
    element.dataset.cameraX=camera.position.x.toFixed(4);element.dataset.cameraY=camera.position.y.toFixed(4);element.dataset.cameraZ=camera.position.z.toFixed(4);element.dataset.lidAngle=(lid.current?.rotation.x??0).toFixed(5);
    element.dataset.crankDragging=String(dragging.current);
  });
  const canInstall=state.mode==='assemble'&&state.lidOpen&&!state.lidMoving&&state.selected&&!state.installed&&state.installingAt===null&&!state.playing;
  const install=(event:ThreeEvent<MouseEvent>)=>{if(!canInstall||!slotDown.current||Math.hypot(event.clientX-slotDown.current.x,event.clientY-slotDown.current.y)>7)return;event.stopPropagation();onInstall();};
  return <>
    <Lighting/>
    <Controls state={state} controlsRef={controls} dragging={dragging}/>
    <group>
      <mesh position={[0,-.04,0]} receiveShadow material={materials.table}><cylinderGeometry args={[5.7,5.7,.16,96]}/></mesh>
      <BoxBody materials={materials}/>
      <group onClick={event=>event.stopPropagation()}><HingedLid state={state} materials={materials} openness={openness} pivotRef={node=>{lid.current=node;}}/></group>
      {GEARS.map((config,index)=><Gear key={config.id} index={index} state={state} materials={materials} onSelect={onSelect} groupRef={index===2?node=>{gear.current=node;}:undefined}/>)}
      <PaperStage state={state} materials={materials} openness={openness}/>
      <Mechanism state={state} materials={materials}/>
      <Crank state={state} materials={materials} onWind={onWind} controlsRef={controls} dragging={dragging} groupRef={node=>{crank.current=node;}}/>
      {!state.installed&&<mesh position={[GEARS[2].x,1.42,GEARS[2].z]} name="last-gear-target"
        onPointerDown={event=>{if(canInstall){event.stopPropagation();slotDown.current={x:event.clientX,y:event.clientY};}}} onClick={install}>
        <cylinderGeometry args={[GEARS[2].radius+.1,GEARS[2].radius+.1,.13,48]}/><meshBasicMaterial color="#d8c48e" transparent opacity={canInstall?.13:0} depthWrite={false}/>
      </mesh>}
    </group>
  </>;
}

export default function MusicBox3D(props:MusicBox3DProps){
  const host=useRef<HTMLDivElement>(null);
  const onError=useRef(props.onError);onError.current=props.onError;
  const [supported,setSupported]=useState<boolean|null>(null);
  useEffect(()=>{
    const available=supportsWebGL2();setSupported(available);
    if(!available)onError.current('当前浏览器无法启用 WebGL 2。可返回原版继续体验。');
  },[]);
  useEffect(()=>{
    if(!supported)return;
    const timeout=window.setTimeout(()=>{
      if(host.current&&host.current.dataset.webgl!=='ready')onError.current('WebGL 三维画布初始化超时，请返回原版或重新载入试验。');
    },10000);
    return()=>window.clearTimeout(timeout);
  },[supported]);
  return <div ref={host} data-testid="lab-canvas" data-webgl="loading" style={{width:'100%',height:'100%',touchAction:'none'}}>
    {supported?<Canvas frameloop="demand" shadows dpr={[1,1.6]} camera={{position:[...CAMERA.position],fov:CAMERA.fov,near:.1,far:90}}
      gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} fallback={<p>当前浏览器无法启用 WebGL，可返回原版继续体验。</p>}
      onPointerMissed={()=>{if(props.state.mode==='assemble'&&props.state.selected&&props.state.installingAt===null&&!props.state.lidMoving)props.onSelect();}}>
      <Scene {...props} host={host}/>
    </Canvas>:<p role="status">{supported===false?'无法启用 WebGL 2。请返回原版继续体验。':'正在检查图形支持…'}</p>}
  </div>;
}
