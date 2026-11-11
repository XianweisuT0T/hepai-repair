import { Component, useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import MusicBox3D from './MusicBox3D';
import { initialLabState, labReducer } from './state';
import { LAB_INSTALL_MS } from './types';
import { useLabAudio } from './useLabAudio';
import emblem from '../assets/hepai-emblem-v2.png';
import './lab3d.css';

function GraphicsFallback({message}:{message:string}){
  return <div className="lab-graphics-error" role="alert" data-testid="lab-webgl-error"><span className="eyebrow">3D 暂时无法显示</span><h2>先回到熟悉的工作台。</h2><p>{message}</p><p>此处没有用二维图片代替 3D。原版修理铺仍可继续使用。</p><a className="primary" href={import.meta.env.BASE_URL}>返回原版</a><button className="subtle" onClick={()=>location.reload()}>重新载入 3D</button></div>;
}
class GraphicsBoundary extends Component<{children:ReactNode;onFailure:(message:string)=>void},{error:string|null}>{
  state:{error:string|null}={error:null};
  static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:'图形资源未能载入。'};}
  componentDidCatch(){this.props.onFailure('浏览器未能创建或维持 WebGL 画面。请返回原版或重新载入。');}
  render(){return this.state.error?<GraphicsFallback message={`浏览器未能创建或维持 WebGL 画面。${this.state.error}`}/>:this.props.children;}
}

export default function MusicBox3DLab(){
  const [state,dispatch]=useReducer(labReducer,undefined,()=>initialLabState(matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [notice,setNotice]=useState(''),[graphicsError,setGraphicsError]=useState('');
  const [lidMoving,setLidMoving]=useState(false),lidTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(lidTimer.current),[]);
  const {muted,toggleSound}=useLabAudio(state.playing,state.epoch,()=>dispatch({type:'stop'}));
  const graphicsFailed=useCallback((message:string)=>{clearTimeout(lidTimer.current);setLidMoving(false);dispatch({type:'reset'});setGraphicsError(message);},[]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const change=()=>dispatch({type:'reduceMotion',value:media.matches});
    media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    if(state.installingAt===null)return;
    const at=state.installingAt,epoch=state.epoch;
    const timer=setTimeout(()=>{dispatch({type:'installed',at,epoch});setNotice('轴心对齐，最后一枚齿轮已落位。现在可以为它上弦。');},state.reduceMotion?40:LAB_INSTALL_MS);
    return()=>clearTimeout(timer);
  },[state.installingAt,state.epoch,state.reduceMotion]);
  useEffect(()=>{
    const stop=()=>dispatch({type:'stop'});
    const hidden=()=>{if(document.hidden)stop();};
    window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5500);return()=>clearTimeout(timer);},[notice]);
  const internalBusy=state.installingAt!==null;
  const canSelect=state.mode==='assemble'&&state.lidOpen&&!lidMoving&&!state.installed&&!internalBusy&&!state.playing;
  const canInstall=canSelect&&state.selected;
  const canWind=state.mode==='assemble'&&state.lidOpen&&!lidMoving&&state.installed&&!internalBusy&&!state.playing&&state.winding<1;
  const canPlay=state.lidOpen&&!lidMoving&&state.installed&&state.winding>=1&&!internalBusy&&!state.playing;
  const stage=internalBusy?'轴心正在对齐，齿轮沿轴线落位。':!state.lidOpen?'盒盖已合上。打开后才能检查和装配。':state.playing?'这一段旋律正在播放，会自然停下。':!state.installed?(state.selected?'已拿起最后一枚齿轮。点机芯空位，或用下方安装按钮。':state.mode==='observe'?'拖动观察盒体，准备动手时切换到装配。':'点检修垫上的齿轮，再点机芯中的空位。'):state.winding<1?'齿轮已装好。顺着右侧摇柄转动，为发条蓄力。':'发条已上好，可以试奏这只音乐盒了。';
  function select(){if(canSelect){dispatch({type:'select'});setNotice('看清厚度与刻痕后，把它送回空着的轴座。');}}
  function install(){if(canInstall){dispatch({type:'install',at:Date.now()});setNotice('正在对齐轴心。');}}
  function wind(fraction:number){if(state.mode==='assemble'&&!lidMoving)dispatch({type:'wind',fraction});}
  async function sound(){dispatch({type:'stop'});try{await toggleSound();setNotice(muted?'声音已开启。点试奏，让它从头响起。':'声音已关闭，仍可观察完整演出。');}catch{setNotice('浏览器未能开启声音。可以重试，或静音完成本次试验。');}}
  function lid(){if(internalBusy||lidMoving)return;setLidMoving(true);clearTimeout(lidTimer.current);lidTimer.current=setTimeout(()=>setLidMoving(false),state.reduceMotion?50:900);if(state.playing)setNotice('已先停止演出，再合上盒盖。');else setNotice(state.lidOpen?'纸雕舞台收回盒内，盒盖沿后侧铰链合上。':'盒盖已打开，可以观察内部机芯。');dispatch({type:'lid'});}
  return <div className="lab-page">
    <header className="lab-header"><a className="brand" href={import.meta.env.BASE_URL}><img className="brand-emblem" src={emblem} width="48" height="48" alt=""/><span>合拍修理铺<small>HEPAI REPAIR</small></span></a><span className="lab-label">本地3D试验·不代表双人联机</span><a className="lab-return" href={import.meta.env.BASE_URL}>返回原版 ↗</a></header>
    <main className="lab-layout" data-testid="lab-main" data-lab-mode={state.mode} data-lab-lid-open={state.lidOpen} data-lab-lid-moving={lidMoving} data-lab-selected={state.selected} data-lab-installed={state.installed} data-lab-installing={internalBusy} data-lab-winding={state.winding.toFixed(3)} data-lab-playing={state.playing} data-lab-epoch={state.epoch} data-lab-muted={muted}>
      <section className="lab-stage"><div className="lab-stage-heading"><div><span className="section-kicker">手作模型 / 3D LAB · 001</span><h1>让这只音乐盒，<br className="lab-mobile-break"/>真正立在桌上。</h1></div><button className="subtle" data-testid="lab-reset-view" onClick={()=>dispatch({type:'view'})}>回到默认视角 ↶</button></div>
        <div className="lab-viewport" aria-label="三维音乐盒展示区"><GraphicsBoundary onFailure={graphicsFailed}>{graphicsError?<GraphicsFallback message={graphicsError}/>:<MusicBox3D state={{...state,lidMoving}} onSelect={select} onInstall={install} onWind={wind} onError={graphicsFailed}/>}</GraphicsBoundary></div>
        <div className="lab-object-caption"><span>{state.mode==='observe'?'拖动观察 · 滚轮或双指缩放':'装配模式 · 镜头已固定'}</span><span>暖木 / 旧黄铜 / 纸雕</span></div>
      </section>
      <aside className="lab-tools paper-panel"><div className="paper-topline">LOCAL WORKBENCH <span>单人试验</span></div><h2>修好最后一点。</h2><p className="lab-initial-note">两枚齿轮已装好，最后一枚在检修垫。仅为本地试验初始状态。</p>
        <div className="lab-mode" role="group" aria-label="操作模式"><button data-testid="lab-mode-observe" disabled={internalBusy} aria-pressed={state.mode==='observe'} onClick={()=>dispatch({type:'mode',mode:'observe'})}>观察</button><button data-testid="lab-mode-assemble" disabled={internalBusy} aria-pressed={state.mode==='assemble'} onClick={()=>dispatch({type:'mode',mode:'assemble'})}>装配</button></div>
        <p className="lab-status" role="status" data-testid="lab-status">{notice||stage}</p>
        <div className="lab-control-row"><button className="secondary" data-testid="lab-lid" disabled={internalBusy||lidMoving||!!graphicsError} onClick={lid}>{state.lidOpen?'合上盒盖':'打开盒盖'} <span aria-hidden="true">⌑</span></button><button className="secondary" data-testid="lab-sound" aria-pressed={!muted} onClick={sound}>{muted?'开启声音':'关闭声音'} <span aria-hidden="true">♪</span></button></div>
        <section className="lab-task"><div className="lab-task-title"><span>01</span><h3>送回最后一枚齿轮</h3><small>{state.installed?'已落位':internalBusy?'装配中':state.selected?'已选中':'待装配'}</small></div><p>选中齿轮，再点空位；也可用下方按钮。</p><div className="lab-control-row"><button className="secondary" data-testid="lab-select-gear" disabled={!canSelect||!!graphicsError} onClick={select}>{state.selected?'齿轮已选中':'选中齿轮'}</button><button className="primary" data-testid="lab-install-gear" disabled={!canInstall||!!graphicsError} onClick={install}>安装到空位 ↓</button></div><button className="subtle lab-cancel" data-testid="lab-cancel-selection" disabled={!state.selected||internalBusy} onClick={()=>{dispatch({type:'cancel'});setNotice('齿轮已放回检修垫。');}}>取消选择</button></section>
        <section className="lab-task"><div className="lab-task-title"><span>02</span><h3>给发条上弦</h3><small>{Math.round(state.winding*100)}%</small></div><p>拖动右侧握把上弦；停手就停，反转会退回。</p><div className="lab-spring-meter" role="progressbar" aria-label="试验上弦进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.winding*100)}><span style={{width:`${state.winding*100}%`}}/></div><button className="secondary" data-testid="lab-wind-step" disabled={!canWind||!!graphicsError} onClick={()=>wind(.25)}>上弦一格 <span aria-hidden="true">↻</span></button></section>
        <div className="lab-play-actions"><button className="primary" data-testid="lab-play" disabled={!canPlay||!!graphicsError} onClick={()=>{setNotice(muted?'正在静音试奏。声音可单独开启。':'听一小段，旋律会自然结束。');dispatch({type:'play'});}}>{muted?'静音试奏':'试奏这段旋律'} <span aria-hidden="true">♫</span></button><button className="secondary" data-testid="lab-stop" disabled={!state.playing} onClick={()=>{dispatch({type:'stop'});setNotice('演出已停止，齿轮与舞台也停下了。');}}>停止</button></div>
        <button className="subtle lab-reset" data-testid="lab-reset" onClick={()=>{clearTimeout(lidTimer.current);setLidMoving(false);dispatch({type:'reset'});setNotice('试验已重置：两枚已装，最后一枚回到垫上，发条归零。');}}>重置试验 ↶</button><p className="lab-footnote">本页仅验证呈现与操作，不保存为双人作品。{state.reduceMotion?'已按系统偏好减少镜头与装饰动态。':'没有时间限制，也不需要同时按住按钮。'}</p>
      </aside>
    </main>
  </div>;
}
