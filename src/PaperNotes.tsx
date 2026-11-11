import { useEffect, useRef, useState } from 'react';
import type { Identity, PaperNote, Result } from '../shared/types';
import musicBoxSlip from './assets/musicbox-slip-background.png';
import './paper-notes.css';
import { IS_STATIC_DEMO } from './runtimeMode';

const questions=['刚才这只音乐盒里，你最喜欢伙伴做的哪处改动？','如果再改一次，你想和伙伴一起试试什么？'];

/** A private, optional exchange in this room; no note enters the public work. */
export default function PaperNotes({room,self,notes=[],disabled,onSend,onRead}:{room:string;self:Identity;notes?:PaperNote[];disabled:boolean;onSend:(text:string)=>Promise<Result>;onRead:(id:string)=>Promise<Result>}){
  const storageKey=`hepai-paper-draft:${room}:${self}`;
  const [open,setOpen]=useState(true),[question,setQuestion]=useState(0),[draft,setDraft]=useState(()=>{try{return sessionStorage.getItem(storageKey)||'';}catch{return '';}});
  const [sending,setSending]=useState(false),[status,setStatus]=useState(''),[history,setHistory]=useState(false),[message,setMessage]=useState<PaperNote|null>(null);
  const dismissed=useRef(new Set<string>()),dialog=useRef<HTMLDialogElement>(null);
  const received=notes.filter(note=>note.to===self),sent=notes.filter(note=>note.from===self);
  useEffect(()=>{try{sessionStorage.setItem(storageKey,draft);}catch{/* The current draft remains editable. */}},[storageKey,draft]);
  useEffect(()=>{
    if(message)return;
    const unread=received.find(note=>!note.readAt&&!dismissed.current.has(note.id));
    if(unread)setMessage(unread);
  },[notes,self,message]);
  useEffect(()=>{if(message&&!dialog.current?.open)dialog.current?.showModal();},[message]);
  function collect(){
    if(!message)return;
    dismissed.current.add(message.id);
    void onRead(message.id);
    dialog.current?.close();setMessage(null);
  }
  async function deliver(){
    if(sending||disabled||!draft.trim()||sent.length>=3)return;
    setSending(true);setStatus('');
    try{const result=await onSend(draft.trim());if(result.ok){setDraft('');setStatus(IS_STATIC_DEMO?'纸签已留给另一个角色，切换 A / B 可查看。':'纸签已经递给伙伴了。');}else setStatus(result.error||'还没送到，文字已保留，可以再试一次。');}
    finally{setSending(false);}
  }
  return <section className="conversation-slip" data-testid="conversation-slip" aria-label="与伙伴交换纸签">
    {open?<><div className="conversation-slip-paper paper-note-editor">
      <div className="conversation-slip-art" style={{backgroundImage:`url(${musicBoxSlip})`}} aria-hidden="true"/>
      <div className="conversation-slip-copy">
        <h3>留给桌边的话</h3><p>{questions[question]}</p>
        <label htmlFor={`paper-note-${self}`}>写一句话，递给伙伴 <span>可选</span></label>
        <textarea id={`paper-note-${self}`} data-testid="paper-note-input" value={draft} disabled={sending} rows={3} onChange={event=>setDraft(Array.from(event.target.value).slice(0,80).join(''))} placeholder="我很喜欢你加入的那一小段……"/>
        <div className="paper-note-editor-bottom"><small>{Array.from(draft).length} / 80</small><button className="paper-note-send" data-testid="paper-note-send" disabled={disabled||sending||!draft.trim()||sent.length>=3} onClick={()=>void deliver()}>{sending?'正在递过去…':'递给伙伴'}<span aria-hidden="true">↗</span></button></div>
        <small>{IS_STATIC_DEMO?'本机角色交换演示：发送后切换 A / B 查看，不会传给其他访客。':'只送给这间工位的伙伴，也可以直接面对面说。'}</small>
      </div>
    </div><p className="paper-note-status" role="status">{status||(sent.length>=3?'三张心意已送出，可以听听伙伴怎么说。':'')}</p>
    <div className="conversation-slip-actions"><button className="subtle" data-testid="conversation-next" onClick={()=>setQuestion(value=>1-value)}>换一个话题</button><button className="subtle" data-testid="conversation-skip" onClick={()=>setOpen(false)}>先收起纸签</button></div></>:<button className="text-link" onClick={()=>setOpen(true)}>展开纸签，留一句话 <span aria-hidden="true">↗</span></button>}
    {received.length>0&&<div className="paper-note-inbox"><button data-testid="paper-note-inbox" className="subtle" aria-expanded={history} onClick={()=>setHistory(value=>!value)}>伙伴送来的纸签 · {received.length}</button>{history&&<div>{received.map((note,index)=><button key={note.id} onClick={()=>setMessage(note)}>第 {index+1} 张 · {note.text.slice(0,16)}{note.text.length>16?'…':''}</button>)}</div>}</div>}
    <dialog ref={dialog} className="paper-message-dialog" data-testid="paper-note-dialog" aria-labelledby="paper-message-title" onCancel={event=>{event.preventDefault();collect();}}>
      {message&&<><div className="paper-message-art" style={{backgroundImage:`url(${musicBoxSlip})`}} aria-hidden="true"/><div className="paper-message-content"><h2 id="paper-message-title">{IS_STATIC_DEMO?`角色 ${message.from} 留来一张纸签`:'伙伴递来一张纸签'}</h2><p className="paper-message-text" data-testid="paper-note-received">{message.text}</p><p className="paper-message-foot">{IS_STATIC_DEMO?'本机角色交换演示':'写给一起修好音乐盒的你'}</p><button className="paper-note-send" data-testid="paper-note-collect" onClick={collect}>收好这张纸签 <span aria-hidden="true">↘</span></button></div></>}
    </dialog>
  </section>;
}
