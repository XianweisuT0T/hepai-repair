import { useEffect, useRef, useState } from 'react';
import type { Identity, PaperNote, Result } from '../shared/types';
import musicBoxSlip from './assets/musicbox-slip-background.png';
import './paper-notes.css';

const questions=['刚才这只音乐盒里，你最喜欢伙伴做的哪处改动？','如果再改一次，你想和伙伴一起试试什么？'];

type Props = {
  room: string;
  self: Identity;
  notes?: PaperNote[];
  busy: boolean;
  sendUnavailable?: string;
  onSwitchRole?: (role: Identity) => Promise<Result>;
  onSend: (text: string) => Promise<Result>;
  onRead: (id: string) => Promise<Result>;
};

/** A private, optional exchange in this room; no note enters the public work. */
export default function PaperNotes({room,self,notes=[],busy,sendUnavailable,onSwitchRole,onSend,onRead}:Props){
  const storageKey=`hepai-paper-draft:${room}:${self}`;
  const [draft,setDraft]=useState(()=>{try{return sessionStorage.getItem(storageKey)||'';}catch{return '';}});
  const [open,setOpen]=useState(!!draft.trim()),[question,setQuestion]=useState(0);
  const [sending,setSending]=useState(false),[status,setStatus]=useState(''),[history,setHistory]=useState(false),[message,setMessage]=useState<PaperNote|null>(null);
  const [inlineMessage,setInlineMessage]=useState(false);
  const dismissed=useRef(new Set<string>()),dialog=useRef<HTMLDialogElement>(null);
  const received=notes.filter(note=>note.to===self),sent=notes.filter(note=>note.from===self);
  const demo=!!onSwitchRole;
  const recipient=self==='A'?'B':'A';
  useEffect(()=>{try{sessionStorage.setItem(storageKey,draft);}catch{/* The current draft remains editable. */}},[storageKey,draft]);
  useEffect(()=>{
    if(message)return;
    const unread=received.find(note=>!note.readAt&&!dismissed.current.has(note.id));
    if(unread)setMessage(unread);
  },[notes,self,message]);
  useEffect(()=>{
    if(!message)return;
    const element=dialog.current;
    if(element?.open)return;
    try{if(typeof element?.showModal==='function'){element.showModal();return;}}catch{/* Keep the message visible in the panel. */}
    setInlineMessage(true);
  },[message]);
  function collect(){
    if(!message)return;
    dismissed.current.add(message.id);
    void onRead(message.id);
    if(dialog.current?.open)dialog.current.close();
    setMessage(null);
  }
  async function deliver(){
    if(sending||busy||sendUnavailable||!draft.trim()||sent.length>=3)return;
    setSending(true);setStatus('');
    try{
      const result=await onSend(draft.trim());
      if(result.ok){setDraft('');setStatus(demo?`纸条已留给角色 ${recipient}。`:'纸条已送达伙伴。');}
      else setStatus(result.error||'还没送到，草稿已保留，可以再试一次。');
    }
    catch{setStatus('还没送到，草稿已保留，可以再试一次。');}
    finally{setSending(false);}
  }
  const incoming=message&&<>
    <div className="paper-message-art" style={{backgroundImage:`url(${musicBoxSlip})`}} aria-hidden="true"/>
    <div className="paper-message-content">
      <h2 id="paper-message-title">{demo?`角色 ${message.from} 留来一张纸条`:'伙伴递来一张纸条'}</h2>
      <p className="paper-message-text" data-testid="paper-note-received">{message.text}</p>
      <p className="paper-message-foot">{demo?'本机角色交换演示':'写给一起修好音乐盒的你'}</p>
      <button className="paper-note-send" data-testid="paper-note-collect" onClick={collect}>收好这张纸条</button>
    </div>
  </>;
  return <section className="conversation-slip" data-testid="conversation-slip" aria-labelledby="paper-note-heading">
    <div className="paper-note-heading">
      <h3 id="paper-note-heading">留给桌边的话 <small>可选</small></h3>
      <button className={open?'subtle':'paper-note-send'} data-testid={open?'conversation-skip':'paper-note-open'} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'收起纸条':'写纸条'}</button>
    </div>
    <p className="paper-note-mode">{demo?'本机演示，留给另一个角色，切换后可以读。':'只发给当前工位的伙伴。'}</p>
    {open&&<><div className="conversation-slip-paper paper-note-editor">
      <div className="conversation-slip-art" style={{backgroundImage:`url(${musicBoxSlip})`}} aria-hidden="true"/>
      <div className="conversation-slip-copy">
        <p>{questions[question]}</p>
        <label htmlFor={`paper-note-${self}`}>{demo?`写给角色 ${recipient}`:'写给伙伴'}</label>
        <textarea id={`paper-note-${self}`} data-testid="paper-note-input" value={draft} disabled={sending} rows={3} onChange={event=>setDraft(Array.from(event.target.value).slice(0,80).join(''))} placeholder="我很喜欢你加入的那一小段……" aria-describedby="paper-note-send-help"/>
        <div className="paper-note-editor-bottom"><small>{Array.from(draft).length} / 80 字</small><button className="paper-note-send" data-testid="paper-note-send" disabled={busy||sending||!!sendUnavailable||!draft.trim()||sent.length>=3} onClick={()=>void deliver()}>{sending?'正在发送…':'发送纸条'}</button></div>
        <small id="paper-note-send-help">{sent.length>=3?'已经送出三张纸条。':sendUnavailable||'写好后即可发送，每人最多三张。'}</small>
      </div>
    </div><button className="subtle paper-note-topic" data-testid="conversation-next" onClick={()=>setQuestion(value=>1-value)}>换一个话题</button></>}
    <p className="paper-note-status" role="status">{status}</p>
    {onSwitchRole&&sent.length>0&&<button className="paper-note-send paper-note-switch" data-testid="paper-note-switch" disabled={busy||sending} onClick={async()=>{
      const result=await onSwitchRole(recipient);
      if(!result.ok)setStatus(result.error||'暂时未能切换角色，请再试一次。');
    }}>切换到 {recipient} 读纸条</button>}
    {received.length>0&&<div className="paper-note-inbox"><button data-testid="paper-note-inbox" className="subtle" aria-expanded={history} onClick={()=>setHistory(value=>!value)}>收到的纸条 · {received.length}</button>{history&&<div>{received.map((note,index)=><button key={note.id} onClick={()=>setMessage(note)}>第 {index+1} 张 · {note.text.slice(0,16)}{note.text.length>16?'…':''}</button>)}</div>}</div>}
    {inlineMessage&&message&&<div className="paper-message-inline" role="region" aria-labelledby="paper-message-title">{incoming}</div>}
    <dialog ref={dialog} className="paper-message-dialog" data-testid="paper-note-dialog" aria-labelledby="paper-message-title" onCancel={event=>{event.preventDefault();collect();}}>
      {!inlineMessage&&incoming}
    </dialog>
  </section>;
}
