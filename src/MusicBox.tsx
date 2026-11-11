import { useId, useRef, useState, useEffect } from 'react';
import type { Finish, Gear, Identity, Mark, NoteSymbol, Stage, Stamp } from '../shared/types';
import { useWindingProgress } from './useWindingProgress';
import { GearDrawing } from './GearAssembly';
import { PaperTheatre } from './PaperTheatre';
import { DepthLayer, useObjectDepth } from './ObjectDepth';
import './musicbox.css';
import './object-depth.css';

export interface MusicBoxProps {
  installed?: Record<string, string>;
  gears?: Gear[];
  notes?: (NoteSymbol | null)[];
  stage?: Stage | 'preview';
  previewState?: 'unrepaired' | 'restored';
  finish?: Finish;
  selectedGear?: string | null;
  selectedNote?: NoteSymbol | null;
  canOperate?: boolean;
  marks?: Mark[];
  playing?: boolean;
  onSlot?: (slotId: string) => void;
  onNoteSlot?: (index: number) => void;
  onPoint?: (target: string) => void;
  highlightNote?: number | null;
  winding?: number;
  windingAt?: number;
  windingDurationMs?: number;
  windingPausedAt?: number;
  guideReady?: boolean;
  canWind?: boolean;
  canArm?: boolean;
  onWind?: () => void;
  onArm?: () => void;
  stamps?: Record<Identity, Stamp>;
  workTitle?: string;
  view?: 'box' | 'mechanism' | 'winding';
}

const symbolNames: Record<NoteSymbol, string> = { leaf: '叶', star: '星', moon: '月' };
export function GearIcon({ gear, size = 80, installed = false }: { gear: Gear; size?: number; installed?: boolean }) {
  const prefix = useId().replace(/:/g, '');
  return <svg className={`gear-icon${installed ? ' gear-is-installed' : ''}`} width={size} height={size} viewBox="-50 -50 100 104" aria-label={`${gear.size === 'large' ? '大' : gear.size === 'medium' ? '中' : '小'}齿轮，${gear.notches}道刻痕`} role="img"><GearDrawing gear={gear} prefix={prefix}/></svg>;
}

function NoteDrawing({ symbol }: { symbol: NoteSymbol }) {
  if (symbol === 'leaf') return <g><path d="M-15 13C-24-5-6-22 18-19C18 5 5 22-15 13Z" fill="currentColor"/><path d="M-18 19L11-12M-7 7L-8-4M0 0L11 1" fill="none" stroke="var(--note-vein, #e4edd8)" strokeWidth="1.8" strokeLinecap="round"/></g>;
  if (symbol === 'star') return <path d="M0-22L6.4-7.4L22-6.8L10.6 3.8L14 20L0 11.6L-14 20L-10.6 3.8L-22-6.8L-6.4-7.4Z" fill="currentColor"/>;
  return <path d="M8-22A23 23 0 1 0 20 15A20 20 0 0 1 8-22Z" fill="currentColor"/>;
}

export function NoteIcon({ symbol, size = 32 }: { symbol: NoteSymbol; size?: number }) {
  return <svg className={`note-icon note-${symbol}`} width={size} height={size} viewBox="-28 -28 56 56" role="img" aria-label={symbolNames[symbol]}><NoteDrawing symbol={symbol}/></svg>;
}

const stampNames: Record<Stamp, string> = { sprout: '嫩芽', crescent: '弯月', spark: '微星', wave: '水纹' };
function StampDrawing({ stamp }: { stamp: Stamp }) {
  if (stamp === 'sprout') return <g><path d="M0 13V-2M0 3C-13 2-15-9-13-13C-4-13 2-8 0 3ZM0-1C1-11 8-15 15-13C16-4 10 2 0-1Z"/><path d="M-9-8L0 3L10-8"/></g>;
  if (stamp === 'crescent') return <path d="M7-15A17 17 0 1 0 15 10A15 15 0 0 1 7-15Z"/>;
  if (stamp === 'spark') return <g><path d="M0-17L5-5L17 0L5 5L0 17L-5 5L-17 0L-5-5Z"/><path d="M13-13L16-16M-13 13L-16 16"/></g>;
  return <g><path d="M-17-8Q-8-16 0-8T17-8M-17 1Q-8-7 0 1T17 1M-17 10Q-8 2 0 10T17 10"/></g>;
}

export function StampIcon({ stamp, size = 32 }: { stamp: Stamp; size?: number }) {
  return <svg className={`stamp-icon stamp-${stamp}`} width={size} height={size} viewBox="-23 -23 46 46" role="img" aria-label={stampNames[stamp]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><StampDrawing stamp={stamp}/></svg>;
}

function WindingCrank({ prefix, active, progress, started = false, enabled, onWind, x=893, y=566 }: { prefix: string; active: boolean; progress: number; started?: boolean; enabled: boolean; onWind?: () => void; x?:number; y?:number }) {
  const [turn, setTurn] = useState(progress*360);
  const [dragging,setDragging]=useState(false);
  const [pending,setPending]=useState(false);
  const gesture = useRef<{pointerId: number; last: number; travel: number; base: number} | null>(null);
  const submitted=useRef(false);
  const releasedAngle=useRef(progress*360);
  const releaseProgress=useRef(progress);
  const direction=useRef(1);
  const suppressClick = useRef(false);
  const reducedMotion=useRef(typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches).current;
  const busy=started||pending;
  // The local release pose is blended into one server-timed revolution. While
  // the command is in flight, the handle stays where the person left it.
  const remainingProgress=Math.max(0,Math.min(1,(progress-releaseProgress.current)/Math.max(.001,1-releaseProgress.current)));
  const visualProgress=reducedMotion&&progress<1?0:remainingProgress;
  const shownAngle=dragging?turn:busy?releasedAngle.current+(direction.current*360-releasedAngle.current)*visualProgress:turn;
  useEffect(()=>{
    if(!pending||started||progress>=1)return;
    const timeout=window.setTimeout(()=>{submitted.current=false;releasedAngle.current=progress*360;setTurn(progress*360);setPending(false);},2500);
    return()=>window.clearTimeout(timeout);
  },[pending,started,progress]);
  const submit=(release=shownAngle)=>{if(!active||!enabled||submitted.current||started||progress>=1)return;submitted.current=true;releasedAngle.current=release;releaseProgress.current=progress;direction.current=release<0?-1:1;setTurn(release);setPending(true);setDragging(false);onWind?.();};
  const angleAt = (event: React.PointerEvent<SVGGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return Math.atan2(local.y - 1, local.x - 26) * 180 / Math.PI;
  };
  const reset = (event: React.PointerEvent<SVGGElement>,cancel=false) => {
    gesture.current = null;setDragging(false);if(cancel)setTurn(progress*360);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <g className={`winding-key${active ? ' is-active' : ''}${enabled&&!busy ? ' can-wind' : ''}${dragging?' is-dragging':''}${busy?' is-winding':''}`} transform={`translate(${x} ${y})`} role={active ? 'button' : undefined} tabIndex={active && enabled && !busy ? 0 : -1} aria-label={active ? busy ? progress>=1?'音乐盒已上好弦':'音乐盒正在连续上弦' : '转动摇柄一次，为音乐盒连续上弦；也可点按或按回车' : undefined} aria-disabled={active ? !enabled||busy : undefined} aria-busy={active?busy&&progress<1:undefined} data-testid="winding-crank" data-pivot-x="26" data-pivot-y="1" data-angle={shownAngle.toFixed(1)}
    onPointerDown={event => {
      if (!active || !enabled || busy || submitted.current || event.button !== 0) return;
      const angle = angleAt(event); if (angle === null) return;
      suppressClick.current = false;
      gesture.current = { pointerId: event.pointerId, last: angle, travel: 0, base:shownAngle };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
      const angle = angleAt(event); if (angle === null) return;
      let delta = angle - current.last;
      if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
      current.last = angle; current.travel += delta;
      setTurn(current.base+Math.max(-150, Math.min(150, current.travel)));
    }}
    onPointerUp={event => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const wasTurn = Math.abs(current.travel) >= 60;
      reset(event,!wasTurn);
      if (wasTurn && enabled) { suppressClick.current = true;submit(current.base+Math.max(-150,Math.min(150,current.travel))); }
    }}
    onPointerCancel={event => { suppressClick.current = true; reset(event,true); }}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; }submit(); }}
    onKeyDown={event => { if (active && enabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault();submit(); } }}>
    {active && <g className="crank-indicator" pointerEvents="none"><circle cx="26" cy="1" r="68" fill="#142c26" fillOpacity=".35" stroke="#c4b57e" strokeOpacity=".45" strokeWidth="1"/><circle cx="26" cy="1" r="68" fill="none" stroke="#e4cb8b" strokeWidth="3.5" strokeLinecap="round" pathLength="1" strokeDasharray={`${Math.max(.001,progress)} 1`} transform="rotate(-90 26 1)"/><text x="26" y="91" textAnchor="middle" className="crank-progress">{progress>=1?'发条已蓄满':busy?'正在上弦…':'转动一次'}</text></g>}
    <g pointerEvents="none"><ellipse cx="-13" cy="3" rx="12" ry="18" fill="#10251e" opacity=".3"/><ellipse cx="-14" cy="0" rx="9" ry="15" fill="#7c653e" stroke="#cfb47d" strokeWidth="1"/><ellipse cx="-11" cy="-1" rx="5.5" ry="10" fill="#384335" stroke="#a28e5d" strokeWidth=".8"/><path d="M-17-4H28V6H-18Z" fill={`url(#${prefix}-brass)`} stroke="#685137"/><ellipse cx="26" cy="1" rx="7" ry="12" fill="#9d7b47" stroke="#e0c18a"/>
      <g className="crank-handle" transform={`rotate(${shownAngle} 26 1)`} style={{transition:dragging||busy?'none':'transform 220ms ease-out'}}><path d="M27 0L43-9V-29" fill="none" stroke="#694e2d" strokeWidth="10" strokeLinecap="round"/><path d="M26-2L41-11V-29" fill="none" stroke="#d2b47d" strokeWidth="5" strokeLinecap="round"/><rect x="29" y="-50" width="24" height="31" rx="10" fill={`url(#${prefix}-wood-front)`} stroke="#c39a5d" strokeWidth="1.5"/><path d="M33-44v17" stroke="#e0b175" opacity=".5"/></g>
    </g>
    {active && <circle className="crank-hit" cx="26" cy="1" r="76" fill="transparent"/>}
  </g>;
}

function WindingCloseup({prefix,progress,started,guideReady,canWind,canArm,onWind,onArm,cherry}:{prefix:string;progress:number;started:boolean;guideReady:boolean;canWind:boolean;canArm:boolean;onWind?:()=>void;onArm?:()=>void;cherry:boolean}){
  const keyAction=(event:React.KeyboardEvent<SVGGElement>)=>{if(canArm&&!guideReady&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onArm?.();}};
  const springProgress=useRef(typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches).current?0:progress;
  const coil=Array.from({length:118},(_,index)=>{const angle=index/117*Math.PI*9;const radius=9+index/117*62;return `${index?'L':'M'}${(Math.cos(angle)*radius).toFixed(2)} ${(Math.sin(angle)*radius).toFixed(2)}`;}).join(' ');
  return <div className="musicbox-scene stage-launch is-winding-view" data-view="winding" data-parallax="off"><svg className="musicbox-svg winding-closeup-svg" viewBox="0 0 760 360" role="group" aria-label="发条与摇柄近景">
    <defs>
      <linearGradient id={`${prefix}-brass`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#f5dfa6"/><stop offset=".24" stopColor="#c6a66d"/><stop offset=".55" stopColor="#8f7546"/><stop offset=".8" stopColor="#dcc38c"/><stop offset="1" stopColor="#957543"/></linearGradient>
      <linearGradient id={`${prefix}-wood-front`} x1="0" y1="0" x2=".2" y2="1"><stop stopColor={cherry?'#a16b48':'#856041'}/><stop offset=".35" stopColor={cherry?'#805039':'#61452f'}/><stop offset="1" stopColor="#382d24"/></linearGradient>
      <linearGradient id={`${prefix}-well`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#102920"/><stop offset=".45" stopColor="#304b3d"/><stop offset="1" stopColor="#1d352a"/></linearGradient>
      <radialGradient id={`${prefix}-spring-face`}><stop stopColor="#b2aa7a"/><stop offset=".5" stopColor="#647760"/><stop offset="1" stopColor="#223b2b"/></radialGradient>
      <filter id={`${prefix}-depth`} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#071b15" floodOpacity=".55"/></filter>
    </defs>
    <ellipse cx="369" cy="325" rx="332" ry="22" fill="#081d19" opacity=".56"/>
    <path d="M50 255H705L684 318H65Z" fill={`url(#${prefix}-wood-front)`} stroke="#2e291f" strokeWidth="2"/>
    <path d="M705 255L722 242L700 306L684 318Z" fill="#342e21" stroke="#7a6240" strokeWidth="1"/>
    <path d="M78 45H646L722 242L705 266H50L29 247Z" fill={`url(#${prefix}-brass)`} stroke="#51462f" strokeWidth="2"/>
    <path d="M88 56H638L700 237H53Z" fill="#10291f" stroke="#c1aa71" strokeWidth="1.4"/>
    <path d="M95 66H631L685 225H67Z" fill={`url(#${prefix}-well)`} stroke="#607458" strokeWidth="1"/>
    <path d="M69 229H686M58 263H700" stroke="#f2d9a0" strokeWidth="1.3" opacity=".7"/>
    <path d="M67 280H694M73 302H688" stroke="#c69b60" strokeWidth="1" opacity=".26"/>
    <path d="M81 288C182 272 270 303 356 287S541 280 685 294" fill="none" stroke="#261f1b" opacity=".4"/>
    <g transform="translate(342 162)" filter={`url(#${prefix}-depth)`}>
      <ellipse cy="10" rx="100" ry="94" fill="#0a2119" stroke="#a38c59" strokeWidth="3"/>
      <circle r="93" fill={`url(#${prefix}-brass)`} stroke="#e9d4a2" strokeWidth="1.3"/>
      <circle r="85" fill="#182e22" stroke="#756b46" strokeWidth="2"/>
      <circle r="79" fill={`url(#${prefix}-spring-face)`} stroke="#d6c793" strokeWidth=".7"/>
      <g transform={`rotate(${springProgress*48}) scale(${1-springProgress*.09})`}><path d={coil} fill="none" stroke="#182e22" strokeWidth="4.2" strokeLinecap="round"/><path d={coil} fill="none" stroke="#c4bc87" strokeWidth="1.5" strokeLinecap="round" transform="translate(0 -1)"/></g>
      <circle r="14" fill={`url(#${prefix}-brass)`} stroke="#615539" strokeWidth="2"/><circle r="5" fill="#263d2c" stroke="#e2cc95" strokeWidth="1"/>
      {[-62,62].map(x=><g key={x} transform={`translate(${x} ${x<0?-61:61})`}><circle r="4" fill="#baa46d" stroke="#675b3b"/><path d="M-2 2L2-2" stroke="#544831"/></g>)}
    </g>
    <path d="M437 158H553V179H440Z" fill={`url(#${prefix}-brass)`} stroke="#655332" strokeWidth="1.5"/><path d="M442 161H547" stroke="#efdaa4" opacity=".7"/>
    <path d="M459 170H544" stroke="#635435" strokeWidth="1" strokeDasharray="3 4"/>
    <WindingCrank prefix={prefix} active progress={progress} started={started} enabled={canWind} onWind={onWind} x={543} y={169}/>
    <g className={`launch-mechanism closeup-ready${guideReady?' is-armed':''}`} transform="translate(147 153)" role="button" tabIndex={canArm&&!guideReady?0:-1} aria-disabled={!canArm||guideReady} aria-label={guideReady?'启动拨片已准备':'拨动启动片，确认机芯准备'} data-testid="launch-lever" onClick={()=>{if(canArm&&!guideReady)onArm?.();}} onKeyDown={keyAction}>
      <g pointerEvents="none"><rect x="-38" y="-47" width="76" height="94" rx="12" fill="#0f281f" stroke="#6e7955" strokeWidth="2"/><rect x="-29" y="-38" width="58" height="76" rx="7" fill={`url(#${prefix}-brass)`} stroke="#8c7548" strokeWidth="1"/>
      <path d="M0-23V23" stroke="#25372a" strokeWidth="12" strokeLinecap="round"/><path d="M-2-23V23" stroke="#101f19" strokeWidth="4" strokeLinecap="round"/>
      <g className="ready-pressure" transform={`translate(0 ${guideReady?-19:19})`}><path d="M-5-8H5V7H-5Z" fill="#76603c"/><rect x="-18" y="-9" width="36" height="18" rx="6" fill={`url(#${prefix}-brass)`} stroke="#ead6a4" strokeWidth="1"/><path d="M-11-4H10" stroke="#f0dcaa" opacity=".7"/></g>
      <circle cy="-34" r="3" fill={guideReady?'#dacc86':'#607253'}/><text y="72" textAnchor="middle" fill="#b8c8a4" fontSize="16">{guideReady?'启动片已就绪':'拨到准备位'}</text></g><circle r="61" fill="transparent"/>
    </g>
    <g pointerEvents="none"><rect x="274" y="284" width="172" height="7" rx="3.5" fill="#172f22" stroke="#7a845b" strokeWidth="1"/><rect x="275.5" y="285.5" width={169*progress} height="4" rx="2" fill="#dfca8c"/><text className="spring-caption" x="360" y="318" textAnchor="middle" fill="#cebd8a" fontSize="15" letterSpacing="1">{progress>=1?'发条蓄满 · 旋律即将响起':started?'发条正在收紧':'转动一次，让发条慢慢蓄满'}</text></g>
    {[[87,64],[636,64],[69,237],[685,237]].map(([x,y],i)=><Screw key={i} x={x} y={y}/>)}
  </svg></div>;
}

function ShapeDrawing({ shape }: { shape: string }) {
  return shape === 'triangle' || shape === '三角' || shape === '三角形'
    ? <path d="M0-10L11 9H-11Z"/>
    : shape === 'square' || shape === '方形' || shape === '正方形'
      ? <rect x="-9" y="-9" width="18" height="18" rx="1"/>
      : <circle r="10"/>;
}

function EngravedShape({ shape }: { shape: string }) {
  return <g className="engraved-shape" strokeLinejoin="round" strokeLinecap="round">
    <g transform="translate(0 .9)" fill="none" stroke="#f3dca4" strokeWidth="1.9" opacity=".8"><ShapeDrawing shape={shape}/></g>
    <g fill="#79603a" stroke="#52432d" strokeWidth="1.6"><ShapeDrawing shape={shape}/></g>
    <g transform="translate(0 -.35) scale(.88)" fill="none" stroke="#aa8b54" strokeWidth=".7" opacity=".6"><ShapeDrawing shape={shape}/></g>
  </g>;
}

export function ShapeIcon({ shape, size = 24 }: { shape: string; size?: number }) {
  const prefix = `stamp-${useId().replace(/:/g, '')}`;
  return <svg className="shape-icon" width={size} height={size} viewBox="-17 -17 34 34" aria-hidden="true">
    <defs><linearGradient id={prefix} x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#e5c894"/><stop offset=".4" stopColor="#c0a06b"/><stop offset=".75" stopColor="#a58a58"/><stop offset="1" stopColor="#d1b87c"/></linearGradient></defs>
    <path d="M-12-14H12L15-11V11L12 14H-12L-15 11V-11Z" transform="translate(0 1)" fill="#8e784d" opacity=".45"/>
    <path d="M-12-14H12L15-11V11L12 14H-12L-15 11V-11Z" fill={`url(#${prefix})`} stroke="#9c8455" strokeWidth=".65"/>
    <path d="M-11-11H11M-11 11H11" fill="none" stroke="#f4dfab" strokeWidth=".6" opacity=".65"/>
    <g transform="scale(.87)"><EngravedShape shape={shape}/></g>
    <path d="M-11-7l4-1m14 16 4-1" stroke="#6c5a38" strokeWidth=".5" opacity=".25"/>
  </svg>;
}

function Screw({ x, y, dark = false }: { x: number; y: number; dark?: boolean }) {
  return <g transform={`translate(${x} ${y})`}><circle r="5.5" fill={dark ? '#544532' : '#b69a62'} stroke={dark ? '#382d21' : '#5b4a2d'} strokeWidth="1"/><path d="M-2.8 2.8L2.8-2.8" stroke={dark ? '#d3ad6b' : '#51422c'} strokeWidth="1.6"/><path d="M-3-1a3 3 0 0 1 4-2" fill="none" stroke="#e6d0a0" strokeWidth=".7" opacity=".7"/></g>;
}

const previewGears: Gear[] = [
  { id: 'preview-left', label: '装饰齿轮', size: 'medium', notches: 2 },
  { id: 'preview-middle', label: '装饰齿轮', size: 'large', notches: 3 },
  { id: 'preview-right', label: '装饰齿轮', size: 'medium', notches: 1 },
];
const positions = [{ id: 'slot-1', shape: 'triangle', name: '三角', x: 302, y: 400 }, { id: 'slot-2', shape: 'circle', name: '圆形', x: 481, y: 405 }, { id: 'slot-3', shape: 'square', name: '方形', x: 658, y: 400 }];

export default function MusicBox({ installed = {}, gears = [], notes = [null, null, null, null], stage = 'preview', previewState = 'restored', finish = 'walnut', selectedGear = null, selectedNote = null, canOperate = false, marks = [], playing = false, onSlot, onNoteSlot, onPoint, highlightNote = null, winding = 0, windingAt, windingDurationMs = 1400, windingPausedAt, guideReady = false, canWind = false, canArm = false, onWind, onArm, stamps, workTitle, view = 'box' }: MusicBoxProps) {
  const prefix = `mb-${useId().replace(/:/g, '')}`;
  const preview = stage === 'preview';
  const unrepaired = preview && previewState === 'unrepaired';
  const hasNotes = preview || ['melody', 'arrange', 'launch', 'performance', 'complete'].includes(stage);
  const isOpen = true; // Repair begins with the lid already open; the final moment is the mechanism coming alive.
  const linked = !preview && Object.keys(installed).length === 3 && ['gears', 'swap', 'melody', 'arrange', 'launch'].includes(stage);
  const cherry = finish === 'cherry';
  // A stable camera keeps gears circular; depth comes from separate physical faces.
  const depthRef = useObjectDepth(view);
  const gearPlane = view === 'box' ? .8 : .92;
  const mark = marks.at(-1);
  const windingProgress = useWindingProgress(winding,windingAt,windingDurationMs,windingPausedAt);
  const launch = stage === 'launch';
  const displayNotes = unrepaired ? (['star', null, 'leaf', null] as (NoteSymbol | null)[]) : preview && !notes.some(Boolean) ? (['star', 'moon', 'leaf', 'moon'] as NoteSymbol[]) : notes;
  const safeClick = (callback: (() => void) | undefined) => (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback?.(); }
  };
  if(view==='winding')return <WindingCloseup prefix={prefix} progress={windingProgress} started={!!windingAt} guideReady={guideReady} canWind={canWind&&!windingAt&&windingProgress<1} canArm={canArm} onWind={onWind} onArm={onArm} cherry={cherry}/>;
  return <div ref={depthRef} className={`musicbox-scene stage-${stage} finish-${finish}${isOpen ? ' is-open' : ''}${playing ? ' is-playing' : ''}${preview ? ' is-preview' : ''}${unrepaired ? ' is-unrepaired' : ''}${linked ? ' is-linked' : ''}${view === 'mechanism' ? ' is-mechanism-view' : ''}`} data-view={view} data-preview-state={preview ? previewState : undefined}>
    <svg className="musicbox-svg" viewBox={view === 'mechanism' ? '185 300 650 240' : '0 50 1000 670'} role="group" aria-label={preview ? unrepaired ? '音乐盒待修预览' : '音乐盒外观预览' : view==='mechanism'?'音乐盒机芯近景操作区':'音乐盒修复操作区'}>
      <defs>
        <linearGradient id={`${prefix}-wood-front`} x1="0" y1="0" x2=".2" y2="1"><stop stopColor={cherry ? '#9b6246' : '#7d513d'}/><stop offset=".23" stopColor={cherry ? '#89533b' : '#604333'}/><stop offset=".6" stopColor={cherry ? '#74452f' : '#49352d'}/><stop offset="1" stopColor={cherry ? '#5c3527' : '#382d27'}/></linearGradient>
        <linearGradient id={`${prefix}-wood-lid`} x1="0" y1="0" x2="1" y2=".5"><stop stopColor={cherry ? '#a97855' : '#896544'}/><stop offset=".36" stopColor={cherry ? '#744830' : '#573f2d'}/><stop offset=".7" stopColor={cherry ? '#a3704c' : '#7c593b'}/><stop offset="1" stopColor={cherry ? '#734531' : '#493629'}/></linearGradient>
        <linearGradient id={`${prefix}-wood-top`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={cherry ? '#b78459' : '#a18154'}/><stop offset=".5" stopColor={cherry ? '#84573d' : '#725337'}/><stop offset="1" stopColor={cherry ? '#a2744d' : '#8e6b46'}/></linearGradient>
        <linearGradient id={`${prefix}-wood-side`} x1="0" y1="0" x2="1" y2=".25"><stop stopColor={cherry?'#75482f':'#573d2c'}/><stop offset=".38" stopColor={cherry?'#563322':'#3f3025'}/><stop offset="1" stopColor="#241f1a"/></linearGradient>
        <linearGradient id={`${prefix}-well-side`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#15251e"/><stop offset=".6" stopColor="#26372a"/><stop offset="1" stopColor="#a38a59"/></linearGradient>
        <linearGradient id={`${prefix}-brass`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#ead5a2"/><stop offset=".28" stopColor="#cfb47b"/><stop offset=".65" stopColor="#b1955f"/><stop offset="1" stopColor="#8c7043"/></linearGradient>
        <linearGradient id={`${prefix}-steel`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#778681"/><stop offset=".3" stopColor="#394945"/><stop offset=".6" stopColor="#566b62"/><stop offset="1" stopColor="#263a34"/></linearGradient>
        <linearGradient id={`${prefix}-velvet`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#263f42"/><stop offset=".6" stopColor="#172f35"/><stop offset="1" stopColor="#243c3e"/></linearGradient>
        <linearGradient id={`${prefix}-cylinder`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#80643d"/><stop offset=".18" stopColor="#ead5a1"/><stop offset=".37" stopColor="#cfb379"/><stop offset=".6" stopColor="#a38751"/><stop offset=".8" stopColor="#c7aa6f"/><stop offset="1" stopColor="#5c4b30"/></linearGradient>
        <radialGradient id={`${prefix}-lamp`}><stop stopColor="#f4d99b" stopOpacity=".18"/><stop offset=".55" stopColor="#f4d99b" stopOpacity=".055"/><stop offset="1" stopColor="#f4d99b" stopOpacity="0"/></radialGradient>
        <radialGradient id={`${prefix}-glow`}><stop stopColor="#eaddae" stopOpacity=".26"/><stop offset="1" stopColor="#d6b77a" stopOpacity="0"/></radialGradient>
        <pattern id={`${prefix}-grain`} width="137" height="26" patternUnits="userSpaceOnUse"><path d="M-8 8C22-5 54 20 82 9S126 5 145 11M-8 20C40 11 67 34 145 17" fill="none" stroke="#e2bc7c" strokeOpacity=".085" strokeWidth="1"/><path d="M-8 10C25 0 55 22 83 11S122 7 145 13" fill="none" stroke="#211d18" strokeOpacity=".22" strokeWidth=".8"/></pattern>
        <pattern id={`${prefix}-crosshatch`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="#e3e6d8" strokeOpacity=".025" strokeWidth=".6"/></pattern>
        <filter id={`${prefix}-shadow`} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="5" dy="12" stdDeviation="12" floodColor="#030c10" floodOpacity=".22"/></filter>
        <filter id={`${prefix}-inner-shadow`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0a1b1c" floodOpacity=".7"/></filter>
        <radialGradient id={`${prefix}-contact`}><stop stopColor="#081b17" stopOpacity=".38"/><stop offset=".56" stopColor="#081b17" stopOpacity=".16"/><stop offset="1" stopColor="#081b17" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${prefix}-lid-shade`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#071c19" stopOpacity=".25"/><stop offset="1" stopColor="#071c19" stopOpacity="0"/></linearGradient>
        <clipPath id={`${prefix}-front-clip`}><path d="M118 513H884L863 627Q861 638 845 638H151Q136 638 134 625Z"/></clipPath>
        <clipPath id={`${prefix}-lid-clip`}><path d="M211 132Q211 115 230 115H769Q786 115 787 133L805 307H194Z"/></clipPath>
      </defs>

      <DepthLayer name="ambient" depth={.02}>
        <ellipse className="object-lamplight" cx="430" cy="310" rx="450" ry="325" fill={`url(#${prefix}-lamp)`} pointerEvents="none"/>
        <g className="scene-decoration" fill="none" stroke="#adc6bf" strokeWidth=".8" opacity=".18" pointerEvents="none"><path d="M73 194h25m-12.5-12.5v25M880 223h18m-9-9v18"/><circle cx="135" cy="267" r="2"/><circle cx="824" cy="161" r="1.6"/></g>
      </DepthLayer>
      {/* The desk shadow is stationary: it anchors the moving object to the table. */}
      <ellipse cx="510" cy="654" rx="417" ry="36" fill={`url(#${prefix}-contact)`}/>
      <ellipse cx="508" cy="650" rx="332" ry="13" fill="#071917" opacity=".25"/>

      <DepthLayer name="lid-shell" depth={.12}>
      <g className="lid-group" filter={`url(#${prefix}-shadow)`}>
        <path d="M198 116Q198 96 220 96H780Q801 96 802 117L814 107Q813 86 792 86H232Q210 86 210 106Z" fill={`url(#${prefix}-wood-top)`} stroke="#b08c58" strokeWidth="1.2"/>
        <path d="M802 117L814 107L835 314L823 324Z" fill={`url(#${prefix}-wood-side)`} stroke="#34291f" strokeWidth="1.3"/>
        <path d="M814 111L833 311" stroke="#bb955f" strokeWidth="1" opacity=".65"/>
        <path d="M198 116Q198 96 220 96H780Q801 96 802 117L823 324H177Z" fill="#362d24" stroke="#231f1c" strokeWidth="3"/>
        <path d="M205 116Q205 103 223 103H777Q793 103 795 118L815 316H185Z" fill={`url(#${prefix}-wood-lid)`} stroke="#aa8554" strokeWidth="1.3"/>
        <path d="M211 132Q211 115 230 115H769Q786 115 787 133L805 307H194Z" fill={`url(#${prefix}-velvet)`} stroke="#c2a56b" strokeWidth="2"/>
        <path d="M220 136Q220 126 234 126H765Q777 126 778 137L795 296H205Z" fill="none" stroke="#657469" strokeOpacity=".45"/>
        <g clipPath={`url(#${prefix}-lid-clip)`}>
          <rect x="190" y="110" width="625" height="205" fill={`url(#${prefix}-crosshatch)`}/>
          <DepthLayer name="lid-orbits" depth={.16}>
          <ellipse cx="497" cy="280" rx="223" ry="103" fill="none" stroke="#a6a889" strokeOpacity=".2" strokeDasharray="2 7"/>
          <path d="M281 284A220 107 0 0 1 716 284" fill="none" stroke="#b7a66e" strokeWidth="1.4" opacity=".6"/>
          <path d="M302 283A198 92 0 0 1 692 283" fill="none" stroke="#b7a66e" strokeWidth=".6" opacity=".3"/>
          </DepthLayer>
          <DepthLayer name="lid-sky" depth={.035}>
          {[{x:267,y:163,r:1.6},{x:346,y:151,r:1.1},{x:398,y:198,r:1.7},{x:468,y:145,r:1.4},{x:565,y:167,r:1.7},{x:625,y:146,r:1},{x:725,y:180,r:1.8},{x:747,y:248,r:1.1},{x:249,y:245,r:1},{x:361,y:244,r:1.3},{x:666,y:229,r:1.2},{x:538,y:211,r:1}].map((s,i)=><circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#c9c5a5" opacity=".65"/>)}
          <g stroke="#d7c998" strokeWidth="1" opacity=".8"><path d="M326 188h12m-6-6v12M673 177h10m-5-5v10M582 258h9m-4.5-4.5v9"/></g>
          <g transform="translate(497 168)" opacity=".55"><path d="M-19 2H-8m16 0h11M0-6v16" stroke="#cdb782" strokeWidth=".8"/><circle r="3" fill="none" stroke="#cdb782" strokeWidth=".8"/></g>
          </DepthLayer>
        </g>
        <path d="M194 307H805L815 320H184Z" fill="#6e5539" stroke="#bd9d65" strokeWidth=".8"/>
        <path d="M177 324H823L829 335H171Z" fill={`url(#${prefix}-wood-side)`} stroke="#5c4832" strokeWidth=".8"/>
        <path d="M207 113H789M191 309H810" stroke="#dfc18a" strokeWidth="1" opacity=".45"/>
        <Screw x={217} y={123}/><Screw x={780} y={123}/><Screw x={201} y={301}/><Screw x={799} y={301}/>
        <g className="lid-catch"><rect x="468" y="99" width="64" height="16" rx="3" fill={`url(#${prefix}-brass)`} stroke="#51452e"/><path d="M481 103h37v7h-37Z" fill="#3a392c"/><path d="M487 106h25" stroke="#a89663"/></g>
      </g>
      </DepthLayer>

      <g className="hinges" fill={`url(#${prefix}-brass)`} stroke="#57482c"><rect x="258" y="306" width="65" height="28" rx="3"/><rect x="678" y="306" width="65" height="28" rx="3"/><path d="M260 319h62m358 0h61" stroke="#f0d49b" strokeWidth="2"/><Screw x={268} y={312}/><Screw x={314} y={312}/><Screw x={688} y={312}/><Screw x={734} y={312}/></g>

      <DepthLayer name="wood-shell" depth={.28}>
      <g className="box-body" filter={`url(#${prefix}-shadow)`}>
        {view==='box'&&<g className="box-right-depth">
          <path d="M813 321L838 330L916 522L890 647L863 638L884 513Z" fill={`url(#${prefix}-wood-side)`} stroke="#332a20" strokeWidth="1.4"/>
          <path d="M838 333L909 519L887 633" fill="none" stroke="#ac8553" strokeWidth="1.2" opacity=".48"/>
          <path d="M889 535L873 623M897 539L881 623" stroke="#c39b61" strokeWidth=".7" opacity=".2"/>
          <path d="M888 513L913 522L908 543L884 536Z" fill={`url(#${prefix}-brass)`} stroke="#685334" strokeWidth=".8"/>
          <path d="M868 620L894 615L889 642L863 649Z" fill={`url(#${prefix}-brass)`} stroke="#685334" strokeWidth=".8"/>
        </g>}
        <g>
        <path d="M183 325H817L902 520H98Z" fill="#2d2921" stroke="#262720" strokeWidth="3"/>
        <path d="M187 321H813L890 509H110Z" fill={`url(#${prefix}-wood-top)`} stroke="#a7895c" strokeWidth="1.5"/>
        <path d="M187 321H813L890 509H110Z" fill={`url(#${prefix}-grain)`}/>
        <path d="M211 340H789L850 488H150Z" fill="#1e2e2b" stroke="#473e2c" strokeWidth="5"/>
        <path d="M211 340H789L777 354H223Z" fill="#10251e" stroke="#5e6548" strokeWidth=".8"/>
        <path d="M211 340L223 354L177 470L150 488Z" fill={`url(#${prefix}-well-side)`} stroke="#706b46" strokeWidth=".7"/>
        <path d="M789 340L850 488L825 470L777 354Z" fill="#15271f" stroke="#666648" strokeWidth=".7"/>
        <path d="M150 488H850L825 470H177Z" fill="#94784b" stroke="#c3a773" strokeWidth="1"/>
        <path d="M223 354H777L825 470H177Z" fill={`url(#${prefix}-steel)`} stroke="#a8915c" strokeWidth="1.4"/>
        <path d="M223 355H777L790 386H210Z" fill={`url(#${prefix}-lid-shade)`}/>
        <path d="M223 355H777M177 470H825" stroke="#d0d0a9" strokeOpacity=".3"/>
        <path d="M208 338H792L854 489H146Z" fill="none" stroke={`url(#${prefix}-brass)`} strokeWidth="4"/>
        <path d="M218 347H781M157 484H844" stroke="#efd7a1" strokeWidth=".8" opacity=".65"/>
        </g>
        <path d="M118 513H884L863 627Q861 638 845 638H151Q136 638 134 625Z" fill={`url(#${prefix}-wood-front)`} stroke="#2a2721" strokeWidth="2"/>
        <path d="M118 513H884L863 627Q861 638 845 638H151Q136 638 134 625Z" fill={`url(#${prefix}-grain)`}/>
        <g clipPath={`url(#${prefix}-front-clip)`} fill="none">
          <path d="M124 527H878M127 534H877M136 615H865M139 623H863" stroke="#d0a36b" strokeOpacity=".27" strokeWidth="1"/>
          <path d="M164 542V607H834V542Z" stroke="#cfaa6f" strokeOpacity=".35" strokeWidth="1"/>
          <path d="M170 548V601H828V548Z" stroke="#251e19" strokeOpacity=".7" strokeWidth="1"/>
          <path d="M179 555H310M690 555H818M179 593H310M690 593H818" stroke="#b88c5b" strokeOpacity=".25"/>
          <path d="M145 575C235 557 288 588 371 579M627 563C691 553 736 577 850 565M661 583C732 572 776 594 872 583" stroke="#1c1b18" strokeOpacity=".25" strokeWidth="1"/>
        </g>
        <path d="M113 512H889" stroke="#e2bb7e" strokeWidth="2" opacity=".65"/>
        <path d="M140 636H859" stroke="#a47e52" strokeWidth="2" opacity=".4"/>
        <path d="M140 635H860L853 648H147Z" fill="#291f19" stroke="#6f5136" strokeWidth="1"/><path d="M147 639H852" stroke="#ba935b" strokeWidth="1.2" opacity=".55"/>
        <path d="M159 638L164 654Q179 660 193 654L199 638M800 638L807 654Q822 660 837 653L842 638" fill="#342b23" stroke="#69503a"/>
        <path d="M164 645h30m615 0h28" stroke="#b5925b" strokeWidth="2"/>
        <g className="brass-corners" fill={`url(#${prefix}-brass)`} stroke="#665235" strokeWidth=".8"><path d="M117 513H147L155 543H132Z"/><path d="M853 513H884L878 544H850Z"/><path d="M135 609L158 611L164 638H149Q138 638 136 627Z"/><path d="M844 611L866 609L863 628Q862 638 850 638H839Z"/></g>
        <Screw x={135} y={526} dark/><Screw x={867} y={526} dark/><Screw x={150} y={623} dark/><Screw x={853} y={623} dark/>
        <DepthLayer name="metal-plate" depth={.85}>
        {stamps || workTitle ? <g className="makers-plate signed-plate" transform="translate(500 574)" data-testid="work-stamps" role="img" aria-label={`共同刻印 A ${stampNames[stamps?.A || 'sprout']}、B ${stampNames[stamps?.B || 'spark']}；${workTitle || '合拍修理铺'}`}>
          <ellipse cx="3" cy="8" rx="158" ry="37" fill={`url(#${prefix}-contact)`}/>
          <path d="M-139-33H139L149-22V22L139 33H-139L-149 22V-22Z" transform="translate(1.5 3.5)" fill="#725832"/>
          <path d="M-139-33H139L149-22V22L139 33H-139L-149 22V-22Z" fill={`url(#${prefix}-brass)`} stroke="#e5ce96" strokeWidth="1"/>
          <path d="M-134-27H134L142-18V18L134 27H-134L-142 18V-18Z" fill="#c2a671" stroke="#655638" strokeWidth=".8"/>
          <path d="M-126-24H126M-128 25H128" stroke="#f0dba6" strokeWidth=".7" opacity=".6"/>
          <Screw x={-134} y={0}/><Screw x={134} y={0}/>
          {(['A','B'] as Identity[]).map((identity,index) => <g key={identity} transform={`translate(${index === 0 ? -107 : 107} 0)`} className="engraved-stamp"><g transform="translate(0 .8)" fill="none" stroke="#efd7a0" strokeWidth="2"><StampDrawing stamp={stamps?.[identity] || (identity === 'A' ? 'sprout' : 'spark')}/></g><g fill="none" stroke="#665239" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><StampDrawing stamp={stamps?.[identity] || (identity === 'A' ? 'sprout' : 'spark')}/></g><text y="26" textAnchor="middle" className="stamp-identity">{identity}</text></g>)}
          <text y="-4" textAnchor="middle" className="box-brand">合 拍 修 理 铺</text>
          <text y="18" textAnchor="middle" className="box-work-title" textLength={workTitle && workTitle.length > 17 ? 176 : undefined} lengthAdjust="spacingAndGlyphs">{workTitle || '共同修复 · 留下两枚小印记'}</text>
        </g> : <g className="makers-plate" transform="translate(500 574)"><ellipse cx="3" cy="6" rx="124" ry="33" fill={`url(#${prefix}-contact)`}/><path d="M-107-27H107L115-18V18L107 27H-107L-115 18V-18Z" transform="translate(1.5 3)" fill="#735a35"/><path d="M-107-27H107L115-18V18L107 27H-107L-115 18V-18Z" fill="#b49b68" stroke="#e5ce96" strokeWidth=".8"/><path d="M-104-22H104L109-16V16L104 22H-104L-109 16V-16Z" fill="none" stroke="#655638" strokeWidth=".8"/><Screw x={-98} y={0}/><Screw x={98} y={0}/><text y="0" textAnchor="middle" className="box-brand">合 拍 修 理 铺</text><text y="16" textAnchor="middle" className="box-serial">MADE TOGETHER · NO. 001</text></g>}
        </DepthLayer>
      </g>
      </DepthLayer>

      <DepthLayer name="crank" depth={1}>
      <WindingCrank prefix={prefix} active={launch && view !== 'mechanism'} progress={windingProgress} started={!!windingAt} enabled={canWind && !windingAt && windingProgress<1} onWind={onWind}/>
      </DepthLayer>

      <DepthLayer name="back-mechanics" depth={.24}>
      <g className="back-mechanics">
        <path d="M236 342L268 314H734L766 342Z" fill="#3a4a3f" stroke="#8b8d66"/>
        <rect x="300" y="316" width="401" height="25" rx="9" fill={`url(#${prefix}-cylinder)`} stroke="#57492c"/>
        <ellipse cx="304" cy="328" rx="8" ry="12" fill="#9a804e" stroke="#d7c18c"/><ellipse cx="697" cy="328" rx="8" ry="12" fill="#a88f59" stroke="#e1cb96"/>
        <g className="cylinder-pins" fill="#f4dfab">{Array.from({length:31},(_,i)=><g key={i}><circle cx={319+i*12} cy={322+(i%3)*3} r="1.4"/>{i%2===0&&<circle cx={323+i*12} cy="335" r="1.1"/>}</g>)}</g>
        <path d="M321 344H680L699 357H301Z" fill={`url(#${prefix}-brass)`} stroke="#665333" strokeWidth=".8"/>
        {Array.from({length:26},(_,i)=><path key={i} d={`M${323+i*13.5} 345l-3 10`} stroke="#59482d" strokeWidth="1"/>)}
        <path d="M289 321H276V346M709 322H722V346" fill="none" stroke="#b9a06b" strokeWidth="6"/>
      </g>

      </DepthLayer>
      <PaperTheatre prefix={prefix}/>

      <DepthLayer name="gears" depth={.6}>
      <g className="mechanism-deck">
        <path d="M219 367H782L821 469H180Z" fill="#1b302d" fillOpacity=".4" stroke="#71816b" strokeOpacity=".5"/>
        <g className="drive-train" fill="none" stroke="#a69565" strokeWidth="1" opacity=".35"><path d="M248 411H749M247 414H752"/><circle cx="390" cy="412" r="6"/><circle cx="570" cy="412" r="6"/></g>
        <g fill="#b6a87c"><circle cx="240" cy="383" r="2"/><circle cx="764" cy="383" r="2"/><circle cx="206" cy="459" r="2"/><circle cx="798" cy="459" r="2"/></g>
        {positions.map((position, index) => {
          const gear = preview ? unrepaired && index === 1 ? undefined : previewGears[index] : gears.find(item => item.id === installed[position.id]);
          const marked = mark?.target === position.id;
          const callback = !preview && stage === 'gears' ? canOperate ? () => onSlot?.(position.id) : onPoint ? () => onPoint(position.id) : undefined : undefined;
          return <g key={position.id} className={`mechanism-slot${gear ? ' is-installed' : ''}${marked ? ' is-marked' : ''}${selectedGear && canOperate ? ' can-place' : ''}`} transform={`translate(${position.x} ${position.y})`}>
            <ellipse cy="7" rx="65" ry="58" fill="#122420" stroke="#607360" strokeWidth="1"/>
            <ellipse rx="54" ry={54*gearPlane} fill="#132720" stroke="#a09369" strokeWidth="1.5"/><ellipse cy="3" rx="49" ry={47*gearPlane} fill="#1d342a" stroke="#081e19" strokeWidth="2"/>
            <ellipse rx="49" ry={49*gearPlane} fill="none" stroke="#b9ad7c" strokeWidth=".7" strokeDasharray="2 6" opacity=".4"/>
            <g className="slot-brass-seat" pointerEvents="none">
              <path d="M-21 43Q0 50 21 43L33 54V69L26 76H-26L-33 69V54Z" transform="translate(0 2)" fill="#0d201d" opacity=".8"/>
              <path d="M-21 43Q0 50 21 43L33 54V69L26 76H-26L-33 69V54Z" fill={`url(#${prefix}-brass)`} stroke="#6b5735" strokeWidth="1.2"/>
              <path d="M-22 51H22L28 56V67L23 71H-23L-28 67V56Z" fill="#c0a36c" stroke="#81683f" strokeWidth=".8"/>
              <path d="M-22 52H22M-25 73H25" stroke="#efd7a2" strokeWidth=".9" opacity=".7"/>
              <path d="M-18 54l9-1M12 70l7-1M-27 60l4-1" stroke="#f3dda9" strokeWidth=".65" opacity=".3"/>
              <g transform="translate(-24 62) scale(.51)"><Screw x={0} y={0} dark/></g>
              <g transform="translate(24 62) scale(.51)"><Screw x={0} y={0} dark/></g>
            </g>
            {!gear && (unrepaired ? <g className="missing-preview-gear" data-testid="preview-missing-gear" role="img" aria-label="中央齿轮缺位，轴座等待修复">
              <circle r="40" fill="#142923" stroke="#5e705a" strokeWidth="1.2"/>
              <circle r="35" fill="#1b3028" stroke="#a3986e" strokeWidth=".65" strokeOpacity=".45"/>
              <path d="M-37-10A38 38 0 0 1-13-36M30 22A37 37 0 0 1 7 37" fill="none" stroke="#c2ae7a" strokeWidth="1.1" opacity=".35"/>
              <path d="M-27-19l7-3m37 43 7-3M-26 20l5-4" stroke="#c5b488" strokeWidth=".6" opacity=".25"/>
              <circle r="15" fill="#0b201b" stroke="#655c3e" strokeWidth="2"/>
              <circle cy="-1" r="10.5" fill={`url(#${prefix}-brass)`} stroke="#c7b77e" strokeWidth=".7"/>
              <path d="M-5-4H5V3L0 6L-5 3Z" fill="#25392c" stroke="#665b39" strokeWidth="1"/>
              <path d="M-4-3H4" stroke="#e2d3a0" strokeWidth=".7" opacity=".6"/>
              {[[-26,-23],[26,23],[-26,23],[26,-23]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><circle r="2.2" fill="#0d211b" stroke="#6f7657" strokeWidth=".7"/><path d="M-1.2 0h2.4" stroke="#a89a70" strokeWidth=".6"/></g>)}
            </g> : <g className="empty-socket"><circle r="9" fill="#0f2422" stroke="#8e9976" strokeWidth="2"/><path d="M-5 0H5M0-5V5" stroke="#a7ab85" strokeWidth="1.3"/><circle r="34" fill="none" stroke="#859073" strokeOpacity=".3" strokeDasharray="3 5"/></g>)}
            {gear && <ellipse cy="6" rx={gear.size==='large'?55:gear.size==='medium'?45:36} ry={(gear.size==='large'?50:gear.size==='medium'?41:32)*gearPlane} fill={`url(#${prefix}-contact)`} pointerEvents="none"/>}
            {gear && <g className="gear-lift"><g className="installed-gear" key={gear.id} transform={`scale(1.22 ${1.22*gearPlane})`}><GearDrawing gear={gear} prefix={`${prefix}-${index}`}/><circle className="install-flash" r="46" fill="none" stroke="#ffe2a0" strokeWidth="2"/></g></g>}
            <g className="slot-symbol" transform="translate(0 62)" pointerEvents="none"><g className="slot-symbol-scale"><EngravedShape shape={position.shape}/></g></g>
            {marked && <g key={mark.at} className={`partner-marker${mark.text === '这里' || mark.text === '对，就放这里' ? ' pencil-mark' : ''}`} pointerEvents="none"><path className="pencil-circle" d="M-55-22C-37-63 36-65 57-25C85 23 29 68-25 55C-70 44-76-4-55-22Z"/><circle r="62"/><circle r="69"/><path d="M-7-73L0-66L7-73"/><text y="-83" textAnchor="middle">{mark.by} · {mark.text}</text></g>}
            {!preview && <g className="slot-hit" role="button" tabIndex={callback ? 0 : -1} data-slot={position.id} data-testid={`slot-${position.id}`} aria-label={`${position.name}插槽${gear ? '，已安装' : ''}${canOperate ? '，尝试放置选中齿轮' : '，标记给伙伴'}`} aria-disabled={!callback} onClick={callback} onKeyDown={safeClick(callback)}><title>{gear ? '已安装的机芯零件' : canOperate ? '可以尝试放置' : '标记这个位置'}</title><circle r="71" fill="transparent"/><circle className="slot-hover-ring" r="62" fill="transparent" stroke="#e7c888" strokeWidth="1.5"/></g>}
          </g>;
        })}
        <g className="spring-coil" transform="translate(777 429)"><circle r="20" fill="#273830" stroke="#ab9767" strokeWidth="1.5"/><path d="M0 0c4-5 10 3 4 8c-9 7-22-6-14-16c11-14 33 4 20 20" fill="none" stroke="#9f956c" strokeWidth="1.5"/><circle r="2.5" fill="#c5b782"/></g>
        <g transform="translate(221 442)"><path d="M-18 9H14L20-9H-14Z" fill={`url(#${prefix}-brass)`} stroke="#625437"/><path d="M-10-5L-12 6M-2-5L-4 6M6-5L4 6" stroke="#eee0ad" strokeWidth="1"/></g>
      </g>

      </DepthLayer>
      <DepthLayer name="melody-front" depth={.8}>
      {hasNotes ? <g className="melody-rail">
        <path d="M250 520H752V526H250Z" fill="#172b24" stroke="#806f48" strokeWidth=".8"/>
        <path d="M267 474H735L752 520H250Z" fill="#273c34" stroke="#b6a06b" strokeWidth="1.2"/>
        <path d="M272 479H730M259 514H744" stroke="#71836c" opacity=".6"/>
        {[0,1,2,3].map(index => {
          const symbol = displayNotes[index];
          const target = `note-${index}`;
          const marked = mark?.target === target;
          const callback = !preview && stage === 'melody' ? canOperate ? () => onNoteSlot?.(index) : onPoint ? () => onPoint(target) : undefined : undefined;
          return <g key={index} className={`note-slot${highlightNote === index ? ' is-sounding' : ''}${marked ? ' is-marked' : ''}${selectedNote && canOperate ? ' can-place' : ''}`} transform={`translate(${327+index*116} 493)`}>
            <path d="M-43-17H43L49 18H-49Z" fill={symbol ? `url(#${prefix}-brass)` : '#1a2d28'} stroke={symbol ? '#d6c38e' : '#73866d'} strokeWidth="1.2"/>
            <path d="M-40 14H41" stroke={symbol ? '#69532f' : '#4e6656'} strokeWidth="1"/>
            {symbol ? <g className={`note-drawing note-${symbol}`} transform="translate(0 0) scale(.55)"><NoteDrawing symbol={symbol}/></g> : unrepaired ? <g className="preview-note-gap" aria-label="声音片尚未接回"><path d="M-32 0H-14M14 0H32" stroke="#88916c" strokeWidth=".8" opacity=".5"/><circle cx="-34" r="2" fill="#0b211b" stroke="#7e815a" strokeWidth=".7"/><circle cx="34" r="2" fill="#0b211b" stroke="#7e815a" strokeWidth=".7"/><path d="M-4 0H4" stroke="#b5a778" strokeWidth="1" opacity=".65"/></g> : <text y="5" textAnchor="middle" className="note-number">0{index+1}</text>}
            {marked&&<g className="note-partner-marker" pointerEvents="none"><path d="M-48-23H48L56 23H-56Z"/><text y="-30" textAnchor="middle">{mark.by} · {mark.text}</text></g>}
            {!preview && <g className="note-hit" role="button" tabIndex={callback ? 0 : -1} data-note-slot={index} data-testid={`note-slot-${index}`} aria-label={`旋律槽${index+1}${symbol ? `，${symbolNames[symbol]}` : '，空'}${canOperate ? '，放入选中声音片' : '，标记给伙伴'}`} onClick={callback} onKeyDown={safeClick(callback)}><title>{canOperate ? '可以尝试放置声音片' : '标记这个位置'}</title><rect x="-72" y="-62" width="144" height="144" fill="transparent"/><path className="note-hover-ring" d="M-46-21H46L53 22H-53Z" fill="none" stroke="#f1d394" strokeWidth="2"/></g>}
          </g>;
        })}
      </g> : <g className="front-comb" opacity=".75"><path d="M290 479H714L725 509H279Z" fill={`url(#${prefix}-brass)`} stroke="#625137"/>{Array.from({length:35},(_,i)=><path key={i} d={`M${296+i*12} 483l-2 20`} stroke="#655638" strokeWidth="1.3"/>)}<path d="M286 506H720" stroke="#e9d3a0" strokeWidth="1"/></g>}

      </DepthLayer>
      {launch && <g className={`launch-mechanism${guideReady ? ' is-armed' : ''}`} transform="translate(780 379)" role="button" tabIndex={canArm ? 0 : -1} aria-label={guideReady ? '机芯准备按键，已确认' : '轻按机芯按键，确认准备'} aria-disabled={!canArm || guideReady} data-testid="launch-lever" onClick={() => { if (canArm && !guideReady) onArm?.(); }} onKeyDown={safeClick(canArm && !guideReady ? onArm : undefined)}>
        <g pointerEvents="none"><rect x="-26" y="-32" width="52" height="64" rx="12" fill={`url(#${prefix}-brass)`} stroke="#665236" strokeWidth="1.2"/><circle cy="3" r="18" fill="#10291f" stroke="#927e50" strokeWidth="1.5"/>
        <g className="ready-pressure" transform={`translate(0 ${guideReady?3:0})`}><circle r="17" fill={guideReady?'#dfd59a':'#96a180'} stroke="#655a38" strokeWidth="1.1"/><path d="M-7 0L-2 5L8-6" fill="none" stroke={guideReady?'#667d4f':'#ced4b4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>
        <circle cy="-23" r="2.5" fill={guideReady?'#dfd396':'#5d7454'}/><text y="51" textAnchor="middle" className="launch-lever-label">{guideReady ? '机芯已就绪' : '轻按准备'}</text></g>
        <circle className="launch-lever-hit" r="72" fill="transparent"/>
      </g>}

      <g className="surface-screws"><Screw x={223} y={353}/><Screw x={777} y={353}/><Screw x={170} y={476}/><Screw x={831} y={476}/></g>
      {playing && <g className="sound-traces" fill="none" stroke="#e4d39c" strokeWidth="1.1"><path d="M121 291Q101 265 122 242M107 304Q73 266 106 229M872 282Q892 256 874 235M888 295Q919 257 889 219"/></g>}
      {preview && <g className="preview-engraving"><path d="M337 693H414M586 693H663" stroke="#8e9a83" strokeWidth=".7" opacity=".4"/><text x="500" y="697" textAnchor="middle">一只音乐盒，等两双手</text></g>}
    </svg>
  </div>;
}
