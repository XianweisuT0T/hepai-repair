import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ConceptPreviewPage } from './FutureCommissions';
import './style.css';
import './cooperation.css';
import './studio-v3.css';
import './workshop3d.css';
import './completion.css';
import './responsive-polish.css';
const MusicBox3DLab=lazy(()=>import('./lab3d/MusicBox3DLab'));
class LabRouteBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="empty-view" role="alert"><h1>3D 试验暂时未能打开。</h1><p>模型模块未能载入。原版修理铺仍然可用。</p><a className="primary" href={import.meta.env.BASE_URL}>返回原版</a><button className="subtle" onClick={()=>location.reload()}>重新载入</button></main>:this.props.children;}
}
const basePath=import.meta.env.BASE_URL.replace(/\/$/,'');
const routePath=(location.pathname.startsWith(`${basePath}/`)?location.pathname.slice(basePath.length):location.pathname).replace(/\/$/,'');
const isStarConcept=routePath==='/concept/star-instrument';
const is3DLab=routePath==='/lab/music-box-3d';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{isStarConcept?<ConceptPreviewPage/>:is3DLab?<LabRouteBoundary><Suspense fallback={<main className="empty-view"><h1>正在打开三维检修台…</h1><p>首次载入本地模型与渲染器。</p><a className="secondary" href={import.meta.env.BASE_URL}>返回原版</a></main>}><MusicBox3DLab/></Suspense></LabRouteBoundary>:<App/>}</React.StrictMode>);
