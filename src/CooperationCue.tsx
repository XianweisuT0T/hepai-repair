import { useEffect, useRef, useState } from 'react';
import type { Snapshot, ArrangementVersion } from '../shared/types';
import { describeScoreChange } from '../shared/cooperation';
import { NoteIcon } from './MusicBox';
import './cooperation-cues.css';

/** Read only public state: never infer a partner's intention or expose their blueprint. */
export function CooperationCue({snapshot:s,connected}:{snapshot:Snapshot;connected:boolean}){
  const previous=useRef(s);
  const [change,setChange]=useState('');
  useEffect(()=>{
    const before=previous.current;previous.current=s;
    if(before.code!==s.code||before.self!==s.self||before.stage!==s.stage){setChange('');return;}
    if(before.arrangement&&s.arrangement&&before.arrangement.revision!==s.arrangement.revision)
      setChange(describeScoreChange(before.arrangement.current,s.arrangement.current,s.self,s.mode==='demo'));
  },[s]);
  const me=s.members.find(m=>m.id===s.self),other=s.members.find(m=>m.id!==s.self);
  const peer=s.mode==='demo'?`${s.self==='A'?'B':'A'} 角色`:'伙伴';
  let message='';
  if(!connected||s.paused)message='连接恢复后继续，已经完成的操作会保留。';
  else if(s.stage==='swap')message=me?.swapReady?`你已接过工具，接下来等${peer}确认。`:`${other?.swapReady?`${peer}已接过工具。`:''}点「我接过工具了」，交换这一次的分工。`;
  else if(s.stage==='arrange'&&s.arrangement){
    const a=s.arrangement;
    message=a.approved[s.self]?`你已确认这版完整合奏，等${peer}确认。`:
      `${change?`${change} `:''}${a.approved[s.self==='A'?'B':'A']?`${peer}已确认，听过后再确认你的选择。`:'可以试听完整合奏，再分别确认这一版。'}`;
  }else if(s.stage==='launch'){
    const wound=(s.winding??0)>=4,armed=s.members.find(m=>m.id==='B')?.launchReady;
    message=s.self==='A'?(wound?`你的上弦已完成，${armed?'两边已就绪。':`等${peer}拨动启动片。`}`:armed?`${peer}的启动片已就绪，轮到你转动摇柄。`:'你来转动摇柄，B 来拨动启动片，不用同时操作。'):
      armed?`你的启动片已就绪，${wound?'两边已就绪。':`等${peer}把发条上好。`}`:wound?`${peer}已上好弦，拨动启动片就能一起演出。`:'你来拨动启动片，A 来转动摇柄，不用同时操作。';
  }
  if(!message)return null;
  return <p className="cooperation-cue" data-testid="cooperation-cue" role="status">{message}{s.mode==='demo'&&((s.stage==='swap'&&me?.swapReady)||(s.stage==='arrange'&&s.arrangement?.approved[s.self])||(s.stage==='launch'&&(s.self==='A'?(s.winding??0)>=4:me?.launchReady)))&&<small>单人演示：用底部按钮切换角色，接着完成另一边。</small>}</p>;
}

/** Uses the audio scheduler's beat and the version actually being auditioned. */
export function ScoreContributions({score,beat,playing}:{score:ArrangementVersion;beat:number|null;playing:boolean}){
  return <div className="score-contributions" data-testid="score-contributions" aria-label="A 的旋律控制星光，B 的伴奏控制小灯">
    {(['A','B'] as const).map(id=>{
      const note=playing&&beat!==null?score.tracks[id].notes[beat]:null;
      return <div key={id} className={`score-contribution contribution-${id}${note?' sounding':''}`} data-testid={`contribution-${id}`} data-sounding={!!note}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{id==='A'?<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>:<><path d="M8 16c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8ZM9 20h6M10 23h4"/></>}</svg>
        <span><b>{id} · {id==='A'?'主旋律 / 星光':'伴奏 / 小灯'}</b><small>{playing&&beat!==null?`第 ${beat+1} 拍 · ${note?id==='A'?'星光随音高升起':'小灯随伴奏亮起':'留白，静静等待'}`:id==='A'?'音高改变星星的高度':'有伴奏的拍子点亮小灯'}</small></span>
        {note&&<NoteIcon symbol={note} size={20}/>}
      </div>;
    })}
  </div>;
}
