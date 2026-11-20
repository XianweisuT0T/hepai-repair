import { useEffect, useState } from 'react';

/** Keep the cue briefly after success so it fades instead of interrupting the action. */
export default function OperationCue({text,done,kind,memoryKey}:{text:string;done:boolean;kind:'turn'|'slide'|'place';memoryKey:string}){
  const storageKey=`hepai-guide-v1:${memoryKey}`;
  const [hidden,setHidden]=useState(()=>{try{return done||localStorage.getItem(storageKey)==='seen';}catch{return done;}});
  const [reviewing,setReviewing]=useState(false);
  function remember(){try{localStorage.setItem(storageKey,'seen');}catch{/* Guidance remains usable without storage. */}}
  useEffect(()=>{if(!done)return;remember();const timer=setTimeout(()=>{setHidden(true);setReviewing(false);},400);return()=>clearTimeout(timer);},[done,storageKey]);
  if(hidden)return <div className="operation-cue operation-cue-closed"><button data-testid="guide-reopen" onClick={()=>{setReviewing(true);setHidden(false);}}>重新查看引导</button></div>;
  return <div className={`operation-cue${done&&!reviewing?' learned':''}`} data-testid="operation-cue">
    <svg viewBox="0 0 28 28" aria-hidden="true">{kind==='turn'?<path d="M22 14a9 9 0 1 0-5 8M22 5v9h-9"/>:kind==='slide'?<path d="M4 14h20m-6-6 6 6-6 6"/>:<path d="M14 3v14m-5-5 5 5 5-5M5 21v4h18v-4"/>}</svg><span>{text}</span>
    <button data-testid="guide-skip" onClick={()=>{remember();setHidden(true);setReviewing(false);}}>{reviewing?'收起引导':'跳过引导'}</button>
  </div>;
}
