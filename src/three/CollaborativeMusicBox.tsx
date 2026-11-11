import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, MathUtils, Object3D, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import BoxBody from '../lab3d/BoxBody';
import HingedLid from '../lab3d/HingedLid';
import PaperStage from '../lab3d/PaperStage';
import Mechanism from '../lab3d/Mechanism';
import Lighting from '../lab3d/Lighting';
import { supportsWebGL2 } from '../lab3d/MusicBox3D';
import { useLabMaterials } from '../lab3d/materials';
import { CAMERA, CRANK_CENTER } from '../lab3d/config';
import type { Lab3DState } from '../lab3d/types';
import { scoreFromNotes, type ScoreWorldRenderedState } from '../../shared/scoreWorld';
import ProductionControls from './ProductionControls';
import ProductionGear from './ProductionGear';
import ProductionNotes from './ProductionNotes';
import ProductionCrank from './ProductionCrank';
import ProductionArm from './ProductionArm';
import ProductionMarks from './ProductionMarks';
import { ARM_POSITION, NOTE_POSITIONS, PRODUCTION_SOCKETS, roomEpoch } from './productionConfig';
import { registerProductionCapture } from './capture';
import { registerProductionPicker, type ProductionDropTarget } from './picking';
import type { CollaborativeSceneProps } from './types';

function Scene({props,host}:{props:CollaborativeSceneProps;host:RefObject<HTMLDivElement|null>}){
  const {gl,camera,scene,invalidate}=useThree();
  const materials=useLabMaterials(props.finish);
  const live=useRef(props);live.current=props;
  const controls=useRef<OrbitControls|null>(null),dragging=useRef(false),cameraMoving=useRef(false),openness=useRef(props.lidOpen?1:0);
  const lid=useRef<Group|null>(null),crank=useRef<Group|null>(null),arm=useRef<Group|null>(null);
  const scoreTelemetry=useRef<ScoreWorldRenderedState|null>(null);
  const score=useMemo(()=>props.score??props.work?.arrangement??((props.work||['arrange','launch','performance','complete'].includes(props.stage))?scoreFromNotes(props.notes):undefined),[props.score,props.work?.arrangement,props.work,props.notes,props.stage]);
  const playback={playing:props.playing,startedAt:props.playbackStartedAt,loops:props.playbackLoops,beatMs:props.playbackBeatMs,beats:props.playbackBeats};
  const currentIds=Object.values(props.installedGearMap).filter(gear=>Boolean(gear)).map(gear=>gear!.id);
  const installedHistory=useRef({roomKey:props.roomKey,ids:new Set(currentIds)});
  const arrivingIds=new Set(installedHistory.current.roomKey===props.roomKey?currentIds.filter(id=>!installedHistory.current.ids.has(id)):[]);
  useEffect(()=>{installedHistory.current={roomKey:props.roomKey,ids:new Set(currentIds)};},[props.roomKey,props.installedGearMap]);
  const down=useRef<Record<string,{x:number;y:number}>>({});
  const visualState:Lab3DState={mode:props.mode,lidOpen:props.lidOpen,selected:false,installed:false,installingAt:null,winding:props.windingProgress,playing:props.playing,epoch:roomEpoch(props.roomKey),viewRevision:props.viewRevision,reduceMotion:props.reduceMotion};
  const canInteract=()=>!cameraMoving.current&&live.current.mode==='assemble'&&live.current.lidOpen&&openness.current>.985&&!live.current.playing;

  useEffect(()=>{invalidate();},[props,invalidate]);
  useEffect(()=>{
    const element=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();live.current.onError('WebGL 图形上下文已丢失，已为你保留原来的修理状态。可切回二维继续。');};
    element.addEventListener('webglcontextlost',lost);
    if(host.current)host.current.dataset.webgl='ready';live.current.onReady();
    return()=>{element.removeEventListener('webglcontextlost',lost);if(host.current)delete host.current.dataset.webgl;};
  },[gl,host]);

  useEffect(()=>registerProductionPicker({element:gl.domElement,pick:(clientX,clientY)=>{
    if(!canInteract())return null;
    const bounds=gl.domElement.getBoundingClientRect();if(!bounds.width||!bounds.height)return null;
    const pointer=new Vector2((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1);
    const raycaster=new Raycaster();camera.updateMatrixWorld();scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
    const intersections=raycaster.intersectObjects(scene.children,true);
    const first=intersections.find(hit=>{let object:Object3D|null=hit.object;while(object){if(!object.visible||object.name==='production-overlays'||object.name==='preview-gear')return false;object=object.parent;}return true;});
    if(!first)return null;
    let object:Object3D|null=first.object;let target:ProductionDropTarget|undefined;
    while(object){if(object.userData.productionTarget){target=object.userData.productionTarget as ProductionDropTarget;break;}object=object.parent;}
    if(target?.kind==='gear'&&live.current.stage==='gears'&&live.current.canPlaceGears)return target;
    if(target?.kind==='note'&&live.current.stage==='melody'&&live.current.canPlaceNotes)return target;
    return null;
  }}),[gl,camera,scene]);

  useEffect(()=>registerProductionCapture({element:gl.domElement,getWork:()=>live.current.work,capture:async()=>{
    const current=live.current;
    if(!current.work||PRODUCTION_SOCKETS.some(slot=>!current.installedGearMap[slot.id])||current.notes.length!==4)throw new Error('请等音乐盒完整呈现后再保存作品图片。');
    const finalNotes=current.work.arrangement?.tracks.A.notes??current.work.notes;
    if(JSON.stringify(current.notes)!==JSON.stringify(finalNotes))throw new Error('最终旋律还在同步，请等声音片更新后再保存。');
    const size=gl.getSize(new Vector2()),ratio=gl.getPixelRatio();
    const position=camera.position.clone(),quaternion=camera.quaternion.clone();
    const perspective=camera instanceof PerspectiveCamera?camera:null;
    const projection=perspective?{aspect:perspective.aspect,fov:perspective.fov,zoom:perspective.zoom}:null;
    const hidden:Object3D[]=[],rotors:{object:Object3D;position:Vector3;rotation:[number,number,number];scale:Vector3}[]=[];
    const restoreScoreWorld:(()=>void)[]=[];
    try{
      scene.traverse(object=>{
      if((object.name==='production-overlays'||object.name==='preview-gear')&&object.visible){hidden.push(object);object.visible=false;}
      if(object.userData.captureNeutralRotor||object.name==='lid-hinge-pivot'||object.name==='retracting-paper-stage'||object.name==='stage-storage-stem'||object.name==='retracting-note-rail'){
        rotors.push({object,position:object.position.clone(),rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:object.scale.clone()});
        if(object.userData.captureNeutralRotor){object.rotation.set(0,0,0);object.scale.y=1;}
        if(object.name==='lid-hinge-pivot')object.rotation.x=-Math.PI*.59;
        if(object.name==='retracting-paper-stage')object.position.y=1.64;
        if(object.name==='stage-storage-stem'){object.position.y=.15375-1.64*.5;object.scale.y=1.64-.4125;}
        if(object.name==='retracting-note-rail')object.position.y=.10;
      }
        if(typeof object.userData.captureScoreWorld==='function')restoreScoreWorld.push(object.userData.captureScoreWorld(current.work!.arrangement??scoreFromNotes(current.work!.notes)));
      });
      gl.setPixelRatio(1);gl.setSize(1400,1000,false);
      camera.position.set(...CAMERA.position);camera.lookAt(...CAMERA.target);
      if(perspective){perspective.aspect=1.4;perspective.fov=35;perspective.zoom=1;perspective.updateProjectionMatrix();}
      scene.updateMatrixWorld(true);camera.updateMatrixWorld();gl.shadowMap.needsUpdate=true;gl.render(scene,camera);
      return gl.domElement.toDataURL('image/png');
    }finally{
      hidden.forEach(object=>{object.visible=true;});rotors.forEach(({object,position,rotation,scale})=>{object.position.copy(position);object.rotation.set(...rotation);object.scale.copy(scale);});
      restoreScoreWorld.forEach(restore=>restore());
      camera.position.copy(position);camera.quaternion.copy(quaternion);
      if(perspective&&projection){perspective.aspect=projection.aspect;perspective.fov=projection.fov;perspective.zoom=projection.zoom;perspective.updateProjectionMatrix();}
      gl.setPixelRatio(ratio);gl.setSize(size.x,size.y,false);scene.updateMatrixWorld(true);gl.shadowMap.needsUpdate=true;invalidate();
    }
  }}),[gl,camera,scene,invalidate]);

  useFrame(()=>{
    const element=host.current;if(!element)return;
    const projected=new Vector3();
    const put=(prefix:string,point:Vector3)=>{projected.copy(point).project(camera);element.setAttribute(`data-${prefix}-ndc-x`,projected.x.toFixed(6));element.setAttribute(`data-${prefix}-ndc-y`,projected.y.toFixed(6));};
    camera.updateMatrixWorld();
    const plaquePosition=new Vector3(0,.91,2.003);put('plaque',plaquePosition.clone());
    element.dataset.plaqueFacingDot=new Vector3(0,0,1).dot(camera.position.clone().sub(plaquePosition).normalize()).toFixed(6);
    PRODUCTION_SOCKETS.forEach(slot=>put(slot.id,new Vector3(slot.x,1.47,slot.z)));
    NOTE_POSITIONS.forEach((position,index)=>{const point=new Vector3(position[0],position[1]+.10*MathUtils.smoothstep(openness.current,.45,.95)+.03,position[2]);put(`note-${index}`,point);put(`note${index}`,point.clone());});
    put('crank',new Vector3(...CRANK_CENTER));
    if(crank.current){crank.current.updateWorldMatrix(true,false);put('crank-handle',crank.current.localToWorld(new Vector3(.29,.57,0)));}
    if(arm.current){arm.current.updateWorldMatrix(true,false);const point=arm.current.localToWorld(new Vector3(0,.055,.32));put('arm',point);put('launch-lever',point.clone());}
    const path=Array.from({length:17},(_,index)=>{const a=-index*Math.PI/8,p=new Vector3(CRANK_CENTER[0]+.29,CRANK_CENTER[1]+Math.cos(a)*.57,CRANK_CENTER[2]+Math.sin(a)*.57).project(camera);return[Number(p.x.toFixed(6)),Number(p.y.toFixed(6))];});element.dataset.crankPath=JSON.stringify(path);
    element.dataset.cameraX=camera.position.x.toFixed(5);element.dataset.cameraY=camera.position.y.toFixed(5);element.dataset.cameraZ=camera.position.z.toFixed(5);element.dataset.lidAngle=(lid.current?.rotation.x??0).toFixed(5);
    const gearPoses=PRODUCTION_SOCKETS.flatMap(slot=>{const gear=live.current.installedGearMap[slot.id],object=gear?scene.getObjectByName(`installed-${gear.id}`):undefined;if(!gear||!object)return[];const position=object.getWorldPosition(new Vector3());return[{slotId:slot.id,gearId:gear.id,x:position.x,y:position.y,z:position.z,axisX:slot.x,axisZ:slot.z,installing:!!object.userData.installing}];});
    element.dataset.gearPoses=JSON.stringify(gearPoses);
    element.dataset.installingGears=JSON.stringify(gearPoses.filter(gear=>gear.installing));
    element.dataset.inspectionPadPresent=String(!!scene.getObjectByName('inspection-pad'));
    element.dataset.scoreWorld=JSON.stringify(scoreTelemetry.current);
  });

  const slotAllowed=()=>canInteract()&&props.stage==='gears'&&(props.canPlaceGears||props.canPoint);
  const slotClick=(id:string,event:ThreeEvent<MouseEvent>)=>{
    const start=down.current[id];if(!slotAllowed()||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>7)return;
    event.stopPropagation();if(props.canPlaceGears)props.onSlot(id);else props.onPoint(id);
  };
  const showMarks=props.stage==='gears'||props.stage==='melody';
  return <>
    <Lighting transparent/>
    <ProductionControls props={props} controlsRef={controls} dragging={dragging} moving={cameraMoving} host={host}/>
    <mesh position={[0,-.04,0]} receiveShadow material={materials.table}><cylinderGeometry args={[5.7,5.7,.16,96]}/></mesh>
    <BoxBody materials={materials} gearLayout={PRODUCTION_SOCKETS} title={props.workTitle} stamps={props.stamps} production showPad={false} paperWellRadius={.75} deepPaperWell/>
    <group onClick={event=>event.stopPropagation()}><HingedLid state={visualState} materials={materials} openness={openness} pivotRef={node=>{lid.current=node;}}/></group>
    {PRODUCTION_SOCKETS.map((slot,index)=>{
      const gear=props.installedGearMap[slot.id];
      return <group key={slot.id} name={`production-${slot.id}`} userData={{productionTarget:{kind:'gear',slotId:slot.id}}}
        onPointerDown={event=>{if(slotAllowed()){event.stopPropagation();down.current[slot.id]={x:event.clientX,y:event.clientY};}}} onClick={event=>slotClick(slot.id,event)}>
        {gear&&<ProductionGear key={`${props.roomKey}:${gear.id}`} gear={gear} position={[slot.x,1.41,slot.z]} materials={materials} playing={props.playing} reduceMotion={props.reduceMotion} arriving={arrivingIds.has(gear.id)&&props.lidOpen&&openness.current>.985} index={index}/>}
        <mesh name={`slot-hit-${slot.id}`} position={[slot.x,1.42,slot.z]}><cylinderGeometry args={[.75,.75,.12,48]}/><meshBasicMaterial color="#dbc790" transparent opacity={slotAllowed()&&!gear&&props.selectedGear?.id?.length ? .07 : 0} depthWrite={false}/></mesh>
      </group>;
    })}
    <ProductionNotes props={props} materials={materials} canInteract={canInteract} openness={openness}/>
    <PaperStage state={visualState} materials={materials} openness={openness} openHeight={1.64} stageZ={-.94} showStem score={score} playback={playback} scoreTelemetry={scoreTelemetry}/>
    <Mechanism state={visualState} materials={materials} z={-.43} stageClearance/>
    <ProductionCrank props={props} materials={materials} controlsRef={controls} dragging={dragging} groupRef={node=>{crank.current=node;}} host={host} canInteract={canInteract}/>
    <ProductionArm props={props} materials={materials} canInteract={canInteract} groupRef={node=>{arm.current=node;}}/>
    <group name="production-overlays" visible={showMarks&&props.lidOpen}><ProductionMarks mark={props.marks.at(-1)} materials={materials}/></group>
  </>;
}

export default function CollaborativeMusicBox(props:CollaborativeSceneProps){
  const host=useRef<HTMLDivElement>(null),live=useRef(props);live.current=props;
  const [supported,setSupported]=useState<boolean|null>(null);
  useEffect(()=>{const available=supportsWebGL2();setSupported(available);if(!available)live.current.onError('当前浏览器无法启用 WebGL 2，可切回二维继续修理。');},[]);
  useEffect(()=>{if(!supported)return;const timeout=window.setTimeout(()=>{if(host.current?.dataset.webgl!=='ready')live.current.onError('三维画布初始化超时，可切回二维继续修理。');},10000);return()=>window.clearTimeout(timeout);},[supported]);
  const installedIds=Object.fromEntries(Object.entries(props.installedGearMap).filter((entry):entry is[string,NonNullable<typeof entry[1]>]=>Boolean(entry[1])).map(([id,gear])=>[id,gear.id]));
  const selectedGearId=props.selectedGear&&!Object.values(props.installedGearMap).some(gear=>gear?.id===props.selectedGear?.id)?props.selectedGear.id:'';
  const lastMark=props.marks.at(-1);
  const arrowTarget=props.lidOpen&&(props.stage==='gears'||props.stage==='melody')&&lastMark&&(PRODUCTION_SOCKETS.some(slot=>slot.id===lastMark.target)||/^note-[0-3]$/.test(lastMark.target))?lastMark:undefined;
  return <div ref={host} data-testid="production-canvas" data-webgl="loading" data-view={props.view} data-stage={props.stage} data-role={props.role||''} data-installed-gears={JSON.stringify(installedIds)} data-notes={JSON.stringify(props.notes)} data-finish={props.finish} data-stamps={JSON.stringify(props.stamps||{})} data-title={props.workTitle||''} data-selected-gear={selectedGearId} data-preview-gear="" data-partner-arrow-target={arrowTarget?.target||''} data-partner-arrow-by={arrowTarget?.by||''} data-playing={String(props.playing)} data-playback-started-at={props.playbackStartedAt??''} data-playback-beat-ms={props.playbackBeatMs??''} data-playback-beats={props.playbackBeats??''} data-guide-ready={String(props.guideReady)} data-winding={props.windingProgress} data-winding-started={String(props.windingStarted)} style={{width:'100%',height:'100%',touchAction:'none'}}>
    {supported?<Canvas frameloop="demand" shadows dpr={[1,1.6]} camera={{position:[...CAMERA.position],fov:35,near:.1,far:90}} gl={{antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true}} fallback={<p>三维画布无法启用，请切回二维继续。</p>}>
      <Scene props={props} host={host}/>
    </Canvas>:<p role="status">{supported===false?'三维画布无法启用。':'正在准备音乐盒…'}</p>}
  </div>;
}
