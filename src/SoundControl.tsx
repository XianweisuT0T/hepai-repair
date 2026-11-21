import { useEffect, useId, useRef, useState } from 'react';

type Props = { muted:boolean; volume:number; onToggle:()=>void; onVolume:(volume:number)=>void };

export default function SoundControl({muted,volume,onToggle,onVolume}:Props){
  const [open,setOpen]=useState(false);
  const control=useRef<HTMLDivElement>(null), button=useRef<HTMLButtonElement>(null);
  const panelId=useId();
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!control.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(control.current?.contains(document.activeElement))button.current?.focus({preventScroll:true});
      setOpen(false);
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div ref={control} className="sound-control" role="group" aria-label="声音控制"
    onPointerEnter={event=>{if(event.pointerType==='mouse')setOpen(true);}}
    onPointerLeave={event=>{if(event.pointerType==='mouse'&&!event.buttons)setOpen(false);}}
    onFocus={event=>{if(event.target.matches(':focus-visible'))setOpen(true);}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={button} className="icon-button" onClick={()=>{setOpen(true);onToggle();}}
      aria-label={muted?'点击开启声音':'静音'} title={muted?'点击开启声音':'静音'} aria-expanded={open} aria-controls={panelId}>
      {muted?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8q6 4 0 8M17 4q12 8 0 16"/></svg>}
    </button>
    <div id={panelId} className="sound-volume-panel" hidden={!open}>
      <input className="sound-volume" aria-label="音量" aria-valuetext={`${Math.round(volume/.6*100)}%`} type="range" min="0" max="0.6" step="0.02" value={volume} onChange={event=>onVolume(Number(event.target.value))}/>
    </div>
  </div>;
}
