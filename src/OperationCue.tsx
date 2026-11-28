import { useEffect, useRef, useState } from 'react';
import { useGuideDismissed } from './apprenticeGuide';
import { RepairComic, warmRepairComic } from './RepairNoteArt';

/** Keep the cue briefly after success so it fades instead of interrupting the action. */
export default function OperationCue({text,done,kind,memoryKey,visible=true,successText='第一枚齿轮，咬合了。接着试试下一枚吧。'}:{text:string;done:boolean;kind:'turn'|'slide'|'place';memoryKey:string;visible?:boolean;successText?:string}){
  const [hidden,setHidden]=useGuideDismissed(memoryKey);
  const [reviewing,setReviewing]=useState(false);
  const [success,setSuccess]=useState(false),previousDone=useRef(done);
  useEffect(()=>{if(!done&&!hidden)warmRepairComic();},[done,hidden]);
  useEffect(()=>{if(done&&!previousDone.current&&!hidden){setSuccess(true);setReviewing(false);}previousDone.current=done;},[done,hidden]);
  useEffect(()=>{if(!success)return;const timer=setTimeout(()=>{setSuccess(false);setHidden(true);},2600);return()=>clearTimeout(timer);},[success,setHidden]);
  useEffect(()=>{function review(){setSuccess(false);setReviewing(true);setHidden(false);}window.addEventListener('hepai-guide-review',review);return()=>window.removeEventListener('hepai-guide-review',review);},[setHidden]);
  // Temporarily conceal during a camera/lid gesture without losing a reopened cue.
  if(!visible)return null;
  if(success)return <div className="operation-cue operation-celebration" data-testid="first-repair-feedback" role="status"><RepairComic scene={2}/><span>{successText}</span></div>;
  if(hidden||done&&!reviewing)return <div className="operation-cue operation-cue-closed"><button data-testid="guide-reopen" onClick={()=>{setReviewing(true);setHidden(false);}}>重新查看引导</button></div>;
  return <div className="operation-cue" data-testid="operation-cue">
    <svg viewBox="0 0 28 28" aria-hidden="true">{kind==='turn'?<path d="M22 14a9 9 0 1 0-5 8M22 5v9h-9"/>:kind==='slide'?<path d="M4 14h20m-6-6 6 6-6 6"/>:<path d="M14 3v14m-5-5 5 5 5-5M5 21v4h18v-4"/>}</svg><span className="operation-copy">{text}</span>
    <button data-testid="guide-skip" onClick={()=>{setHidden(true);setReviewing(false);}}>{reviewing?'收起引导':'跳过引导'}</button>
  </div>;
}
