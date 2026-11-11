import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import type { Action, ArrangementVersion, Identity, NoteSymbol, PublicWork, Result, Snapshot, Stamp, Timbre, Work } from '../shared/types';
import { GearIcon, NoteIcon, ShapeIcon, StampIcon } from './MusicBox';
import WorkshopMusicBox from './WorkshopMusicBox';
import { pickProductionDropTarget } from './three/picking';
import { RepairAudio } from './audio';
import { saveCard } from './saveCard';
import GearPreview from './GearPreview';
import CompletedWorkHeader from './CompletedWorkHeader';
import Museum from './Museum';
import FutureCommissions from './FutureCommissions';
import { ExhibitionConsent } from './ExhibitionConsent';
import PaperNotes from './PaperNotes';
import InvitationCard from './InvitationCard';
import roleGuide from './assets/role-guide-kit.png';
import roleMaker from './assets/role-maker-kit.png';
import paperTheatre from './assets/performance-paper-theatre.png';
import './experience-refine.css';
import { scoreFromNotes } from '../shared/scoreWorld';
import WorkWordEditor from './WorkWordEditor';
import { ArrangementBoard, ArrangementTools } from './Arrangement';
import { BEAT_MS, arrangementDuration } from '../shared/arrangement';
import { useWindingProgress } from './useWindingProgress';
import brandEmblem from './assets/hepai-emblem-v2.png';
import { IS_STATIC_DEMO } from './runtimeMode';

const noteNames:Record<NoteSymbol,string>={leaf:'叶',star:'星',moon:'月'};
const sizes={small:'小',medium:'中',large:'大'};
const stampNames:Record<Stamp,string>={sprout:'嫩芽',crescent:'弯月',spark:'微星',wave:'水纹'};
const slotNames:Record<string,string>={'slot-1':'三角槽','slot-2':'圆形槽','slot-3':'方形槽'};
const stageNames={waiting:'等你们落座',gears:'让机芯转起来',swap:'交换手里的工具',melody:'接回一段旋律',arrange:'调成我们的旋律',launch:'一起为旋律上弦',performance:'听，修好了',complete:'带走这一刻',ended:'工位已收好'};
const timbres:Record<Timbre,string>={bell:'玻璃铃',wood:'木琴',soft:'柔和钢片'};
const SESSION_KEY=IS_STATIC_DEMO?'hepai-static-session-v1':'hepai-session-v1', WORKS_KEY=IS_STATIC_DEMO?'hepai-static-works-v1':'hepai-works-v1';
type Session={code:string;token:string};
type StaticTransport={request:(event:string,input:unknown)=>Promise<Result>;dispose:()=>void};
const EXHIBIT_MANAGEMENT_KEY='hepai-exhibit-management-v1';
type ExhibitReceipt={shareId:string;token:string};
function exhibitReceipts():Record<string,ExhibitReceipt>{try{return JSON.parse(sessionStorage.getItem(EXHIBIT_MANAGEMENT_KEY)||'{}');}catch{return {};}}
function rememberExhibit(id:string,receipt:ExhibitReceipt|null){try{const entries=exhibitReceipts();if(receipt)entries[id]=receipt;else delete entries[id];sessionStorage.setItem(EXHIBIT_MANAGEMENT_KEY,JSON.stringify(entries));}catch{/* The current room can still withdraw its own consent. */}}
type Config={shareBaseUrl:string|null;lanAddresses:string[];port:number};
type Drag={kind:'gear'|'note';id:string;x:number;y:number;startX:number;startY:number;moved:boolean};
function legacyScore(notes:readonly(NoteSymbol|null)[],timbre:Timbre){const score=scoreFromNotes(notes);score.tracks.A.timbre=timbre;return score;}
function readSession():Session|null{try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function storedWorks():Work[]{try{return JSON.parse(localStorage.getItem(WORKS_KEY)||'[]');}catch{return [];}}
function Brand({onClick}:{onClick?:()=>void}){return <button className="brand" onClick={onClick} aria-label="合拍修理铺首页"><img className="brand-emblem" src={brandEmblem} alt="" aria-hidden="true" width="48" height="48"/><span>合拍修理铺<small>HEPAI REPAIR</small></span></button>;}
function Arrow(){return <span aria-hidden="true">↗</span>;}
function App(){
  const initialParams=useRef(new URLSearchParams(location.search));
  const [snap,setSnap]=useState<Snapshot|null>(null), snapRef=useRef<Snapshot|null>(null);
  const windingActive=!!snap?.windingAt&&(snap.winding??0)<4;
  const windingRequest=useRef(false);
  const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[takeover,setTakeover]=useState('');
  const [restoring,setRestoring]=useState(false),[recoveryWait,setRecoveryWait]=useState(false),[sessionUnavailable,setSessionUnavailable]=useState('');
  const [connectionLostAt,setConnectionLostAt]=useState<number>();
  const windingPausedAt=snap?.windingPausedAt??(!connected?connectionLostAt:undefined);
  const windingProgress=useWindingProgress(snap?.winding??0,snap?.windingAt,snap?.windingDurationMs,windingPausedAt);
  const [joinOpen,setJoinOpen]=useState(!IS_STATIC_DEMO&&!!initialParams.current.get('room')),[joinCode,setJoinCode]=useState(initialParams.current.get('room')||'');
  const [publicWork,setPublicWork]=useState<PublicWork|null>(null),[publicError,setPublicError]=useState('');
  const [museum,setMuseum]=useState(initialParams.current.has('museum'));
  const museumOrigin=useRef(false);
  const [playbackClock,setPlaybackClock]=useState<{startedAt:number;beatMs:number;beats:number;loops:number}|null>(null);
  const [archive,setArchive]=useState(false),[localWork,setLocalWork]=useState<Work|null>(null);
  const [config,setConfig]=useState<Config|null>(null),[inviteOrigin,setInviteOrigin]=useState(location.origin),[qr,setQr]=useState('');
  const [selectedGear,setSelectedGear]=useState<string|null>(null),[selectedNote,setSelectedNote]=useState<NoteSymbol|null>(null),[swapFrom,setSwapFrom]=useState<number|null>(null);
  const [drag,setDrag]=useState<Drag|null>(null),dragRef=useRef<Drag|null>(null);
  const [playbackVersion,setPlaybackVersion]=useState<'current'|'previous'>('current'),[audibleVersion,setAudibleVersion]=useState<ArrangementVersion|null>(null);
  const lastArrangementAudition=useRef('');
  const [muted,setMuted]=useState(true),[volume,setVolume]=useState(.24),[soundOpen,setSoundOpen]=useState(false),[details,setDetails]=useState(false);
  const [playing,setPlaying]=useState(false),[highlight,setHighlight]=useState<number|null>(null);
  const [leaveOpen,setLeaveOpen]=useState(false),[ended,setEnded]=useState(false);
  const [feedbackOpen,setFeedbackOpen]=useState(false),[feedbackDone,setFeedbackDone]=useState(false),[feedbackConsent,setFeedbackConsent]=useState(false);
  const [comfortable,setComfortable]=useState(''),[again,setAgain]=useState(''),[comment,setComment]=useState('');
  const socketRef=useRef<Socket|null>(null),session=useRef<Session|null>(readSession());
  const staticTransport=useRef<StaticTransport|null>(null);
  const audio=useRef(new RepairAudio()), playbackTimers=useRef<ReturnType<typeof setTimeout>[]>([]), lastPerformance=useRef(''),lastTrial=useRef(0);
  const notify=useCallback((text:string)=>setNotice(text),[]);
  const receive=useCallback((next:Snapshot)=>{
    if(snapRef.current?.code===next.code && next.version<snapRef.current.version)return;
    const before=snapRef.current;
    if(before?.stage==='gears'&&Object.keys(next.installed).length>Object.keys(before.installed).length)audio.current.click();
    snapRef.current=next;setSnap(next);
  },[]);
  const recoveryFailed=useCallback((message:string)=>{
    session.current=null;sessionStorage.removeItem(SESSION_KEY);
    snapRef.current=null;setSnap(null);setRestoring(false);setRecoveryWait(false);setBusy(false);
    setLeaveOpen(false);setJoinOpen(false);setArchive(false);setLocalWork(null);
    setSelectedGear(null);setSelectedNote(null);setSwapFrom(null);dragRef.current=null;setDrag(null);
    stopPlayback();setNotice('');setSessionUnavailable(message);
  },[]);
  const resumeRoom=useCallback((socket:Socket)=>{
    const requested=session.current;if(!requested)return;
    setRestoring(true);setRecoveryWait(false);
    socket.timeout(6500).emit('resume',requested,(error:Error|null,result:Result)=>{
      // Ignore a late answer for a room the person has already left or replaced.
      if(session.current?.code!==requested.code||session.current?.token!==requested.token)return;
      if(error){setRecoveryWait(true);notify('工位仍在重连，请检查网络后再试。');return;}
      setRestoring(false);setRecoveryWait(false);
      if(!result.ok)recoveryFailed(result.error||'这张工位已无法恢复，请回到门口重新开始。');
      else if(result.snapshot)receive(result.snapshot);
    });
  },[notify,receive,recoveryFailed]);
  useEffect(()=>{
    if(IS_STATIC_DEMO){
      let alive=true;let current:StaticTransport|null=null;
      void import('./staticDemo').then(async({createStaticDemoTransport})=>{
        if(!alive)return;
        current=createStaticDemoTransport(receive);staticTransport.current=current;setConnected(true);
        if(initialParams.current.has('work')){setPublicError('当前公开版本提供本机单人体验，暂未开放在线作品分享。');return;}
        if(session.current&&!initialParams.current.has('museum')){
          setRestoring(true);const result=await current.request('resume',session.current);
          if(!alive)return;
          setRestoring(false);
          if(result.ok&&result.snapshot)receive(result.snapshot);
          else recoveryFailed(result.error||'这次本机演示已收起，可以重新开始。');
        }
      }).catch(()=>{if(alive){setConnected(false);notify('单人体验暂未载入，请刷新页面重试。');}});
      return()=>{alive=false;current?.dispose();if(staticTransport.current===current)staticTransport.current=null;};
    }
    const s=io({autoConnect:false,reconnection:true});socketRef.current=s;
    s.on('connect',()=>{setConnected(true);if(session.current&&(snapRef.current||(!new URLSearchParams(location.search).has('work')&&!new URLSearchParams(location.search).has('museum'))))resumeRoom(s);});
    s.on('disconnect',()=>{setConnected(false);setRestoring(false);setRecoveryWait(false);setConnectionLostAt(Date.now());});s.on('snapshot',receive);s.on('storageError',(r:{error:string})=>notify(r.error));
    s.on('sessionError',(r:{error:string})=>{setTakeover(r.error);notify(r.error);session.current=null;sessionStorage.removeItem(SESSION_KEY);snapRef.current=null;setSnap(null);});
    s.connect();
    fetch('/api/config').then(r=>r.json()).then((c:Config)=>{setConfig(c);if(c.shareBaseUrl)setInviteOrigin(c.shareBaseUrl.replace(/\/$/,''));}).catch(()=>{});
    const share=initialParams.current.get('work');if(share)fetch(`/api/works/${encodeURIComponent(share)}`).then(async r=>{if(!r.ok)throw new Error('这份作品未开放分享，或链接已失效。');return r.json();}).then(w=>setPublicWork(w.work||w)).catch(e=>setPublicError(e.message));
    return()=>{s.removeAllListeners();s.disconnect();socketRef.current=null;};
  },[notify,receive,resumeRoom,recoveryFailed]);
  useEffect(()=>{const handle=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(handle);},[notice]);
  useEffect(()=>{audio.current.volume=volume;audio.current.muted=muted;if(muted)audio.current.stop();},[volume,muted]);
  useEffect(()=>()=>{audio.current.dispose();for(const t of playbackTimers.current)clearTimeout(t);},[]);
  useEffect(()=>{setSelectedGear(null);setSelectedNote(null);setSwapFrom(null);setDetails(false);setNotice('');if(snap?.stage!=='performance')stopPlayback();},[snap?.stage,snap?.self]);
  useEffect(()=>{const panel=document.querySelector<HTMLElement>('.tool-panel');if(panel)panel.scrollTop=0;},[snap?.stage]);
  useEffect(()=>{if(!snap?.work)return;try{const list=storedWorks().filter(w=>w.id!==snap.work!.id);localStorage.setItem(WORKS_KEY,JSON.stringify([snap.work,...list].slice(0,12)));}catch{notify('浏览器留存空间不足，作品仍已保存在此工位，请下载图片。');}},[snap?.work,notify]);
  useEffect(()=>{const owner=snap?.members.find(member=>member.id===snap.self);if(snap?.mode!=='real'||!snap.work||!owner||session.current?.code!==snap.code)return;if(snap.work.shareId&&owner.exhibitConsent)rememberExhibit(snap.work.id,{shareId:snap.work.shareId,token:session.current.token});else rememberExhibit(snap.work.id,null);},[snap?.work,snap?.members,snap?.self]);
  const inviteLink=snap?`${inviteOrigin}/?room=${encodeURIComponent(snap.code)}`:'';
  const isLoopback=(()=>{try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(inviteOrigin).hostname);}catch{return true;}})();
  useEffect(()=>{let alive=true;if(inviteLink&&!isLoopback)QRCode.toDataURL(inviteLink,{margin:2,width:180,color:{dark:'#243b3d',light:'#f0e8d5'}}).then(url=>{if(alive)setQr(url);});else setQr('');return()=>{alive=false;};},[inviteLink,isLoopback]);
  async function rpc(event:string,input:unknown):Promise<Result>{
    if(IS_STATIC_DEMO){
      const transport=staticTransport.current;if(!transport){notify('正在摆好单人工作台，请稍后再试。');return {ok:false};}
      setBusy(true);
      try{const result=await transport.request(event,input);if(!result.ok)notify(result.error||'这一步暂时无法进行');if(result.snapshot)receive(result.snapshot);return result;}
      catch{notify('这一步暂时未能完成，请重试。');return {ok:false};}
      finally{setBusy(false);}
    }
    if(!socketRef.current?.connected){notify('正在连接修理铺，请稍后再试。');return {ok:false};}
    setBusy(true);
    return new Promise(resolve=>socketRef.current!.timeout(6500).emit(event,input,(err:Error|null,r:Result)=>{setBusy(false);if(err){notify('未收到确认。正在获取最新工位，请检查连接后再试。');if(session.current&&socketRef.current)resumeRoom(socketRef.current);resolve({ok:false});return;}if(!r.ok)notify(r.error||'这一步暂时无法进行');if(r.snapshot)receive(r.snapshot);resolve(r);}));
  }
  async function enter(mode:'real'|'demo',join=false,relayId?:string){
    if(IS_STATIC_DEMO&&(mode!=='demo'||join)){notify('当前为公开单人体验，双人联机暂未开放。');return;}
    if(snapRef.current){if(snapRef.current.stage==='complete'){await leave();if(snapRef.current)return;}else{notify('先回到当前工位，结束这次体验后再开新工位。');return;}}
    const r=await rpc(join?'join':'create',join?{code:joinCode.trim().toUpperCase()}:{mode,...(relayId?{relayId}:{})});
    if(r.ok&&r.code&&r.token){session.current={code:r.code,token:r.token};sessionStorage.setItem(SESSION_KEY,JSON.stringify(session.current));setSessionUnavailable('');setRestoring(false);setPublicWork(null);setLocalWork(null);setMuseum(false);museumOrigin.current=false;setArchive(false);setEnded(false);setFeedbackDone(false);setJoinOpen(false);history.replaceState(null,'',location.pathname);if(r.snapshot)receive(r.snapshot);}
  }
  const send=useCallback(async(action:Action):Promise<Result>=>{
    const s=snapRef.current;if(!s)return {ok:false};
    const cmd={id:Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join(''),code:s.code,stage:s.stage,version:s.version,action};
    return rpc('command',cmd);
  // rpc uses current refs; no closure state is needed.
  },[receive,notify,resumeRoom]);
  async function copy(text:string){try{await navigator.clipboard.writeText(text);notify('已复制，可以发给同一局域网的伙伴。');}catch{const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();notify(ok?'已复制邀请链接':'浏览器未允许复制，请长按链接手动复制。');}}
  async function sound(){if(!muted){setMuted(true);return;}try{await audio.current.enable();setMuted(false);audio.current.tone('leaf');}catch{notify('点击开启声音；若浏览器仍限制，静音也能完成修复。');}}
  function stopPlayback(){for(const t of playbackTimers.current)clearTimeout(t);playbackTimers.current=[];audio.current.stop();setPlaying(false);setHighlight(null);setAudibleVersion(null);setPlaybackClock(null);}
  function play(notes:NoteSymbol[],timbre:Timbre,start=Date.now(),duration=8500){
    stopPlayback();setAudibleVersion(legacyScore(notes,timbre));setPlaybackClock({startedAt:start,beatMs:620,beats:Math.min(12,Math.floor(duration/620)+1),loops:3});setPlaying(true);
    const elapsed=Date.now()-start;
    for(let i=0;i<12;i++){let at=i*620-elapsed;if(at<0){if(i===0&&elapsed<250)at=0;else continue;}if(at>duration)break;const t=setTimeout(()=>{setHighlight(i%notes.length);audio.current.tone(notes[i%notes.length],timbre);},at);playbackTimers.current.push(t);}
    playbackTimers.current.push(setTimeout(()=>{setPlaying(false);setHighlight(null);setAudibleVersion(null);setPlaybackClock(null);},Math.max(0,duration-elapsed)));
  }
  function playComposition(version:ArrangementVersion,start=Date.now(),loops=2,duration=arrangementDuration(version,loops),which:'current'|'previous'='current'){
    stopPlayback();setAudibleVersion(version);setPlaybackVersion(which);setPlaybackClock({startedAt:start,beatMs:BEAT_MS[version.tempo],beats:4*loops,loops});setPlaying(true);
    const elapsed=Date.now()-start,beat=BEAT_MS[version.tempo];
    for(let i=0;i<4*loops;i++){
      let at=i*beat-elapsed;if(at<0){if(i===0&&elapsed<250)at=0;else continue;}if(at>duration)continue;
      playbackTimers.current.push(setTimeout(()=>{setHighlight(i%4);for(const id of ['A','B'] as const){const track=version.tracks[id],symbol=track.notes[i%4];if(symbol)audio.current.tone(symbol,track.timbre,0,id==='A'?.78:.56,id==='A'?1:.5,id==='A'?.9:.6);}},at));
    }
    playbackTimers.current.push(setTimeout(()=>{setPlaying(false);setHighlight(null);setAudibleVersion(null);setPlaybackClock(null);},Math.max(0,duration-elapsed)));
  }
  async function trialTogether(){
    if(muted){try{await audio.current.enable();setMuted(false);}catch{notify('本机暂时无法开启声音。');}}
    await send({type:'mark',target:'melody',text:'试奏这段'});
  }
  function playWork(work:Work){if(work.arrangement)playComposition(work.arrangement);else play(work.notes,work.timbre);}
  function editArrangement(action:Action){stopPlayback();return send(action);}
  async function listenTogether(version:'current'|'previous'){
    // A click is a user gesture: unlock audio here so the inviting player hears this take.
    // The partner can click either listen button to unlock their own browser and replay it for both.
    if(muted){try{await audio.current.enable();setMuted(false);}catch{notify(IS_STATIC_DEMO?'本机暂时无法开启声音，静音仍能观察节拍。':'本机暂时无法开启声音；伙伴仍可收到试听。');}}
    await send({type:'auditionArrangement',version});
  }
  useEffect(()=>{
    if(snap?.stage==='performance'&&snap.performanceAt){
      const key=`${snap.code}:${snap.performanceAt}`;
      if(lastPerformance.current!==key){lastPerformance.current=key;if(snap.arrangement)playComposition(snap.arrangement.current,snap.performanceAt,2,snap.performanceDurationMs??arrangementDuration(snap.arrangement.current));else play(snap.notes.filter((n):n is NoteSymbol=>!!n),snap.timbre,snap.performanceAt,snap.performanceDurationMs??8500);}
    }
    const trial=snap?.marks.findLast(m=>m.text==='试奏这段');
    if(trial&&trial.at>lastTrial.current&&Date.now()-trial.at<4000){lastTrial.current=trial.at;if(snap?.stage==='melody'){const notes=snap.notes.filter((n):n is NoteSymbol=>!!n);if(notes.length)play(notes,snap.timbre,trial.at,Math.min(3000,notes.length*650));}}
  },[snap?.stage,snap?.performanceAt,snap?.marks]);
  useEffect(()=>{if(snap?.stage==='arrange')stopPlayback();},[snap?.arrangement?.revision]);
  useEffect(()=>{
    const audition=snap?.arrangement?.audition;if(!snap||snap.stage!=='arrange'||!audition||Date.now()-audition.at>5000)return;
    const key=`${snap.code}:${audition.at}:${audition.by}`;if(lastArrangementAudition.current===key)return;
    const version=audition.version==='previous'?snap.arrangement?.previous:snap.arrangement?.current;
    if(version){lastArrangementAudition.current=key;playComposition(version,audition.at,1,arrangementDuration(version,1),audition.version);}
  },[snap?.arrangement?.audition?.at]);

  async function leave(){const r=await send({type:'leave'});if(!r.ok)return;stopPlayback();session.current=null;sessionStorage.removeItem(SESSION_KEY);setSnap(null);snapRef.current=null;setLeaveOpen(false);setEnded(true);history.replaceState(null,'',location.pathname);}
  function home(){if(snap){setLeaveOpen(true);return;}setSessionUnavailable('');setTakeover('');setJoinOpen(false);setJoinCode('');setPublicWork(null);setLocalWork(null);setPublicError('');setArchive(false);setMuseum(false);museumOrigin.current=false;setEnded(false);stopPlayback();history.replaceState(null,'',location.pathname);}
  async function withdrawExhibit(work:Work){const receipt=exhibitReceipts()[work.id];if(!receipt)return;setBusy(true);try{const response=await fetch(`/api/exhibits/${encodeURIComponent(receipt.shareId)}/withdraw`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:receipt.token})});if(response.status===404||response.status===410){rememberExhibit(work.id,null);notify('展品已收起或链接已失效，撤展凭条也已收起。');return;}if(!response.ok){let message='暂时未能撤展，请稍后重试。';try{const body=await response.json();if(typeof body.error==='string')message=body.error;}catch{}throw new Error(message);}rememberExhibit(work.id,null);notify('已撤下公开展品，原来的只读分享链接仍然保留。');}catch(error){notify(error instanceof Error?error.message:'撤展失败，请稍后重试。');}finally{setBusy(false);}}
  function visitMuseum(){stopPlayback();setMuseum(true);setPublicWork(null);setLocalWork(null);history.replaceState(null,'',`${location.pathname}?museum=1`);}
  function openExhibit(work:PublicWork){stopPlayback();museumOrigin.current=true;setPublicWork(work);setLocalWork(null);setMuseum(false);history.replaceState(null,'',`${location.pathname}?work=${encodeURIComponent(work.shareId)}`);}
  function beginDrag(e:React.PointerEvent,kind:'gear'|'note',id:string){if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const d={kind,id,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};dragRef.current=d;setDrag(d);if(kind==='gear')setSelectedGear(id);else setSelectedNote(id as NoteSymbol);}
  useEffect(()=>{
    if(!drag)return;
    const move=(e:PointerEvent)=>{const d=dragRef.current;if(!d)return;const next={...d,x:e.clientX,y:e.clientY,moved:d.moved||Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6};dragRef.current=next;setDrag(next);};
    const finish=(e:PointerEvent)=>{const d=dragRef.current;dragRef.current=null;setDrag(null);if(!d?.moved)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(d.kind==='gear'?'[data-slot]':'[data-note-slot]');if(target){if(d.kind==='gear')void send({type:'placeGear',gearId:d.id,slotId:target.getAttribute('data-slot')!});else void send({type:'placeNote',symbol:d.id as NoteSymbol,index:Number(target.getAttribute('data-note-slot'))});}else{const hit=pickProductionDropTarget(e.clientX,e.clientY);if(hit?.kind==='gear'&&d.kind==='gear')void send({type:'placeGear',gearId:d.id,slotId:hit.slotId});else if(hit?.kind==='note'&&d.kind==='note')void send({type:'placeNote',symbol:d.id as NoteSymbol,index:hit.index});else notify('零件回到托盘。也可以先点零件，再点槽位。');}};
    const cancel=()=>{dragRef.current=null;setDrag(null);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);};
  },[!!drag,send,notify]);
  const me=snap?.members.find(m=>m.id===snap.self),partner=snap?.members.find(m=>m.id!==snap.self);
  const canOperate=!!snap&&snap.role==='maker'&&!snap.paused&&!busy&&!restoring&&connected;
  const blocked=busy||restoring||!connected||!!snap?.paused;
  async function onNoteSlot(index:number){if(!snap)return;if(snap.role==='guide'){void send({type:'mark',target:`note-${index}`,text:'这里'});return;}if(!canOperate)return;if(selectedNote){await send({type:'placeNote',index,symbol:selectedNote});setSelectedNote(null);setSwapFrom(null);return;}if(swapFrom===null){setSwapFrom(index);notify(`已选第 ${index+1} 个槽，再点另一个槽可换位。`);}else{const old=snap.notes[swapFrom],next=snap.notes[index];const first=await send({type:'placeNote',index:swapFrom,symbol:next});if(first.ok)await send({type:'placeNote',index,symbol:old});setSwapFrom(null);}}
  const viewWork=publicWork||localWork;
  const step=snap?.stage==='waiting'?0:snap?.stage==='gears'?1:snap?.stage==='swap'||snap?.stage==='melody'?2:snap?.stage==='arrange'?3:snap?.stage==='launch'||snap?.stage==='performance'?4:5;
  const score=playing&&audibleVersion?audibleVersion:viewWork?.arrangement||snap?.work?.arrangement||snap?.arrangement?.current||((viewWork||snap)?legacyScore(viewWork?.notes||snap?.notes||[],viewWork?.timbre||snap?.timbre||'bell'):undefined);
  function box(preview=false){return <WorkshopMusicBox score={score} playbackStartedAt={playbackClock?.startedAt} playbackBeatMs={playbackClock?.beatMs} playbackBeats={playbackClock?.beats} playbackLoops={playbackClock?.loops} role={snap?.role} cameraPreparing={preview&&snap?.stage==='waiting'&&!viewWork} disabled={blocked} roomKey={viewWork?`work:${viewWork.id}`:snap?.code||'home'} work={viewWork||snap?.work} onCancelSelection={()=>{setSelectedGear(null);setSelectedNote(null);setSwapFrom(null);}} onRequestStop={stopPlayback} view={preview||!snap||['arrange','performance','complete','ended'].includes(snap.stage)?'box':snap.stage==='launch'?'winding':'mechanism'} winding={snap?.winding??0} windingAt={snap?.windingAt} windingDurationMs={snap?.windingDurationMs} windingPausedAt={windingPausedAt} guideReady={!!snap?.members.find(m=>m.id==='B')?.launchReady} canWind={snap?.stage==='launch'&&snap.role==='maker'&&!blocked&&!windingActive&&(snap.winding??0)<4} canArm={snap?.stage==='launch'&&snap.role==='guide'&&!blocked&&!me?.launchReady} onWind={wind} onArm={()=>send({type:'launchReady'})} stamps={viewWork?.stamps||snap?.work?.stamps} workTitle={viewWork?.title||snap?.work?.title} previewState={preview && !viewWork ? 'unrepaired' : 'restored'} stage={preview?'preview':snap?.stage||'preview'} installed={snap?.installed} gears={snap?.gears} notes={viewWork?.notes||snap?.work?.notes||((snap?.stage==='arrange'||snap?.stage==='launch'||snap?.stage==='performance')&&snap.arrangement?snap.arrangement.current.tracks.A.notes:snap?.notes)} finish={viewWork?.finish||snap?.finish} selectedGear={selectedGear} selectedNote={selectedNote} canOperate={canOperate} marks={snap?.marks} playing={playing} highlightNote={highlight} onSlot={slotId=>{if(snap?.role==='guide')void send({type:'mark',target:slotId,text:'这里'});else if(canOperate&&selectedGear)void send({type:'placeGear',gearId:selectedGear,slotId});else if(canOperate)notify('先从零件盘挑一枚齿轮。');}} onNoteSlot={onNoteSlot} onPoint={target=>{if(snap&&!blocked)void send({type:'mark',target,text:'这里'});}}/>;}
  function soundControl(){return <div className="sound-control"><button className="icon-button" onClick={sound} aria-label={muted?'点击开启声音':'静音'} title={muted?'点击开启声音':'静音'}>{muted?<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/></svg>:<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 8q6 4 0 8M17 4q12 8 0 16"/></svg>}</button><button className="subtle sound-label" onClick={()=>setSoundOpen(!soundOpen)}>{muted?'声音关闭':'声音已开启'}<span aria-hidden="true">⌄</span></button>{soundOpen&&<div className="sound-popover"><label>音量 <input aria-label="音量" type="range" min="0" max="0.6" step="0.02" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><p>{IS_STATIC_DEMO?'声音在当前设备播放，静音也能完成体验。':'面对面时，开一台设备的声音就好。静音也能完成。'}</p></div>}</div>;}
  function connection(){return <span className={`connection ${partner?.connected?'online':''}`}><i/>{snap?.mode==='demo'?'单人演示':!connected?'正在重连':partner?.left?'伙伴已离开':partner?.connected?'伙伴在工位':'等待伙伴连接'}</span>;}
  function helper(){return <div className="helper-actions"><button className="subtle" disabled={blocked} onClick={()=>send({type:'hint'})}>需要一点提示{snap!.hintCount>0?` · ${snap!.hintCount}`:''}</button><button className="subtle" onClick={()=>setDetails(!details)}>{details?'收起说明':'操作说明'} <span aria-hidden="true">⌄</span></button></div>;}
  const previewIndex = snap?.stage === 'gears' ? snap.marks.findLastIndex(mark => !!mark.preview) : -1;
  const previewMark = previewIndex >= 0 ? snap!.marks[previewIndex] : undefined;
  const previewGear = snap?.gears.find(gear => gear.id === previewMark?.preview);
  const pointedMark=previewMark?snap!.marks.slice(previewIndex+1).findLast(mark=>mark.by!==previewMark.by&&mark.text==='这里'&&Object.hasOwn(slotNames,mark.target)):undefined;
  const pointedSlot=pointedMark?{id:pointedMark.target,label:slotNames[pointedMark.target]}:undefined;
  const placement=snap?.stage==='gears'&&snap.placementReply&&snap.placementReply.previewAt===previewMark?.at?snap.placementReply:undefined;
  const previewReply = previewMark && previewGear ? snap!.marks.slice(previewIndex + 1).findLast(mark => mark.by !== previewMark.by && mark.target === previewGear.id && ['换一块', '可以试试'].includes(mark.text)) : undefined;
  function renderGearPreview() {
    if (!snap || !previewMark || !previewGear) return null;
    return <GearPreview gear={previewGear} preview={previewMark} response={previewReply} self={snap.self} disabled={blocked} installed={Object.values(snap.installed).includes(previewGear.id)} selectionChanged={!!selectedGear && selectedGear !== previewGear.id} pointedSlot={pointedSlot} confirmed={placement} onConfirm={()=>pointedSlot&&send({type:'confirmPlacement',gearId:previewGear.id,slotId:pointedSlot.id,previewAt:previewMark.at})} onFeedback={text => send({ type:'mark', target:previewGear.id, text })}/>;
  }
  function feedbackButtons() {
    if (snap?.stage === 'gears') return renderGearPreview() || <div className="partner-comms"><span className="eyebrow">把线索递过去</span><p className="preview-await">点图纸可以指位置。伙伴问“这块吗？”时，实物近景会出现在这里。</p></div>;
    return <div className="partner-comms"><span className="eyebrow">给伙伴一个回应</span><div className="phrase-row">{['这里','换一块','可以试试'].map(text=><button key={text} disabled={blocked} onClick={()=>send({type:'mark',target:`note-${swapFrom??0}`,text})}>{text}</button>)}</div></div>;
  }
  async function wind(){
    const current=snapRef.current;
    if(windingRequest.current||current?.stage!=='launch'||current.windingAt||(current.winding??0)>=4)return;
    windingRequest.current=true;
    try{const result=await send({type:'wind'});if(result.ok)audio.current.click();}
    finally{windingRequest.current=false;}
  }
  function workSoundSummary(work:Work){return work.arrangement?`共同改编 · ${work.arrangement.tempo==='slow'?'慢一点':'轻快一点'} · A ${timbres[work.arrangement.tracks.A.timbre]} / B ${timbres[work.arrangement.tracks.B.timbre]}`:`${work.melody==='bright'?'轻快':'舒缓'} · ${timbres[work.timbre]}`;}
  const arrangementProps=snap?.arrangement?{arrangement:snap.arrangement,self:snap.self,stamps:snap.stamps,disabled:blocked,playing,playingStep:highlight,playbackVersion,audibleVersion,soundOff:muted,onStep:(index:number,symbol:NoteSymbol|null)=>editArrangement({type:'setTrackStep',index,symbol}),onPreset:(preset:import('../shared/types').ArrangementPreset)=>editArrangement({type:'setTrackPreset',preset}),onTempo:(tempo:import('../shared/types').Tempo)=>editArrangement({type:'setTempo',tempo}),onListen:listenTogether,onUndo:()=>editArrangement({type:'restoreOwnTrack'}),onApprove:()=>send({type:'approveTrack'})}:undefined;
  function roleName(){return snap?.stage==='arrange'?(snap.self==='A'?'主旋律':'伴奏'):snap?.role==='guide'?'图纸师':'装配师';}

  return <div className={`app ${snap&&!museum&&!viewWork?'in-room':''} ${museum?'museum-view':''}`}>
    <header className="site-header"><Brand onClick={home}/>{snap&&!museum&&!viewWork?<div className="room-header"><span className="stage-title"><small>{step===0?'准备':`0${step} / 05`}</small>{stageNames[snap.stage]}</span><span className="role-badge">{snap.self} · {roleName()}</span>{connection()}</div>:<span className="header-note">夜色里的小型手作修理铺<span className="tiny-line"/></span>}<div className="header-actions">{soundControl()}{snap&&!museum&&!viewWork&&<button className="subtle exit-button" onClick={()=>setLeaveOpen(true)}>离开工位 <span aria-hidden="true">↗</span></button>}</div></header>

    {takeover?<main className="empty-view"><span className="section-kicker">身份已由另一页接过</span><h1>请在新页面继续修理。</h1><p>{takeover}</p><button className="secondary" onClick={()=>{setTakeover('');socketRef.current?.connect();home();}}>以新的访客回到门口</button></main>:museum?<Museum createDisabled={busy||restoring||!connected} onBack={()=>{setMuseum(false);history.replaceState(null,'',location.pathname);}} onCreate={()=>enter(IS_STATIC_DEMO?'demo':'real')} onSelect={openExhibit} onPersonalWorks={()=>setArchive(true)}/>:viewWork?<main className="shared-view"><div className="section-kicker">{publicWork?'一份共同完成的旋律':'留在你这里的作品'} / NO. 001</div><h1>{viewWork.title}</h1><p>{new Date(viewWork.completedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})} · {workSoundSummary(viewWork)}{viewWork.demo?' · 单人演示':''}</p><div className="shared-box">{box(true)}</div><p className="observe-instruction">拖动音乐盒可环绕欣赏，滚轮或双指缩放；右上角可开合盒盖、恢复视角。</p><div className="completion-actions"><button className="primary" data-testid="replay" onClick={()=>playWork(viewWork)}>{playing?'从头再听':'重播这段旋律'} <span>♫</span></button><button className="secondary" onClick={()=>saveCard(viewWork).catch(e=>notify(e.message))}>保存作品图片</button></div>{publicWork&&<div className="relay-invite"><p>喜欢这份风格？把它接到下一张工作台。</p><button className="text-link" onClick={()=>enter('real',false,publicWork.shareId)}>沿用这份风格，和朋友修一只 <Arrow/></button><small>新建工位，继承外观与音色偏好，从头一起修。</small></div>}<button className="subtle" onClick={museumOrigin.current?visitMuseum:home}>{museumOrigin.current?'回到小展柜':'今天就到这里'}</button></main>
     :sessionUnavailable?<main className="empty-view session-unavailable" data-testid="session-unavailable"><span className="section-kicker">这张工位已收起</span><h1>回到门口，再一起开始。</h1><p>{sessionUnavailable}<br/>已留存在这台浏览器里的作品仍然保留。</p><button className="primary" data-testid="session-unavailable-home" onClick={home}>返回门口 <Arrow/></button><button className="subtle" onClick={()=>{home();setArchive(true);}}>看看留存的作品</button></main>
    :publicError?<main className="empty-view"><span className="section-kicker">这份旋律暂时收起来了</span><h1>作品还没有开放分享</h1><p>{publicError}</p><button className="primary" onClick={home}>回到修理铺</button></main>
    :ended?<main className="empty-view"><span className="section-kicker">CLOSED FOR TODAY</span><h1>今天就到这里。</h1><p>谢谢你在这张桌前停留。想再来时，修理铺还在。</p><button className="secondary" onClick={home}>回到门口 <Arrow/></button><button className="subtle" onClick={()=>{setEnded(false);setArchive(true);}}>看看留存的作品</button></main>
    :!snap?<>
      <main className="home-hero"><div className="hero-copy"><div className="section-kicker"><span className="small-star">✳</span> 给初次见面的我们</div><h1>把陌生，<br/>调成<span>合拍。</span></h1><p className="hero-tagline">不用急着找话题，<br className="mobile-break"/>先一起修好一段旋律。</p><p className="hero-how">一人看图纸，一人装零件，中途交换，<span>一起让音乐盒重新响起来。</span></p><div className="home-actions"><button className="primary" data-testid={IS_STATIC_DEMO?"start-static-demo":undefined} disabled={busy||restoring||!connected} onClick={()=>enter(IS_STATIC_DEMO?'demo':'real')}>{IS_STATIC_DEMO?'开始单人体验':'开一间工位'} <Arrow/></button>{!IS_STATIC_DEMO&&<button className="secondary" onClick={()=>setJoinOpen(true)}>加入工位 <span aria-hidden="true">＋</span></button>}</div>{IS_STATIC_DEMO?<p className="demo-link">公开单人体验 <span>本机保存</span></p>:<button className="demo-link" disabled={busy||restoring||!connected} onClick={()=>enter('demo')}>先一个人试试 <span>单人演示</span><Arrow/></button>}<div className="hero-footnote"><span className="two-faces" aria-hidden="true"><i>A</i><i>B</i></span><span>{IS_STATIC_DEMO?<>切换 A / B，体验两种分工。<br/>修复、改编，再把旋律带走。</>:<>两个人，一张桌子。<br/>让共同的小事，成为开口的开始。</>}</span></div></div><div className="hero-scene">{box(true)}<div className="repair-ticket"><small>REPAIR TICKET</small><span>{IS_STATIC_DEMO?'待修 · 等你来试试':'待修 · 等一位同伴'}</span><i>一段旋律的时间</i></div></div></main><FutureCommissions/><footer className="home-footer"><span>小小修理，慢慢靠近。</span><span>{IS_STATIC_DEMO?'单人体验版 · 作品保存在本机':'同一局域网 · 双人协作原型'}</span><button data-testid="museum-entry" onClick={visitMuseum}>音乐盒博物馆 <Arrow/></button><button onClick={()=>setArchive(true)}>作品留存 <Arrow/></button></footer>
    </>:snap.stage==='waiting'?<main className="lobby"><div className="lobby-scene"><div className="section-kicker">工位已留好 / <span data-testid="room-code">{snap.code}</span></div><h1>{snap.mode==='demo'?'一人，也能先试着合拍。':partner?'人齐了，一起落座。':'空着的那一边，留给你的伙伴。'}</h1><p>{snap.mode==='demo'?'这是独立的单人演示。切换 A / B，体验两种工具。':'邀请面对面的朋友，用另一台设备加入这张工作台。'}</p>{box(true)}</div><aside className="paper-panel invite-panel"><div className="paper-topline">INVITATION <span>01 / 01</span></div><h2>{snap.mode==='demo'?'单人演示工位':'把另一半工位递出去'}</h2>{snap.mode==='real'?<><p>让伙伴打开链接，或输入工位码。</p><div className="room-code-display">{snap.code}<span>工位码 · 24 小时内有效</span></div><div className="invite-link-row"><input aria-label="邀请链接" readOnly value={inviteLink}/><button onClick={()=>copy(inviteLink)} aria-label="复制邀请链接">复制</button></div>{qr?<div className="qr-invite"><img src={qr} alt="加入工位的二维码"/><span>同一局域网可用<br/><small>手机需连接电脑所在网络</small></span></div>:<p className="local-warning">当前是本机地址。切换到实际局域网地址后显示手机二维码。</p>}<InvitationCard roomCode={snap.code} inviteLink={inviteLink} canScan={!isLoopback} onError={notify}/>{!!config?.lanAddresses.length&&<label className="address-select">邀请地址<select value={inviteOrigin} onChange={e=>setInviteOrigin(e.target.value)}><option value={location.origin}>{location.origin}（当前）</option>{config.shareBaseUrl&&<option value={config.shareBaseUrl}>{config.shareBaseUrl}</option>}{config.lanAddresses.map(ip=>{const origin=`${location.protocol}//${ip}:${location.port||config.port}`;return <option key={ip} value={origin}>{origin}（局域网）</option>;})}</select></label>}</>:<p>没有真人伙伴。每次点击「切换角色」，另一套工具就会交到你手里；双方的准备仍需分别确认。</p>}<div className="role-pair" aria-label="双方分工与准备状态"><div className={snap.self==='A'?'you':''}><span className="person-circle">A</span><span><b>先读图纸</b><small>看见目标，把线索递过去</small></span><i>{snap.members.find(m=>m.id==='A')?.ready?'已准备':'等候中'}</i></div><span className="swap-symbol">⇄</span><div className={snap.self==='B'?'you':''}><span className="person-circle">B</span><span><b>先拿工具</b><small>挑选零件，让机芯转起来</small></span><i>{snap.members.find(m=>m.id==='B')?.ready?'已准备':'等候中'}</i></div></div><div className="lobby-ready"><div>{connection()}</div><button className="primary" data-testid="ready" disabled={busy||!connected||!!me?.ready||(snap.mode==='real'&&!partner?.connected)} onClick={()=>send({type:'ready'})}>{me?.ready?'已准备，等另一位':'我准备好了'} <Arrow/></button><small>两人都准备后，音乐盒才会交到你们手中。</small></div>{snap.mode==='real'&&<details className="research-consent"><summary>可选：参与匿名可用性记录</summary><p>仅在你同意后记录操作、阶段耗时、错误、提示与连接事件；不采集姓名、摄像头或麦克风。演示数据单独隔离。</p><label><input type="checkbox" checked={snap.testConsent} onChange={e=>send({type:'testConsent',consent:e.target.checked})}/>我自愿记录本人的匿名操作事件</label></details>}</aside></main>
    :snap.stage==='ended'?<main className="empty-view"><h1>这张工位，已经收好了。</h1><p>{partner?.left?'伙伴主动离开了。本次合作已结束，尚未完成的修复不会记为完成。':'本次合作已结束。'}已完成的作品仍会保留在各自的作品留存中。</p><button className="primary" onClick={()=>{session.current=null;sessionStorage.removeItem(SESSION_KEY);setSnap(null);snapRef.current=null;setEnded(true);}}>今天就到这里</button></main>
    :<main className={`workshop stage-${snap.stage}`}>
      <section className="bench"><div className="bench-top"><span className="section-kicker">工位 {snap.code} <span className="bench-slash">/</span> 沉默的音乐盒</span><span className="bench-count">{snap.stage==='gears'?`${Object.keys(snap.installed).length} / 3 已咬合`:snap.stage==='melody'?`${snap.notes.filter(Boolean).length} / 4 声音片`:snap.stage==='complete'?'共同修复 · 已留存':'NO. 001'}</span></div><div className="bench-hint"><h1>{snap.stage==='gears'?(snap.role==='guide'?'把你看见的线索，递给伙伴。':'挑一枚齿轮，问问看。'):snap.stage==='swap'?'现在，换你亲手试一试。':snap.stage==='melody'?(snap.role==='guide'?'选一段旋律，让伙伴把它接回来。':'这一次，让声音在你手里排列。'):snap.stage==='arrange'?'已经修好了，现在调成你们喜欢的样子。':snap.stage==='launch'?'把我们选的声音，轻轻上好弦。':snap.stage==='performance'?'听，沉默的音乐盒又响了。':'这段旋律，有了你们的名字。'}</h1>{snap.paused&&<div className="pause-banner" role="status">{!connected?'连接暂时中断，正在恢复你的身份。':'伙伴暂时掉线。工位已暂停，零件和进度都在。'}</div>}</div><div className="workbench-object">{snap.stage==='arrange'&&arrangementProps?<div className="score-workspace"><div className="score-world-preview">{box()}<p className="score-world-caption">A 的音高托起星星，B 的伴奏点亮小灯。试听时，纸雕跟着你们的节拍回应。</p></div><ArrangementBoard {...arrangementProps}/></div>:box()}</div><div className="bench-bottom"><span className="material-label">HANDCRAFTED TOGETHER <i>·</i> {snap.finish==='walnut'?'胡桃木':'樱桃木'} / 黄铜</span></div><div className="shared-messages" aria-live="polite">{snap.marks.slice(-2).map((m,i)=><span key={`${m.at}-${i}`}><b>{m.by===snap.self?'你':'伙伴'}</b> {m.text}{m.target.startsWith('slot-')?` · ${ {'slot-1':'三角槽','slot-2':'圆形槽','slot-3':'方形槽'}[m.target]||''}`:m.target.startsWith('note-')?` · 第 ${Number(m.target.slice(5))+1} 槽`:''}</span>)}</div>{placement&&snap.self!==placement.by&&!Object.values(snap.installed).includes(placement.gearId)&&<div className="placement-receipt" data-testid="placement-receipt" role="status"><ShapeIcon shape={snap.slots.find(slot=>slot.id===placement.slotId)?.shape||''} size={25}/><span>伙伴指了这里：{slotNames[placement.slotId]}。<small>{previewGear?.label} · 仍由你来试放</small></span><button onClick={()=>setSelectedGear(placement.gearId)}>拿回这枚零件</button></div>}</section>
      <aside className="paper-panel tool-panel"><div className="paper-topline">{snap.stage==='complete'?'OUR MUSIC BOX / 共同留念':snap.role==='guide'?'BLUEPRINT / 私有图纸':'REPAIR TOOLS / 手边工具'}<span>0{step}</span></div>
        {snap.stage==='gears'?<><div className="tool-title"><img className="tool-kit-small" src={snap.role==='guide'?roleGuide:roleMaker} alt=""/><div><span className="eyebrow">你是{snap.role==='guide'?'图纸师':'装配师'}</span><h2>{snap.role==='guide'?'读懂齿轮的暗号':'让每枚齿轮找到位置'}</h2></div></div>{snap.role==='guide'?<><p>你的图纸只有你看得见。告诉伙伴：形状对应多大、几道刻痕。</p><div className="blueprint-list">{snap.blueprint?.gears?.map(g=><button key={g.slot} disabled={blocked} onClick={()=>send({type:'mark',target:g.slot,text:'这里'})}><ShapeIcon shape={g.shape} size={28}/><span><b>{g.shape==='triangle'?'三角':g.shape==='circle'?'圆形':'方形'}槽</b><small>{sizes[g.size]}齿轮 · {g.notches} 道刻痕</small></span><span className="blueprint-pointer">指这里 ↗</span></button>)}</div>{feedbackButtons()}</>:<><p>先挑零件，再点槽位；也可以拖过去。拿不准，就问一句。</p><div className="parts-tray">{snap.gears.map(g=>{const installed=Object.values(snap.installed).includes(g.id);return <button key={g.id} data-testid={`gear-${g.id}`} className={`part ${selectedGear===g.id?'selected':''} ${installed?'installed':''}`} disabled={!canOperate||installed} onPointerDown={e=>beginDrag(e,'gear',g.id)} onClick={()=>setSelectedGear(g.id)} aria-pressed={selectedGear===g.id} aria-label={`${g.label}，${sizes[g.size]}齿轮，${g.notches}道刻痕${installed?'，已安装':''}`}><GearIcon gear={g} size={66}/><b>{g.label}</b>{installed&&<i>已安装</i>}</button>;})}</div><button className="ask-button" disabled={!selectedGear||blocked} onClick={()=>send({type:'mark',target:selectedGear!,preview:selectedGear!,text:'这块吗？'})}>把选中零件递给伙伴看 <strong>这块吗？ <span aria-hidden="true">↗</span></strong></button>{renderGearPreview()}</>}{helper()}{details&&<p className="details-text">齿轮大小与刻痕数都要匹配。图纸师可以点图纸或机芯的槽位指给伙伴看；装配师选零件后点击槽位，键盘 Tab 与回车同样有效。放错会退回托盘，不计分也不限时。</p>}</>
        :snap.stage==='swap'?<div className="swap-panel"><div className="swap-tools role-kit-pair"><figure><img src={roleGuide} alt="图纸、铅笔与黄铜尺"/><figcaption>图纸师</figcaption></figure><span className="tool-exchange-arrow" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M5 14h28m-7-7 7 7-7 7M35 28H7m7-7-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></span><figure><img src={roleMaker} alt="齿轮、螺丝刀与卡尺"/><figcaption>装配师</figcaption></figure></div><span className="eyebrow">机芯已重新咬合</span><h2>交换工具，也交换一点视角。</h2><p>接下来，B 挑旋律、读图纸，A 试听和排列声音片。</p><div className="confirmation-pair">{snap.members.map(m=><span key={m.id} className={m.swapReady?'checked':''}>{m.id} {m.swapReady?'已准备接过':'等待接过工具'}</span>)}</div><button className="primary" data-testid="swap-ready" disabled={blocked||me?.swapReady} onClick={()=>send({type:'swapReady'})}>{me?.swapReady?'等伙伴接过工具':'我接过工具了'} <Arrow/></button></div>
        :snap.stage==='melody'?<><div className="tool-title"><div><span className="eyebrow">现在，你是{snap.role==='guide'?'图纸师':'装配师'}</span><h2>{snap.role==='guide'?'给旋律定个心情':'把四个声音接起来'}</h2></div></div>{snap.role==='guide'?<><p>你选旋律，伙伴选音色。把图纸上的顺序递给对方。</p><div className="melody-choices">{(['bright','calm'] as const).map(m=><button key={m} data-testid={`melody-${m}`} disabled={blocked} className={snap.melody===m?'selected':''} onClick={()=>send({type:'selectMelody',melody:m})}><span>{m==='bright'?'轻快':'舒缓'}</span><small>{m==='bright'?'像午后的光':'像晚风经过'}</small></button>)}</div>{snap.blueprint?.notes?<div className="melody-blueprint">{snap.blueprint.notes.map((n,i)=><button key={i} disabled={blocked} onClick={()=>send({type:'mark',target:`note-${i}`,text:'这里'})} aria-label={`图纸第${i+1}位${noteNames[n]}`}><span>0{i+1}</span><NoteIcon symbol={n} size={38}/><b>{noteNames[n]}</b></button>)}</div>:<p className="empty-blueprint">先选一张图纸，再和伙伴对照。</p>}{feedbackButtons()}<button className="secondary guide-trial" data-testid="shared-melody-trial" disabled={blocked||!snap.notes.some(Boolean)} onClick={()=>void trialTogether()}>和伙伴一起试奏 <span aria-hidden="true">♪</span></button><p className="trial-sound-note">{IS_STATIC_DEMO?'在本机试听这一版；切换角色可体验另一套工具。':'试奏会在两端播放，伙伴需在自己的设备开启声音。'}</p></>:<><p>{snap.melody?'试听声音片，和伙伴对照后放进槽位。':'伙伴正在挑选旋律，你可以先试听声音片。'}</p><div className="note-tray">{(['leaf','star','moon'] as NoteSymbol[]).map(n=><div key={n}><button data-testid={`note-${n}`} className={`note-piece ${selectedNote===n?'selected':''}`} disabled={!canOperate||!snap.melody} onPointerDown={e=>beginDrag(e,'note',n)} onClick={()=>{setSelectedNote(n);setSwapFrom(null);audio.current.tone(n,snap.timbre);}} aria-label={`选择${noteNames[n]}声音片`} aria-pressed={selectedNote===n}><NoteIcon symbol={n} size={43}/><b>{noteNames[n]}</b></button><button className="audition" onClick={()=>{audio.current.tone(n,snap.timbre);setHighlight(null);notify(`${noteNames[n]}声音片${muted?' · 声音关闭，可点击顶部开启':''}`);}} aria-label={`试听${noteNames[n]}`}>试听 ♪</button></div>)}</div><div className="timbre-area"><span className="eyebrow">你来选音色 <small>与伙伴的旋律一起留存</small></span><div className="timbre-choices">{(Object.keys(timbres) as Timbre[]).map(t=><button data-testid={`timbre-${t}`} key={t} className={snap.timbre===t?'selected':''} disabled={!canOperate} onClick={()=>{void send({type:'setTimbre',timbre:t});audio.current.tone('star',t);}}>{timbres[t]}</button>)}</div></div><div className="melody-buttons"><button className="secondary" disabled={blocked||!snap.notes.some(Boolean)} data-testid="shared-melody-trial" onClick={()=>void trialTogether()}>一起试奏 <span>♪</span></button><button className="primary" data-testid="check-melody" disabled={blocked||snap.notes.some(n=>!n)} onClick={()=>send({type:'checkMelody'})}>确认这段旋律 <Arrow/></button></div></>}{helper()}{details&&<p className="details-text">同一声音片可以重复使用。点选声音片再点槽位即可替换；不选声音片时，依次点两个槽位可换位。每个声音都同时用图形、文字和顺序表示，静音时照样可完成。</p>}</>
        :snap.stage==='arrange'&&arrangementProps?<><ArrangementTools {...arrangementProps}/><div className="arrangement-finish"><span>木盒外观 <small>可选</small></span><div className="finish-picker" aria-label="音乐盒外观">{(['walnut','cherry'] as const).map(f=><button key={f} disabled={blocked} className={snap.finish===f?'active':''} onClick={()=>send({type:'setFinish',finish:f})}><i className={f}/>{f==='walnut'?'胡桃木':'樱桃木'}</button>)}</div></div></>
        :snap.stage==='launch'?<div className="launch-panel">
          <span className="eyebrow">把最后一个动作，交给两双手</span><h2>把一起选的声音，<br/>轻轻上好弦。</h2>
          <p className="launch-role-lead">{snap.role==='guide'?'捏住启动片，顺着拨片滑到准备位后松手；也可以点按下方按钮。准备状态会保留。':'顺势转一下右侧摇柄，或点按一次，让发条连续上紧。'}</p>
          <div className="launch-readiness">
            <div className={snap.members.find(m=>m.id==='B')?.launchReady?'lit':''}><span className="switch-light"/><span><b>B · 伙伴的准备</b><small>{snap.members.find(m=>m.id==='B')?.launchReady?'已经确认，准备好了':'等待伙伴拨动启动片'}</small></span></div>
            <div className={(snap.winding??0)>=4?'lit':''}><span className="switch-light"/><span><b>A · 音乐盒的发条</b><small>{(snap.winding??0)>=4?'已经上好弦':windingActive?'正一起看着发条收紧':'转一次，旋律就会接着响起'}</small></span><span className="winding-count" data-testid="winding-progress" data-winding-at={snap.windingAt??''} data-winding-duration={snap.windingDurationMs??1400} data-progress={windingProgress.toFixed(3)} data-state={(snap.winding??0)>=4?'ready':windingActive?'winding':'idle'}>{(snap.winding??0)>=4?'已就绪':windingActive?'上弦中':'待上弦'}</span></div>
          </div>
          <div className="winding-meter winding-meter-continuous" role="progressbar" aria-label="发条上弦进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(windingProgress*100)}><span style={{width:`${windingProgress*100}%`}}/></div>
          {snap.role==='guide'&&me?.launchReady?<p className="retained-ready" data-testid="launch-ready-state">启动片已就绪。你的准备会保留，等伙伴为音乐盒上好弦。</p>:snap.role==='guide'?<button className="primary" data-testid="launch-ready" disabled={blocked||me?.launchReady} onClick={()=>send({type:'launchReady'})}>拨到准备位 <Arrow/></button>:<button className="primary wind-step-button" data-testid="wind-step" aria-busy={windingActive} disabled={blocked||windingActive||(snap.winding??0)>=4} onClick={wind}>{(snap.winding??0)>=4?'发条已上好，等伙伴准备':windingActive?'发条正在慢慢收紧':'轻转上弦，让旋律响起'} <span aria-hidden="true">↷</span></button>}
          <p className="launch-wait-note">准备状态会保留。两边都就绪后，音乐盒自然开始，不用同时点击。</p><p className="small-print">面对面时，可只打开一台设备的声音。</p>
          {snap.arrangement&&<button className="subtle arrangement-reopen" data-testid="arrangement-reopen" disabled={blocked||windingActive} onClick={()=>send({type:'reopenArrangement'})}>想再调一下，回到两条纸带 ↶</button>}
        </div>
        :snap.stage==='performance'?<div className="performance-panel"><img className="performance-paper-stage" src={paperTheatre} alt="月亮与森林组成的纸雕小剧场"/><span className="eyebrow">你们共同修好的</span><h2>一段旋律，<br/>正在轻轻展开。</h2><p>留一点时间，听听它。也可以拖动音乐盒，换个角度看星星与小灯回应。</p><div className="visual-score">{(snap.arrangement?.current.tracks.A.notes||snap.notes).map((n,i)=><span key={i} className={highlight===i?'active':''}>{n&&<NoteIcon symbol={n} size={30}/>}</span>)}</div><p className="small-print">这段演出会自然结束，之后可以重播或带走。</p></div>
        :snap.stage==='complete'&&snap.work?<><CompletedWorkHeader work={snap.work} soundSummary={workSoundSummary(snap.work)}/><div className="completion-actions"><button className="primary" data-testid="save-card" disabled={busy||restoring} onClick={()=>saveCard(snap.work!).then(()=>notify('作品图片已生成，请在浏览器下载中查看。')).catch(e=>notify(e.message))}>保存作品图片 <span>↓</span></button><button className="secondary" data-testid="replay" disabled={busy||restoring} onClick={()=>playWork(snap.work!)}>再听一遍 <span>♪</span></button></div><WorkWordEditor key={`${snap.code}:${snap.self}`} savedWord={me?.word||''} partnerWord={partner?.word||''} disabled={blocked} shared={!!snap.work.shareId} onSave={nextWord=>send({type:'setWord',word:nextWord})}/><div className="stamp-chooser"><span className="eyebrow">你留一枚刻印，和伙伴并排放在铜牌上 <small>可保留默认</small></span><div className="stamp-options">{(Object.keys(stampNames) as Stamp[]).map(stamp=><button key={stamp} data-testid={`stamp-${stamp}`} aria-label={`选择${stampNames[stamp]}刻印`} aria-pressed={(snap.work!.stamps?.[snap.self]||(snap.self==='A'?'sprout':'spark'))===stamp} disabled={busy||!connected||!!snap.work!.shareId} onClick={()=>send({type:'setStamp',stamp})}><StampIcon stamp={stamp} size={24}/><span>{stampNames[stamp]}</span></button>)}</div><div className="stamp-contributors">{(['A','B'] as const).map(id=><span key={id}>{id} 的刻印 <StampIcon stamp={snap.work!.stamps?.[id]||(id==='A'?'sprout':'spark')} size={19}/>{stampNames[snap.work!.stamps?.[id]||(id==='A'?'sprout':'spark')]}</span>)}</div></div>{snap.mode==='real'?<div className="share-area"><label><input data-testid="share-consent" type="checkbox" checked={!!me?.shareConsent} disabled={busy||restoring||!connected} onChange={e=>send({type:'shareConsent',consent:e.target.checked})}/>我同意分享这份作品</label>{snap.work.shareId?<><p>双方已同意链接分享。接收者可欣赏、接力；作品尚需另外授权才会进入小展柜。</p><div className="invite-link-row"><input data-testid="share-link" aria-label="只读作品链接" readOnly value={`${inviteOrigin}/?work=${snap.work.shareId}`}/><button onClick={()=>copy(`${inviteOrigin}/?work=${snap.work!.shareId}`)}>复制</button></div><small>{isLoopback?'此链接仅本机可用；手机需改用电脑的局域网地址。':'同一局域网可访问，未公开部署。'}</small></>:<p>{me?.shareConsent?'等待伙伴同意后才生成只读链接。':'双方都同意后，再把这段旋律递出去。'}</p>}<ExhibitionConsent snapshot={snap} disabled={busy||restoring||!connected} onAction={send} onVisit={visitMuseum}/></div>:<p className="small-print">{IS_STATIC_DEMO?'这是本机单人体验作品，可以下载图片；纸签也在本机切换角色查看，不会发送给其他访客。':'这是单人演示作品，可留存图片，不生成真实双人分享记录。'}</p>}<PaperNotes key={`${snap.work.id}:${snap.self}`} room={snap.code} self={snap.self} notes={snap.paperNotes} disabled={blocked||snap.paused} onSend={text=>send({type:'sendNote',text})} onRead={noteId=>send({type:'readNote',noteId})}/><div className="completion-bottom">{snap.mode==='real'&&<button className="subtle" onClick={()=>setFeedbackOpen(true)}>{feedbackDone?'反馈已私密保存':'留一点体验反馈（可跳过）'}</button>}<button className="text-link" onClick={()=>setLeaveOpen(true)}>今天就到这里 <Arrow/></button></div></>:null}
        {snap.hint&&<div className="hint-message" role="status"><b>一条小提示 · 已记录请求</b><p>{snap.hint}</p></div>}
      </aside>
    </main>}
    {snap?.mode==='demo'&&!museum&&!viewWork&&<div className="demo-toolbar"><span><b>单人演示</b> 当前代入 {snap.self} · {roleName()}</span><button data-testid="demo-switch" disabled={busy||!connected||['performance','ended'].includes(snap.stage)} onClick={()=>rpc('demoSwitch',{self:snap.self==='A'?'B':'A'})}>切换到 {snap.self==='A'?'B':'A'} <span>⇄</span></button></div>}
    {joinOpen&&<div className="modal-backdrop" onClick={()=>setJoinOpen(false)}><section className="dialog paper-panel" role="dialog" aria-modal="true" aria-labelledby="join-title" onClick={e=>e.stopPropagation()}><button className="dialog-close" aria-label="关闭加入窗口" onClick={()=>setJoinOpen(false)}>×</button><span className="eyebrow">另一半工位在等你</span><h2 id="join-title">把工位码放在这里。</h2><p>和朋友坐在一起，用另一台设备加入。</p><form onSubmit={e=>{e.preventDefault();void enter('real',true);}}><label htmlFor="room-code">工位码</label><input autoFocus id="room-code" aria-label="输入工位码" value={joinCode} placeholder="6 位工位码" maxLength={6} autoComplete="off" onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/><button className="primary" disabled={busy||!connected||joinCode.length!==6}>加入这间工位 <Arrow/></button></form><p className="small-print">目前仅在同一局域网使用，不会随机匹配陌生人。</p></section></div>}
    {leaveOpen&&<div className="modal-backdrop"><section className="dialog paper-panel" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">{snap?.stage==='complete'?'把今天收在这里？':'要先离开工位吗？'}</h2><p>{snap?.stage==='complete'?'作品已保存。你们不需要继续下一局，想再听时可以打开作品留存。':'主动退出会结束这次合作，伙伴也会收到提示；尚未完成的修复不会记为完成。刷新或短暂掉线则会保留工位。'}</p><div className="dialog-actions"><button className="secondary" onClick={()=>setLeaveOpen(false)}>再待一会儿</button><button className="primary" onClick={leave} disabled={busy}>今天就到这里</button></div></section></div>}
    {archive&&<div className="modal-backdrop" onClick={()=>setArchive(false)}><section className="dialog paper-panel archive-dialog" role="dialog" aria-modal="true" aria-label="作品留存" onClick={e=>e.stopPropagation()}><button className="dialog-close" aria-label="关闭作品留存" onClick={()=>setArchive(false)}>×</button><span className="eyebrow">只在这台浏览器的抽屉里</span><h2>留存过的旋律</h2>{storedWorks().length?storedWorks().map(w=><div className="archive-record" key={w.id}><button className="archive-item" key={w.id} onClick={()=>{stopPlayback();setLocalWork(w);setPublicWork(null);setMuseum(false);museumOrigin.current=false;setArchive(false);setEnded(false);}}><span><b>{w.title}</b><small>{new Date(w.completedAt).toLocaleDateString('zh-CN')} {w.demo?'· 单人演示':''}</small></span><Arrow/></button>{exhibitReceipts()[w.id]&&<button className="archive-withdraw" data-testid={`exhibit-withdraw-${w.id}`} disabled={busy} onClick={()=>withdrawExhibit(w)}>撤下公开展品</button>}</div>):<p>这里还是空的。一起修好音乐盒后，作品会留在这里。</p>}<p className="small-print">最多保留最近 12 件。清理浏览器数据会清空此抽屉，请下载重要作品。公开展品的撤展凭条仅在当前标签页内保留，正常结束后也可在此撤展。</p></section></div>}
    {feedbackOpen&&<div className="modal-backdrop"><section className="dialog paper-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button className="dialog-close" aria-label="跳过反馈" onClick={()=>setFeedbackOpen(false)}>×</button><span className="eyebrow">只留给设计者，不向伙伴公开</span><h2 id="feedback-title">这次配合，感觉怎么样？</h2><form onSubmit={async e=>{e.preventDefault();const r=await send({type:'feedback',comfortable,again,comment,consent:feedbackConsent});if(r.ok){setFeedbackDone(true);setFeedbackOpen(false);notify('谢谢你的反馈，仅为本次可用性迭代保存。');}}}><label>配合时是否舒适？<select value={comfortable} onChange={e=>setComfortable(e.target.value)}><option value="">暂不回答</option><option>舒适</option><option>一般</option><option>不太舒适</option></select></label><label>是否愿意继续交流？<select value={again} onChange={e=>setAgain(e.target.value)}><option value="">暂不回答</option><option>愿意</option><option>还不确定</option><option>暂时不想</option></select></label><label>哪里顺手，哪里卡住了？<textarea value={comment} maxLength={240} onChange={e=>setComment(e.target.value)} placeholder="可留空，不填写姓名或联系方式"/></label><label className="feedback-consent"><input type="checkbox" checked={feedbackConsent} onChange={e=>setFeedbackConsent(e.target.checked)}/>我自愿保存本次匿名反馈，不开启其他操作记录。</label><button className="primary" disabled={busy||!feedbackConsent}>私密保存反馈</button><button type="button" className="subtle" onClick={()=>setFeedbackOpen(false)}>跳过，也很好</button></form></section></div>}
    {notice&&<div className="toast" role="status"><span/>{notice}<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></div>}
    {drag?.moved&&<div className="drag-ghost" style={{left:drag.x,top:drag.y}}>{drag.kind==='gear'?<GearIcon gear={snap!.gears.find(g=>g.id===drag.id)!} size={90}/>:<NoteIcon symbol={drag.id as NoteSymbol} size={58}/>}</div>}
    {((!connected&&snap)||restoring)&&!sessionUnavailable&&<div className="network-banner" role="status">{!connected?'连接暂时中断 · 正在找回你的工位，请保留此页面':recoveryWait?'暂未收到工位确认，进度仍保留。':'正在恢复工位，稍等一下…'}{recoveryWait&&connected&&<button className="recovery-retry" onClick={()=>{if(socketRef.current)resumeRoom(socketRef.current);}}>重试恢复</button>}</div>}
  </div>;
}
export default App;
