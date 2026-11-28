import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import OperationCue from './OperationCue';
import { useGuideDismissed } from './apprenticeGuide';
import MusicBox, { type MusicBoxProps } from './MusicBox';
import type { ArrangementVersion, Gear, Role, Work } from '../shared/types';
import type { CollaborativeSceneProps } from './three/types';
import { useWindingProgress } from './useWindingProgress';

const CollaborativeMusicBox=lazy(()=>import('./three/CollaborativeMusicBox'));
const RENDER_KEY='hepai-render-mode';
const displayGears:Gear[]=[
  {id:'display-small',size:'small',notches:1,label:'小齿轮'},
  {id:'display-medium',size:'medium',notches:2,label:'中齿轮'},
  {id:'display-large',size:'large',notches:3,label:'大齿轮'},
];
const slotIds=['slot-1','slot-2','slot-3'];
const slotLabels=['三角槽','圆形槽','方形槽'];

class ModelBoundary extends Component<{children:ReactNode;onFailure:(message:string)=>void},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFailure('三维模型未能显示，已保留当前进度并使用二维备用视图。');}
  render(){return this.state.failed?null:this.props.children;}
}
function initialMode(){
  const query=new URLSearchParams(location.search).get('render');
  if(query==='2d')return false;if(query==='3d')return true;
  try{return localStorage.getItem(RENDER_KEY)!=='2d';}catch{return true;}
}
export interface WorkshopMusicBoxProps extends MusicBoxProps {
  rejectedGear?:{gearId:string;slotId:string;at:number;message:string}|null;
  score?:ArrangementVersion;
  playbackStartedAt?:number;
  playbackBeatMs?:number;
  playbackBeats?:number;
  playbackLoops?:number;
  roomKey?:string;
  allowExpand?:boolean;
  role?:Role;
  disabled?:boolean;
  work?:Work;
  cameraPreparing?:boolean;
  onCancelSelection?:()=>void;
  onRequestStop?:()=>void;
}

/** Adapter between public authoritative room state and the reusable 3D renderer. */
export default function WorkshopMusicBox(props:WorkshopMusicBoxProps){
  const {stage='preview',roomKey='home',view='box',previewState='restored',gears=[],installed={},notes=[],role,disabled=false,work}=props;
  const [use3D,setUse3D]=useState(initialMode),[error,setError]=useState(''),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
  const [lidOpen,setLidOpen]=useState(true),[lidMoving,setLidMoving]=useState(false),[cameraMoving,setCameraMoving]=useState(false),[viewRevision,setViewRevision]=useState(0),[crankHint,setCrankHint]=useState('');
  // Assembly keeps one predictable view; performances and finished works can be explored.
  const mode=stage==='preview'||stage==='performance'||stage==='complete'?'observe':'assemble';
  const [reduceMotion,setReduceMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mobile,setMobile]=useState(()=>matchMedia('(pointer: coarse), (max-width: 600px)').matches);
  const [expanded,setExpanded]=useState(false);
  const expandTouch=useRef<{id:number;x:number;y:number}|null>(null);
  const expandedDialog=useRef<HTMLDialogElement>(null);
  const inlineScene=useRef<HTMLDivElement>(null),expandedScene=useRef<HTMLDivElement>(null);
  // React owns the portal contents; only its mount node moves. Keep one WebGL
  // renderer and the same playing scene when entering or leaving the modal.
  const [sceneMount]=useState(()=>{const node=document.createElement('div');node.style.display='contents';return node;});
  const expandButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const query=matchMedia('(pointer: coarse), (max-width: 600px)');
    const changed=()=>{setMobile(query.matches);if(!query.matches)setExpanded(false);};
    query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);
  },[]);
  useEffect(()=>{expandTouch.current=null;setExpanded(false);},[stage,roomKey]);
  useEffect(()=>{
    if(!expanded)return;
    const dialog=expandedDialog.current;
    if(!dialog)return;
    dialog.showModal();
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{dialog.close();document.body.style.overflow=overflow;expandButton.current?.focus();};
  },[expanded]);
  const lidTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const progress=useWindingProgress(props.winding??0,props.windingAt,props.windingDurationMs,props.windingPausedAt);
  const failed=useCallback((message:string)=>{setError(message);setExpanded(false);setReady(false);setCameraMoving(false);setCrankHint('');},[]);
  const onReady=useCallback(()=>setReady(true),[]);
  const onCrankHint=useCallback((message:string|null)=>setCrankHint(message||''),[]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>setReduceMotion(media.matches);
    media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);
  },[]);
  useEffect(()=>{
    clearTimeout(lidTimer.current);
    setCrankHint('');
    if(!lidOpen){setLidOpen(true);setLidMoving(true);lidTimer.current=setTimeout(()=>setLidMoving(false),reduceMotion?50:900);}
    else setLidMoving(false);
  },[roomKey,stage]);
  useEffect(()=>()=>clearTimeout(lidTimer.current),[]);
  function choose3D(value:boolean){
    setExpanded(false);setUse3D(value);setError('');setReady(false);setCameraMoving(false);if(value)setRetry(current=>current+1);
    try{localStorage.setItem(RENDER_KEY,value?'3d':'2d');}catch{/* The current view still changes if browser storage is unavailable. */}
    const url=new URL(location.href);url.searchParams.set('render',value?'3d':'2d');history.replaceState(null,'',url);
  }
  const is3D=use3D&&!error;
  useLayoutEffect(()=>{
    if(!is3D)return;
    (expanded?expandedScene.current:inlineScene.current)?.appendChild(sceneMount);
    return()=>sceneMount.remove();
  },[expanded,is3D,sceneMount]);
  const canInteract=is3D&&lidOpen&&!lidMoving&&!cameraMoving&&mode==='assemble'&&!disabled;
  const canGears=canInteract&&stage==='gears'&&!!props.canOperate;
  const canNotes=canInteract&&stage==='melody'&&!!props.canOperate;
  const canPoint=canInteract&&role==='guide'&&(stage==='gears'||stage==='melody');
  const canWind=canInteract&&stage==='launch'&&!!props.canWind&&!props.windingAt;
  const canArm=canInteract&&stage==='launch'&&!!props.canArm&&!props.guideReady;
  const [guideDismissed]=useGuideDismissed(`gears:${role}`);
  const installedGearMap:Partial<Record<string,Gear>>={};
  if(stage==='preview'){
    displayGears.forEach((gear,index)=>{if(previewState==='restored'||index!==1)installedGearMap[slotIds[index]]=gear;});
  }else slotIds.forEach(id=>{const gear=gears.find(item=>item.id===installed[id]);if(gear)installedGearMap[id]=gear;});
  const displayNotes=stage==='preview'?(notes.length?notes:previewState==='unrepaired'?['star',null,'leaf',null] as const:['star','moon','leaf','moon'] as const):notes;
  const delivered=role==='guide'&&stage==='gears'?props.marks?.findLast(mark=>!!mark.preview)?.preview:undefined;
  const visiblePart=gears.find(item=>item.id===props.selectedGear)??gears.find(item=>item.id===delivered)??null;
  const scene:CollaborativeSceneProps={
    stage,roomKey,role,view,rejectedGear:props.rejectedGear,previewState,cameraPreparing:props.cameraPreparing,pageScroll:mobile&&!expanded&&stage!=='launch',installedGearMap,gears,notes:[...displayNotes],finish:props.finish??'walnut',
    selectedGear:visiblePart,selectedNote:props.selectedNote??null,
    tutorialSlots:stage==='gears'&&!guideDismissed&&Object.keys(installed).length===0&&canInteract&&(role==='guide'||!!props.selectedGear),
    score:props.score,playbackStartedAt:props.playbackStartedAt,playbackBeatMs:props.playbackBeatMs,playbackBeats:props.playbackBeats,playbackLoops:props.playbackLoops,
    marks:props.marks??[],playing:!!props.playing,highlightNote:props.highlightNote??null,
    windingProgress:progress,windingStarted:!!props.windingAt,guideReady:!!props.guideReady,
    canPlaceGears:canGears,canPlaceNotes:canNotes,canPoint,canWind,canArm,
    stamps:props.stamps,workTitle:props.workTitle,work,lidOpen,mode,viewRevision,reduceMotion,
    onSlot:id=>{if(canGears)props.onSlot?.(id);else if(canPoint)props.onPoint?.(id);},
    onNoteSlot:index=>{if(canNotes)props.onNoteSlot?.(index);else if(canPoint)props.onPoint?.(`note-${index}`);},
    onPoint:target=>{if(canPoint)props.onPoint?.(target);},onWind:()=>{if(canWind)props.onWind?.();},onArm:()=>{if(canArm)props.onArm?.();},onReady,onError:failed,onCameraMoving:setCameraMoving,onCrankHint,
  };
  function toggleLid(){
    if(lidMoving||stage==='performance'||(props.windingAt&&(props.winding??0)<4))return;
    if(props.playing)props.onRequestStop?.();props.onCancelSelection?.();
    setLidMoving(true);setLidOpen(current=>!current);clearTimeout(lidTimer.current);
    lidTimer.current=setTimeout(()=>setLidMoving(false),reduceMotion?50:900);
  }
  const operationGuide=<>
        {stage==='gears'&&<OperationCue visible={lidOpen&&!cameraMoving&&!crankHint} key={`${roomKey}:gears:${role}`} memoryKey={`gears:${role}`} kind="place" done={Object.keys(installed).length>0} text={props.rejectedGear&&props.selectedGear===props.rejectedGear.gearId?'还没咬合，先和伙伴核对一下。':role==='guide'?(delivered?'收到伙伴递来的齿轮了。对照图纸，再把槽位指给伙伴。':'你看图纸。点槽位旁的形状，把位置指给伙伴。'):props.selectedGear?(props.marks?.some(m=>m.target.startsWith('slot-')&&!m.preview)?'伙伴已指了位置，点对应槽位试装；也可以直接拖进去。':'已拿好齿轮。拿不准就点「这块吗？」；也可以直接试装。'):'你来装配。先从零件盘选一枚齿轮。'}/>}
        {stage==='melody'&&<OperationCue visible={lidOpen&&!cameraMoving} key={roomKey+':melody:'+role} memoryKey={'melody:'+role} kind="place" done={notes.some(Boolean)} text={role==='guide'?'先选一段旋律，再把图纸上的声音顺序告诉伙伴。':props.selectedNote?'拿好声音片，点一个槽位放进去；也可以拖过去。':'先试听手边的声音片，再选一片放进音乐盒。'} successText="第一片声音接回来了。照着伙伴的线索继续吧。"/>}
        {stage==='launch'&&<OperationCue visible={lidOpen&&!cameraMoving&&!crankHint} key={`${roomKey}:launch:${role}`} memoryKey={`launch:${role}`} successText="这一边已经就绪。另一双手准备好，音乐就会响起。" kind={role==='maker'?'turn':'slide'} done={role==='maker'?!!props.windingAt||(props.winding??0)>0:!!props.guideReady} text={role==='maker'?'握住木柄，沿箭头转一点；也可以点按上弦。':'沿箭头拨动启动片；也可以点按拨片。'}/>}
  </>;
  const viewport=<div className="production-viewport">
        <ModelBoundary key={retry} onFailure={failed}><Suspense fallback={<div className="production-loading" role="status">正在打开音乐盒…</div>}><CollaborativeMusicBox {...scene}/></Suspense></ModelBoundary>
        <div className="production-camera-tools" aria-label="音乐盒视角与盒盖">
          <button className="production-lid-button" data-testid="production-toggle-lid" disabled={lidMoving||cameraMoving||stage==='performance'||!!(props.windingAt&&(props.winding??0)<4)} onClick={toggleLid}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d={lidOpen?'M3 10h14v6H3zM3 9V4h14v5':'M3 8h14v8H3zM3 8l2-2h10l2 2'}/></svg>{lidOpen?'合盖':'开盖'}
          </button>
          <details className="production-view-options" key={`${roomKey}-${stage}`}>
            <summary data-testid="production-view-options" aria-label="音乐盒显示选项">···</summary>
            <div className="production-options-menu">
              {mode==='observe'&&<button data-testid="production-reset-view" onClick={()=>setViewRevision(value=>value+1)}>回到默认视角</button>}
              <button data-testid="production-use-2d" onClick={()=>choose3D(false)}>使用二维备用视图</button>
            </div>
          </details>
        </div>
        {!lidOpen&&(stage==='gears'||stage==='melody')&&<span className="production-lid-hint" role="status">打开盒盖后继续装配</span>}
        {cameraMoving&&<span className="production-camera-hint" role="status">{stage==='gears'?'把机芯交到你们手中…':'稍稍换个角度…'}</span>}
        {!cameraMoving&&crankHint&&<span className="production-camera-hint production-crank-hint" data-testid="winding-gesture-hint" role="status">{crankHint}</span>}
      </div>;
  return <div className={`production-object production-${view}${is3D?' has-webgl':' has-svg'}`} data-view={view} data-render-mode={is3D?ready?'3d':'loading':'2d'} data-lid-open={lidOpen} data-lid-moving={lidMoving} data-camera-moving={cameraMoving} data-camera-mode={mode} role="group" aria-label={stage==='preview'?previewState==='unrepaired'?'音乐盒待修预览':'音乐盒外观预览':'三维音乐盒工作台'}>
    {is3D?<>
      <div ref={inlineScene} style={{display:'contents'}}/>
      {createPortal(viewport,sceneMount)}
      {expanded&&<div className="production-expanded-placeholder">音乐盒正在放大欣赏</div>}
      {!expanded&&(stage==='gears'||stage==='melody'||stage==='launch')&&<div className="operation-guide-inline">{operationGuide}</div>}
      {mobile&&(stage==='complete'||stage==='performance'||!!work||props.allowExpand)&&<button ref={expandButton} className="production-expand" data-testid="production-expand"
        onPointerDown={event=>{expandTouch.current=event.pointerType==='touch'&&event.isPrimary?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;}}
        onPointerMove={event=>{const start=expandTouch.current;if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)expandTouch.current=null;}}
        onPointerCancel={()=>{expandTouch.current=null;}}
        onPointerLeave={()=>{expandTouch.current=null;}}
        onPointerUp={event=>{
          const start=expandTouch.current;expandTouch.current=null;
          // Touch browsers may suppress the compatibility click after a canvas
          // gesture. Accept a stationary primary tap, never a scroll or drag.
          if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<=8)setExpanded(true);
        }}
        onClick={()=>setExpanded(true)}>放大欣赏</button>}
      {expanded&&createPortal(<dialog ref={expandedDialog} className="production-expanded-dialog" aria-label="放大欣赏音乐盒" onCancel={()=>setExpanded(false)}><div className="production-expanded-header"><span>拖动旋转 · 双指缩放</span><button autoFocus data-testid="production-close-expanded" onClick={()=>setExpanded(false)}>返回工作台</button></div><div ref={expandedScene} className="production-object production-box"/></dialog>,document.body)}
      {(stage==='gears'||stage==='melody')&&<div className="production-slot-bar">
        <span className="production-slot-caption">{role==='guide'?'指给伙伴':'选好零件，点槽位'}<small>↗</small></span>
        <div className="production-click-alternatives" role="group" aria-label="点击槽位的键盘替代">
          {stage==='gears'?slotIds.map((id,index)=><button key={id} data-slot={id} data-testid={`slot-${id}`} disabled={!(canGears||canPoint)} onClick={()=>scene.onSlot(id)} aria-label={`${slotLabels[index]}${installedGearMap[id]?'，已安装':''}${canPoint?'，指给伙伴':'，尝试放置选中齿轮'}`}><span className={`production-slot-symbol symbol-${index}`} aria-hidden="true"/>{slotLabels[index]}{installedGearMap[id]&&<span aria-hidden="true"> ✓</span>}</button>):[0,1,2,3].map(index=><button key={index} data-note-slot={index} data-testid={`note-slot-${index}`} disabled={!(canNotes||canPoint)} onClick={()=>scene.onNoteSlot(index)} aria-label={`旋律槽${index+1}，${notes[index]?{leaf:'叶',star:'星',moon:'月'}[notes[index]!]:'空'}`}>{index+1} · {notes[index]?{leaf:'叶',star:'星',moon:'月'}[notes[index]!]:'空'}</button>)}
        </div>
      </div>}
    </>:<><div className="production-fallback" data-testid="production-fallback" role="status"><span>{error?'3D 暂不可用，当前使用二维备用视图，工位进度仍在。':'当前使用二维备用视图。'}</span><button data-testid="production-retry-3d" onClick={()=>choose3D(true)}>{error?'重试 3D':'开启 3D'}</button></div><MusicBox {...props}/><div className="operation-guide-inline">{operationGuide}</div></>}
  </div>;
}
