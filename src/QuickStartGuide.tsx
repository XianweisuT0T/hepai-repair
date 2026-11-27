import { useId, useRef } from 'react';

export function CabinetIcon(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21v-2m14 2v-2M4 4h16v15H4zM4 14h16M12 4v10M7 17h3m4 0h3"/><path d="M7 11V8h2v3m6 0V8h2v3"/></svg>;
}
function BookIcon(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14M6 8h3m-3 3h3m6-3h3m-3 3h3"/></svg>;
}

/** Optional native popover: light-dismiss and Escape work without trapping a visitor in a tour. */
export default function QuickStartGuide({demo,inRoom,onTry,disabled=false}:{demo:boolean;inRoom:boolean;onTry?:()=>void;disabled?:boolean}){
  const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const place=()=>{
    if(!panel.current||!trigger.current)return;
    const top=Math.min(trigger.current.getBoundingClientRect().bottom+12,innerHeight*.3);
    panel.current.style.setProperty('--guide-top',`${top}px`);
  };
  const close=()=>{panel.current?.hidePopover();trigger.current?.focus();};
  return <>
    <button ref={trigger} className="quick-guide-trigger" data-testid="quick-guide-open" popoverTarget={id} onClick={place} aria-label="怎么玩"><BookIcon/><span>怎么玩</span></button>
    <div ref={panel} id={id} popover="auto" className="quick-guide paper-panel" role="region" aria-labelledby={`${id}-title`} data-testid="quick-guide">
      <div className="quick-guide-heading"><h2 id={`${id}-title`}>一起修好，怎么玩？</h2><button className="quick-guide-close" aria-label="关闭玩法说明" onClick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <p className="quick-guide-intro">不用会机械，也不用懂乐理。<br/>跟着手里的工具，一次做一件小事。</p>
      <ol className="quick-guide-steps">
        <li><span aria-hidden="true">01</span><div><h3>先互相帮个忙</h3><p>A 看图纸，B 放齿轮。拿不准，就用“这块吗？”请伙伴确认。接着交换工具，把声音片接回去。</p></div></li>
        <li><span aria-hidden="true">02</span><div><h3>再编一段合奏</h3><p>各改自己的声部，一起试听。喜欢这一版，就分别确认；有新改动时，再听一次。</p></div></li>
        <li><span aria-hidden="true">03</span><div><h3>最后一起启动</h3><p>A 转摇柄上弦，B 拨启动片。也可以点按钮操作。演出后可留纸签，也可以直接结束。</p></div></li>
      </ol>
      <p className="quick-guide-mode">{demo?<><strong>现在是单人演示</strong>用底部“切换到 A / B”轮流体验两份工具，两个角色都要确认准备。想试听时，先点右上角喇叭。</>:<><strong>和伙伴一起体验</strong>一人开工位，另一人用工位码加入。面对面说说你看见的线索，再一起动手。</>}</p>
      <button className="quick-guide-action" disabled={!inRoom&&!!onTry&&disabled} onClick={()=>{close();if(!inRoom)onTry?.();}}>{inRoom?'回到工位':onTry?'明白了，先一个人试试':'明白了，继续看看'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
    </div>
  </>;
}
