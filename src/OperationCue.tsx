import { useEffect, useState } from 'react';

/** Keep the cue briefly after success so it fades instead of interrupting the action. */
export default function OperationCue({text,done,kind}:{text:string;done:boolean;kind:'turn'|'slide'|'place'}){
  const [hidden,setHidden]=useState(done);
  useEffect(()=>{if(!done){setHidden(false);return;}const timer=setTimeout(()=>setHidden(true),400);return()=>clearTimeout(timer);},[done]);
  if(hidden)return null;
  return <p className={`operation-cue${done?' learned':''}`} data-testid="operation-cue" aria-hidden={done}>
    <svg viewBox="0 0 28 28" aria-hidden="true">{kind==='turn'?<path d="M22 14a9 9 0 1 0-5 8M22 5v9h-9"/>:kind==='slide'?<path d="M4 14h20m-6-6 6 6-6 6"/>:<path d="M14 3v14m-5-5 5 5 5-5M5 21v4h18v-4"/>}</svg><span>{text}</span>
  </p>;
}
