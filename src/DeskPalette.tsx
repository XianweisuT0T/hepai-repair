import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { applyDeskColor, colorFromHex, colorHex, DESK_COLOR_KEY, deskPresets, readDeskColor, type DeskColor } from './deskColors';
export { restoreDeskPalette } from './deskColors';
function PaletteIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2.2 2.2 0 0 0 1.3-4c-.8-.6-.3-2 1-2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6.8" r=".7"/><circle cx="14.5" cy="7" r=".7"/><circle cx="17" cy="10.5" r=".7"/></svg>;}

/** Personal cloth only: no room command and no changes to the music-box material. */
export default function DeskPalette(){
  const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [color,setColor]=useState(readDeskColor),current=useRef(color),pointer=useRef<number|null>(null);
  const [open,setOpen]=useState(false),[dragging,setDragging]=useState(false);
  const hex=colorHex(color),preset=deskPresets.find(p=>p.hex===hex);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const sheet=panel.current,button=trigger.current;if(!sheet||!button)return;
      const r=button.getBoundingClientRect();sheet.style.top=`${Math.max(12,Math.min(r.bottom+10,window.innerHeight-sheet.offsetHeight-12))}px`;
    };
    const resize=new ResizeObserver(place);resize.observe(panel.current!);place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{resize.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  function choose(next:DeskColor){
    current.current=next;setColor(next);applyDeskColor(next);
    try{localStorage.setItem(DESK_COLOR_KEY,JSON.stringify(next));}catch{/* Keep the current visit usable without storage. */}
  }
  function pick(event:PointerEvent<HTMLDivElement>){
    const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;
    const distance=Math.hypot(x,y),h=distance<1?current.current.h:(Math.atan2(x,-y)*180/Math.PI+360)%360;
    choose({...current.current,h,s:Math.min(100,distance/(rect.width/2)*100)});
  }
  function keyboard(event:KeyboardEvent<HTMLDivElement>){
    const step=event.shiftKey?10:1,c=current.current;
    if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='ArrowRight'||event.key==='ArrowLeft')choose({...c,h:(c.h+(event.key==='ArrowRight'?step:-step)+360)%360});
    else if(event.key==='ArrowUp'||event.key==='ArrowDown')choose({...c,s:Math.max(0,Math.min(100,c.s+(event.key==='ArrowUp'?step:-step)))});
    else choose({...c,h:event.key==='Home'?0:359});
  }
  function release(){pointer.current=null;setDragging(false);}
  function close(){panel.current?.hidePopover();trigger.current?.focus();}
  return <>
    <button ref={trigger} className="desk-palette-trigger" popoverTarget={id} aria-label="桌布配色" title="桌布配色" aria-expanded={open} data-testid="desk-palette-open"><PaletteIcon/><span>换块桌布</span></button>
    <div id={id} ref={panel} className="desk-palette" popover="auto" aria-label="桌布调色盘" onToggle={event=>{setOpen(event.newState==='open');if(event.newState!=='open')release();}}>
      <div className="desk-palette-heading"><h2>调一块自己的桌布</h2><button onClick={close} aria-label="收起色样册"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <div className="desk-presets" role="group" aria-label="店里的配色">
        {deskPresets.map(p=><button key={p.id} className="desk-preset" aria-pressed={p.hex===hex} onClick={()=>choose(colorFromHex(p.hex))} data-testid={`desk-palette-${p.id}`}><i className="desk-preset-dot" style={{background:p.hex}} aria-hidden="true"/><span>{p.name}</span>{p.hex===hex&&<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>}</button>)}
      </div>
      <div className={`desk-color-wheel${dragging?' is-dragging':''}`} role="slider" tabIndex={0} aria-label="背景色盘" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(color.h)%360} aria-valuetext={`色相 ${Math.round(color.h)} 度，浓淡 ${Math.round(color.s)}%，${hex}`} aria-describedby={`${id}-wheel-help`}
        onPointerDown={event=>{if(event.button!==0||pointer.current!==null)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);pick(event);}}
        onPointerMove={event=>{if(event.pointerId===pointer.current)pick(event);}}
        onPointerUp={event=>{if(event.pointerId===pointer.current)release();}} onPointerCancel={event=>{if(event.pointerId===pointer.current)release();}} onLostPointerCapture={event=>{if(event.pointerId===pointer.current)release();}} onKeyDown={keyboard}>
        <span className="desk-wheel-thumb" style={{left:`${50+Math.sin(color.h*Math.PI/180)*color.s/2}%`,top:`${50-Math.cos(color.h*Math.PI/180)*color.s/2}%`,background:hex}}/>
      </div>
      <span id={`${id}-wheel-help`} className="manual-sr-only">拖动选择颜色。左右方向键调色相，上下方向键调浓淡。按住 Shift 每次调整十格。</span>
      <div className="desk-color-current"><i style={{background:hex}} aria-hidden="true"/><span>{preset?.name??'我的颜色'}</span><output aria-label="当前背景颜色">{hex.toUpperCase()}</output></div>
      <label className="desk-color-range"><span>浓淡</span><input aria-label="颜色浓淡" type="range" min="0" max="100" step="1" value={color.s} onChange={event=>choose({...current.current,s:Number(event.target.value)})} style={{'--range-start':colorHex({...color,s:0}),'--range-end':colorHex({...color,s:100})} as CSSProperties}/></label>
      <label className="desk-color-range"><span>明暗</span><input aria-label="背景明暗" type="range" min="0" max="100" step="1" value={color.v} onChange={event=>choose({...current.current,v:Number(event.target.value)})} style={{'--range-start':'#000','--range-end':colorHex({...color,v:100})} as CSSProperties}/></label>
      <p className="desk-palette-note">拖动选色，再调浓淡和明暗。仅自己可见。</p>
    </div>
  </>;
}
