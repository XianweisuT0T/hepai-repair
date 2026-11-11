import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import brandEmblem from './assets/hepai-emblem-v2.png';
import './commissions.css';

const StarInstrumentViewer=lazy(()=>import('./commissions/StarInstrumentViewer'));
const charts=['归航','林间','微光'] as const;

class ConceptBoundary extends Component<{children:ReactNode;onRetry:()=>void},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="commission-error" role="alert"><p>星仪暂时没能显示。</p><button className="secondary" onClick={this.props.onRetry}>重新打开模型</button></div>:this.props.children;}
}

export default function FutureCommissions({standalone=false}:{standalone?:boolean}){
  const [expanded,setExpanded]=useState(standalone||location.hash==='#future-star');
  const [nearby,setNearby]=useState(standalone),[attempt,setAttempt]=useState(0);
  const [orbitAngle,setOrbitAngle]=useState(0),[constellation,setConstellation]=useState<0|1|2>(0),[aim,setAim]=useState(.5),[viewRevision,setViewRevision]=useState(0);
  const section=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(standalone||!section.current)return;
    const observer=new IntersectionObserver(entries=>setNearby(entries.some(entry=>entry.isIntersecting)),{rootMargin:'160px'});
    observer.observe(section.current);return()=>observer.disconnect();
  },[standalone]);
  useEffect(()=>{if(!standalone&&location.hash==='#future-star')section.current?.scrollIntoView({behavior:'instant',block:'start'});},[standalone]);
  const open=()=>{setExpanded(true);setAttempt(value=>value+1);};
  return <section ref={section} id="future-star" className={`future-commission ${standalone?'standalone-commission':''}`} data-testid="future-star-section" aria-labelledby="future-star-title">
    <div className="commission-heading"><h2 id="future-star-title">下一件，修一片星空。</h2><span className="commission-concept-label">未来修理委托 · 概念试作</span></div>
    <div className="commission-introduction"><div><h3>合拍星仪</h3><p>一个人转动星轨，一个人读懂星图。<br/>把各自看见的线索，拼成一片星空。</p></div><div className="commission-role-description"><p><b>A · 星轨</b><span>转动手轮，带动星球与轨道。</span></p><p><b>B · 观测</b><span>选择星图，移动观测镜。</span></p></div></div>
    {!expanded?<button className="commission-open" data-testid="future-star-open" onClick={open}><span>看看这只星仪</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></button>:<div className="commission-preview" data-testid="star-preview">
      <div className="commission-viewer-frame">
        {nearby?<ConceptBoundary key={attempt} onRetry={()=>setAttempt(value=>value+1)}><Suspense fallback={<div className="commission-loading" role="status">正在把星仪摆到台面上…</div>}><StarInstrumentViewer orbitAngle={orbitAngle} constellation={constellation} aim={aim} viewRevision={viewRevision} onOrbitChange={setOrbitAngle} onConstellationChange={setConstellation} onAimChange={setAim}/></Suspense></ConceptBoundary>:<div className="commission-loading">靠近一点，看看新的修理委托。</div>}
      </div>
      <div className="commission-controls">
        <div className="commission-control-heading"><p>拨动星轨，试着换一张星图。</p><button className="subtle" data-testid="star-reset-view" onClick={()=>setViewRevision(value=>value+1)}>回到默认视角</button></div>
        <div className="commission-control-row"><label className="commission-orbit-control"><span>转动星轨</span><input data-testid="star-orbit-range" aria-label="转动星轨" type="range" min="0" max="360" step="1" value={((orbitAngle*180/Math.PI)%360+360)%360} onChange={event=>setOrbitAngle(Number(event.target.value)*Math.PI/180)}/></label><div className="commission-chart-controls" role="group" aria-label="星图选择">{charts.map((name,index)=><button key={name} data-testid={`star-chart-${index}`} aria-pressed={constellation===index} onClick={()=>setConstellation(index as 0|1|2)}>{name}</button>)}</div><label className="commission-aim-control"><span>观测位置</span><input data-testid="star-aim-range" aria-label="调整观测位置" type="range" min="0" max="100" step="1" value={Math.round(aim*100)} onChange={event=>setAim(Number(event.target.value)/100)}/></label></div>
        <div className="commission-preview-footer"><small>拖动手轮和观测镜，点选星图；拖动空处环绕，滚轮或双指缩放。</small><button className="subtle" data-testid="future-star-close" onClick={()=>setExpanded(false)}>收起模型</button></div>
      </div>
    </div>}
    <p className="commission-scope">这是一件正在探索的新委托。当前可以在本机摆弄模型，完整的双人修理体验还在设计中。</p>
  </section>;
}

export function ConceptPreviewPage(){
  useEffect(()=>{const before=document.title;document.title='合拍星仪 · 概念试作 | 合拍修理铺';return()=>{document.title=before;};},[]);
  return <div className="app concept-preview-page"><header className="site-header"><a className="brand concept-brand" href={import.meta.env.BASE_URL}><img className="brand-emblem" src={brandEmblem} alt="" width="48" height="48"/><span>合拍修理铺<small>HEPAI REPAIR</small></span></a><a className="concept-return" href={import.meta.env.BASE_URL}>回到修理铺 <span aria-hidden="true">↗</span></a></header><main><FutureCommissions standalone/></main></div>;
}
