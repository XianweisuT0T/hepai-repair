import { useRef, useState } from 'react';
import type { Gear } from '../shared/types';
import { GearIcon } from './MusicBox';

interface Props { gear:Gear; disabled:boolean; onClose:()=>void; onOffer:()=>void }
export default function GearInspector({gear,disabled,onClose,onOffer}:Props){
  const [angle,setAngle]=useState(0);
  const gesture=useRef<{start:number;angle:number;pointer:number}|null>(null);
  function pointerAngle(event:React.PointerEvent){const rect=event.currentTarget.getBoundingClientRect();return Math.atan2(event.clientY-rect.y-rect.height/2,event.clientX-rect.x-rect.width/2)*180/Math.PI;}
  return <section className="dialog paper-panel loose-gear-dialog" role="dialog" aria-modal="true" aria-labelledby="inspector-title" data-testid="gear-inspector" onClick={event=>event.stopPropagation()}>
    <button className="dialog-close" data-testid="inspect-close" aria-label="放回检修垫" onClick={onClose}>×</button>
    <span className="eyebrow">拿起来，慢慢看看 · 可选检查</span><h2 id="inspector-title">{gear.label}</h2>
    <p>刻痕就在轴心上方。转动只是换个角度，不影响安装。</p>
    <div className="loose-gear-mat"><span className="loose-gear-crosshair"/>
      <div className="loose-gear-rotor" role="group" aria-label={`可转动的${gear.label}`} tabIndex={0} style={{'--inspection-angle':`${angle}deg`} as React.CSSProperties}
        onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);gesture.current={start:pointerAngle(event),angle,pointer:event.pointerId};}}
        onPointerMove={event=>{const start=gesture.current;if(!start||event.pointerId!==start.pointer)return;let delta=pointerAngle(event)-start.start;if(delta>180)delta-=360;if(delta< -180)delta+=360;setAngle(start.angle+delta);}}
        onPointerUp={()=>{gesture.current=null;}}
        onPointerCancel={()=>{if(gesture.current)setAngle(gesture.current.angle);gesture.current=null;}}
        onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();setAngle(a=>event.key==='Home'?0:a+(event.key==='ArrowRight'?30:-30));}}}>
        <div className="loose-gear-turn" data-testid="inspect-object" style={{transform:`rotate(${angle}deg)`}}><GearIcon gear={gear} size={250}/></div><span className="loose-gear-reflection"/>
      </div>
      <span className="loose-gear-angle" aria-live="polite">查看角度 {Math.round((angle%360+360)%360)}°</span>
    </div>
    <div className="loose-gear-turn-buttons"><button className="secondary" data-testid="inspect-rotate-left" onClick={()=>setAngle(a=>a-30)}>向左转一点 <span aria-hidden="true">↶</span></button><button className="secondary" data-testid="inspect-rotate-right" onClick={()=>setAngle(a=>a+30)}>向右转一点 <span aria-hidden="true">↷</span></button></div>
    <p className="loose-gear-facts">{{small:'小号',medium:'中号',large:'大号'}[gear.size]}齿轮 · {gear.notches} 道刻痕 <span>这些特征在零件盘里也能直接读到。</span></p>
    <div className="loose-gear-actions"><button className="subtle" onClick={onClose}>先放回手边</button><button className="primary" disabled={disabled} onClick={onOffer}>递给伙伴：这块吗？ <span aria-hidden="true">↗</span></button></div>
  </section>;
}
