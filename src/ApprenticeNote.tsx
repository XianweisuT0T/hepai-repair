import { useEffect, useState } from 'react';
import type { Identity } from '../shared/types';
import roleGuide from './assets/role-guide-kit.png';
import roleMaker from './assets/role-maker-kit.png';
import { JoiningMark } from './RepairNoteArt';

interface Props {roomCode:string;self:Identity;demo:boolean;paired:boolean;ready:Record<Identity,boolean>}
/** Public roles only. Never accepts a snapshot, blueprint, gear mapping, or answer. */
export default function ApprenticeNote({roomCode,self,demo,paired,ready}:Props){
  const [joining,setJoining]=useState(false);
  useEffect(()=>{
    if(demo||!paired){setJoining(false);return;}
    const key=`hepai-paper-intro:${roomCode}:${self}`;
    try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'seen');}catch{/* Pairing still works without storage. */}
    setJoining(true);
  },[demo,paired,roomCode,self]);
  useEffect(()=>{if(!joining)return;const timer=setTimeout(()=>setJoining(false),2200);return()=>clearTimeout(timer);},[joining]);
  return <section className={`apprentice-note${paired&&!demo?' is-paired':''}${joining?' is-joining':''}${demo?' is-demo':''}`} data-testid="apprentice-note" data-paired={paired&&!demo} aria-label="同一张委托，两份分工">
    <div className="apprentice-halves">{(['A','B'] as const).map(id=><div key={id} className={`apprentice-half half-${id}${self===id?' is-yours':''}`}>
      <span className="apprentice-identity">{id}<small>{id===self?'你的这一半':demo?'轮流体验':'伙伴的那一半'}</small></span>
      <img src={id==='A'?roleGuide:roleMaker} alt=""/>
      <b>{id==='A'?'先读图纸':'先拿工具'}</b><p>{id==='A'?'把看见的线索说出来':'把手边的零件试进去'}</p><span className="apprentice-ready">{ready[id]?'已准备':!demo&&!paired&&id!==self?'等一位伙伴':'等你准备'}</span>
    </div>)}</div>
    <p className="apprentice-pair-caption" role="status"><JoiningMark/><span>{demo?'同一张委托，轮流接过两份工具。':paired?'现在，我们可以开始修理了。':'另一半委托，留给即将到来的伙伴。'}<small>{demo?'单人演示 · 两个角色都需要确认准备':paired?'各自点一下准备，再一起打开机芯。':'图纸与零件，需要两双手来相遇。'}</small></span></p>
  </section>;
}
