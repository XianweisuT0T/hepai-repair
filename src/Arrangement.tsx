import type { ArrangementPreset, ArrangementState, ArrangementVersion, Identity, NoteSymbol, Stamp, Tempo } from '../shared/types';
import { TRACK_PRESETS } from '../shared/arrangement';
import { NoteIcon, StampIcon } from './MusicBox';
import './arrangement.css';
import { IS_STATIC_DEMO } from './runtimeMode';

const noteNames:Record<NoteSymbol,string>={leaf:'叶',star:'星',moon:'月'};
interface Props {
  arrangement:ArrangementState; self:Identity; stamps?:Record<Identity,Stamp>;
  disabled:boolean; playing:boolean; playingStep:number|null; playbackVersion:'current'|'previous'; soundOff:boolean;
  audibleVersion?:ArrangementVersion|null;
  onStep:(index:number,symbol:NoteSymbol|null)=>void;
  onPreset:(preset:ArrangementPreset)=>void; onTempo:(tempo:Tempo)=>void;
  onListen:(version:'current'|'previous')=>void; onUndo:()=>void; onApprove:()=>void;
}
export function ArrangementBoard({arrangement,self,stamps,disabled,playing,playingStep,playbackVersion,audibleVersion,soundOff,onStep,onListen}:Props){
  const version=playing&&audibleVersion?audibleVersion:arrangement.current;
  function next(symbol:NoteSymbol|null):NoteSymbol|null {
    const symbols:(NoteSymbol|null)[]=self==='A'?['leaf','star','moon']:['leaf','star','moon',null];
    return symbols[(symbols.indexOf(symbol)+1)%symbols.length];
  }
  return <div className="arrangement-board" data-testid="arrangement-board" data-audition-version={playing?playbackVersion:undefined} aria-label="两个人的旋律纸带">
    <div className="arrangement-board-header"><span>机芯已修好 · 调成我们喜欢的样子</span><i>{playing?(playbackVersion==='previous'?'正在听修改前':'正在听现在的组合'):'两条纸带，一段属于你们的旋律'}</i></div>
    <div className="music-tape-bed">{(['A','B'] as Identity[]).map(id=><div key={id} className={`music-tape tape-${id}${self===id?' is-own':''}`} data-track={id} data-playing-step={playing&&playingStep!==null?playingStep:undefined}>
      <div className="tape-owner"><StampIcon stamp={stamps?.[id]||(id==='A'?'sprout':'spark')} size={26}/><b>{id}</b><span>{id==='A'?'主旋律':'伴奏'}</span><small>{self===id?'你的纸带':'伙伴的纸带'}</small></div>
      <div className="tape-notes">{version.tracks[id].notes.map((symbol,index)=>{
        const content=<><span className="tape-beat">0{index+1}</span>{symbol?<NoteIcon symbol={symbol} size={34}/>:<span className="tape-rest" aria-hidden="true">—</span>}<b>{symbol?noteNames[symbol]:'留白'}</b></>;
        const className=`track-cell${playing&&playingStep===index?' is-playing':''}${!symbol?' is-rest':''}`;
        return self===id?<button key={index} className={className} data-testid={`track-step-${id}-${index}`} data-symbol={symbol||'rest'} disabled={disabled||playing} aria-label={`${id}的第${index+1}拍：${symbol?noteNames[symbol]:'留白'}，点一下换声音`} onClick={()=>onStep(index,next(symbol))}>{content}</button>:<div key={index} className={className} data-testid={`track-step-${id}-${index}`} data-symbol={symbol||'rest'} role="img" aria-label={`伙伴${id}的第${index+1}拍：${symbol?noteNames[symbol]:'留白'}`}>{content}</div>;
      })}</div>
    </div>)}</div>
    <div className="tape-listen-controls"><button data-testid="arrangement-listen-current" disabled={disabled} onClick={()=>onListen('current')}><span aria-hidden="true">♪</span> {IS_STATIC_DEMO?'试听完整合奏':'邀请伙伴一起试听'}</button><button data-testid="arrangement-listen-previous" disabled={disabled||!arrangement.previous} onClick={()=>onListen('previous')}>{IS_STATIC_DEMO?'比较上一版':'一起比较上一版'} <span aria-hidden="true">↶</span></button></div>
    <p className="tape-audition-status" data-testid="arrangement-audition-status" role="status">{IS_STATIC_DEMO?(arrangement.audition?`正在体验${arrangement.audition.version==='current'?'当前版':'上一版'}合奏，${playing?'音乐和纸雕按同一节拍回应。':'可以再次试听。'}`:'先听听两条纸带的组合，再切换角色调整另一部分。'):(arrangement.audition?`${arrangement.audition.by===self?'你':'伙伴'}发起了${arrangement.audition.version==='current'?'当前版':'上一版'}合奏试听，${playing?'两端正在按同一节拍播放。':'可以再次邀请重听。'}`:'点试听后，邀请会送到双方工位，一起听完整合奏。')}{soundOff&&<span>{IS_STATIC_DEMO?' 当前声音已关闭，点试听可开启本机声音。':' 当前声音已关闭；点试听可开启本机声音，伙伴也需在自己的设备点开声音。'}</span>}</p>
  </div>;
}
export function ArrangementTools({arrangement,self,disabled,onPreset,onTempo,onUndo,onApprove}:Props){
  const presets=(Object.entries(TRACK_PRESETS) as [ArrangementPreset,typeof TRACK_PRESETS[ArrangementPreset]][]).filter(([,preset])=>preset.owner===self);
  const own=arrangement.current.tracks[self];
  return <div className="arrangement-tools"><h2>{self==='A'?'你来调主旋律':'你来接一段伴奏'}</h2><p>{self==='A'?'选一个走向，或点自己的纸带换音。':'选一种敲击，或点自己的纸带留一点空白。'}</p>
    <div className="track-presets">{presets.map(([id,preset])=><button key={id} data-testid={`track-preset-${id}`} disabled={disabled} aria-pressed={JSON.stringify(own)===JSON.stringify(preset.track)} onClick={()=>onPreset(id)}><b>{preset.name}</b><small>{preset.description}</small></button>)}</div>
    <section className="arrangement-controls" data-testid="arrangement-more" aria-label="共同节奏与恢复">
    <div className="arrangement-tempo"><span>共同节奏</span><div>{(['slow','gentle'] as Tempo[]).map(tempo=><button key={tempo} data-testid={`tempo-${tempo}`} disabled={disabled} aria-pressed={arrangement.current.tempo===tempo} onClick={()=>onTempo(tempo)}>{tempo==='slow'?'慢一点':'轻快一点'}</button>)}</div></div>
    <div className="own-track-undo"><button data-testid="arrangement-undo" disabled={disabled||!arrangement.previousTracks?.[self]} onClick={onUndo}>把我这一轨换回去 <span aria-hidden="true">↶</span></button><small>只恢复你的部分，伙伴的纸带会保留。</small></div>
    </section>
    <div className="arrangement-agreement"><div className="agreement-states">{(['A','B'] as Identity[]).map(id=><span key={id} data-approved={arrangement.approved[id]}><i/>{id} {arrangement.approved[id]?'已确认这版':'还在听'}</span>)}</div><button className="primary" data-testid="arrangement-approve" aria-pressed={arrangement.approved[self]} disabled={disabled||arrangement.approved[self]} onClick={onApprove}>{arrangement.approved[self]?'这版已确认，等伙伴':'确认这一版完整合奏'} <span aria-hidden="true">↗</span></button><p>主旋律、伴奏或共同速度改变后，双方都要重新确认同一版。</p></div>
  </div>;
}
