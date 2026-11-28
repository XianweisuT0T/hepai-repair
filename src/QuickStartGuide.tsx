import { useEffect, useId, useRef, useState } from 'react';
import type { Stage } from '../shared/types';
import { RepairComic, warmRepairComic } from './RepairNoteArt';
import brandEmblem from './assets/hepai-emblem-v2.png';
import scoreArt from './assets/onboarding/manual-score.webp';
import launchArt from './assets/onboarding/manual-launch.webp';
import performanceArt from './assets/onboarding/manual-performance.webp';
import keepsakeArt from './assets/onboarding/manual-keepsake.webp';
import ManualSketchMotion from './ManualSketchMotion';
import ManualActionStory, { warmManualActions } from './ManualActionStory';

export function CabinetIcon(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21v-2m14 2v-2M4 4h16v15H4zM4 14h16M12 4v10M7 17h3m4 0h3"/><path d="M7 11V8h2v3m6 0V8h2v3"/></svg>;
}
function BookIcon(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14M6 8h3m-3 3h3m6-3h3"/></svg>;
}
function PageArrow({back=false}:{back?:boolean}){
  return <svg viewBox="0 0 32 24" aria-hidden="true" className={back?'is-back':''}><path d="M3 12c8-1 15 1 25 0M20 5l8 7-8 7"/></svg>;
}
const pageCount=7;
const chapterNames=['接下委托','修好机芯','交换工具','共同编曲','一起启动','听一场演出','带走纪念'];
const stagePages:Record<Stage,number>={waiting:0,gears:1,swap:2,melody:2,arrange:3,launch:4,performance:5,complete:6,ended:6};
const duties=[null,{A:'读图纸 · 指位置',B:'挑齿轮 · 试装'},{A:'试听 · 排声音片',B:'选旋律 · 读顺序'},{A:'改主旋律',B:'改伴奏'},{A:'转动摇柄',B:'拨动启动片'},null,null];
const MOTION_KEY='hepai.manual-motion.v1';
function initialMotion(){try{return localStorage.getItem(MOTION_KEY)!=='off';}catch{return true;}}

function ManualPage({page,demo,titleId,animated}:{page:number;demo:boolean;titleId?:string;animated:boolean}){
  if(page===-1)return <div className="manual-cover">
    <h2 id={titleId}>修理小手册</h2>
    <p className="manual-cover-subtitle">留给新学徒的一份委托</p>
    <figure className="manual-cover-sketch">
      <img src={scoreArt} alt="两位小工匠围着音乐盒，一起整理旋律纸带"/>
      <figcaption>借我看看，一起修好它。</figcaption>
    </figure>
    <div className="manual-cover-bottom">
      <p className="manual-cover-note">一个人看图纸，<br/>一个人拿工具。</p>
      <div className="manual-cover-stamp"><img src={brandEmblem} alt="合拍修理铺标志"/><span>合拍修理铺</span></div>
    </div>
  </div>;
  const pages=[
    {title:'这只音乐盒，等你们来修。',art:<RepairComic scene={0}/>,copy:<>
      <p>一个人读图纸，一个人拿工具。一起修好它，再写一段属于你们的旋律。</p>
      <p>{demo?<><b>现在是单人演示。</b>用底部按钮切换 A / B，分别点「我准备好了」。</>:<><b>先在同一间工位会合。</b>一人开工位，另一人用邀请链接或工位码加入，再各自点「我准备好了」。</>}</p>
      <p>想听音乐，先点右上角的<b>喇叭</b>。</p>
    </>},
    {title:'你看图纸，我来装。',art:<ManualActionStory kind="gears" animated={animated}/>,copy:<>
      <p>从六枚齿轮里选出合适的三枚。对照<b>大小和刻痕</b>，把线索告诉伙伴。</p>
      <p>B 选中一枚，点<b>「这块吗？」</b>递过去。A 可以指槽位、回应，B 再点槽位或拖进去。</p>
      <p>装好三枚齿轮，就能交换工具。装错也没关系，换一块再试。</p>
    </>},
    {title:'换你动手，接回旋律。',art:<ManualActionStory kind="melody" animated={animated}/>,copy:<>
      <p>两边都点<b>「我接过工具了」</b>，这次换 B 读图纸、A 装配。</p>
      <p><b>B 选旋律、说明声音顺序。</b>A 试听叶、星、月声音片，放进四个槽位，再选音色。</p>
      <p>一起试奏，对好顺序后点<b>「确认这段旋律」</b>。</p>
    </>},
    {title:'把它调成，我们的歌。',art:<img src={scoreArt} alt=""/>,copy:<>
      <p>点<b>自己的纸带</b>换音，也能选现成走向、一起调快慢。</p>
      <p>{demo?'点「试听完整合奏」听两轨组合，改过后可「比较上一版」。':'点「邀请伙伴一起试听」，两端听同一版；改过后还能一起比较上一版。'}</p>
      <p><b>两边都确认同一版，再往下走。</b>音乐或速度一变，之前的确认就会清除。</p>
    </>},
    {title:'两双手，让它响起来。',art:<img src={launchArt} alt=""/>,copy:<>
      <p><b>A 转木摇柄，给发条上弦。</b>顺着箭头转，也可以点按钮。</p>
      <p><b>B 滑动黄铜启动片。</b>沿箭头拨过去，也可以直接点按。</p>
      <p>不用同时操作。两边都就绪，演出就会开始。{demo?'单人演示记得切换角色，完成另一边。':''}</p>
    </>},
    {title:'你们的旋律，正在发光。',art:<img src={performanceArt} alt=""/>,copy:<>
      <p><b>A 的音高托起星星，B 的伴奏点亮小灯。</b>速度改变，纸雕的节奏也跟着变。</p>
      <p>演奏时可以<b>拖动音乐盒换角度</b>，手机也能放大欣赏。</p>
      <p>听完这一段，会进入留念页；想再听，还可以重播。</p>
    </>},
    {title:'留一句话，把这一刻带走。',art:<img src={keepsakeArt} alt=""/>,copy:<>
      <p>各留一个词，合成作品名；再选刻印，<b>保存作品图片</b>。</p>
      <p>想给伙伴一句话，就在纸签上写好再发送。{demo?'演示中的纸签，在本机切换角色查看。':'对方的界面会收到纸签。'}</p>
      <p>{demo?'也可以直接点「今天就到这里」，把话留到面对面。':<>公开分享与加入展柜，都要<b>双方同意</b>。也可以直接结束，把话留到面对面。</>}</p>
    </>},
  ];
  const current=pages[page];
  const duty=duties[page];
  return <><div className={`manual-illustration manual-art-${page}`}>{current.art}<ManualSketchMotion page={page}/></div><div className="manual-copy"><h2 id={titleId}>{current.title}</h2>{duty&&<div className="manual-role-line"><span><b>A</b>{duty.A}</span><span><b>B</b>{duty.B}</span></div>}{current.copy}</div></>;
}

/** One sheet at a time on every screen. Turning a page never performs a repair action. */
export default function QuickStartGuide({demo,inRoom,stage,onTry,disabled=false}:{demo:boolean;inRoom:boolean;stage?:Stage;onTry?:()=>void;disabled?:boolean}){
  const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),scrollArea=useRef<HTMLDivElement>(null);
  const swipe=useRef<{x:number;y:number}|null>(null);
  const [page,setPage]=useState(-1),[opened,setOpened]=useState(false);
  const [motion,setMotion]=useState(initialMotion);
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReducedMotion(preference.matches);
    update();preference.addEventListener('change',update);
    return()=>preference.removeEventListener('change',update);
  },[]);
  const motionEnabled=motion&&!reducedMotion;
  const motionLabel=reducedMotion?'系统已减少动态效果':motion?'暂停插画动画':'播放插画动画';
  const pageRef=useRef(-1),artWarmed=useRef(false);
  const stagePage=inRoom&&stage?stagePages[stage]:null;
  const close=()=>{panel.current?.hidePopover();trigger.current?.focus();};
  function turn(next:number){
    if(next< -1||next>=pageCount)return;
    if(next===pageRef.current)return;
    // Returning to the cover disables Previous; keep keyboard navigation in the book.
    if(next===-1&&document.activeElement===panel.current?.querySelector('.manual-prev'))panel.current?.focus({preventScroll:true});
    pageRef.current=next;setPage(next);
    scrollArea.current?.scrollTo({top:0,behavior:'instant'});
  }
  function openBook(){
    if(panel.current?.matches(':popover-open'))return;
    if(!artWarmed.current){
      artWarmed.current=true;warmRepairComic();warmManualActions();
      [scoreArt,launchArt,performanceArt,keepsakeArt].forEach(src=>{const image=new Image();image.src=src;});
    }
    const entry=stagePage??-1;
    pageRef.current=entry;
    setPage(entry);setOpened(true);scrollArea.current?.scrollTo(0,0);
  }
  function begin(){close();if(inRoom)window.dispatchEvent(new Event('hepai-guide-review'));else onTry?.();}
  function toggleMotion(){const next=!motion;setMotion(next);try{localStorage.setItem(MOTION_KEY,next?'on':'off');}catch{/* The control also works without storage. */}}
  return <>
    <button ref={trigger} className="quick-guide-trigger" data-testid="quick-guide-open" popoverTarget={id} aria-label="怎么玩" onClick={openBook}><BookIcon/><span>怎么玩</span></button>
    <div ref={panel} id={id} popover="auto" className={`repair-note repair-manual${page===-1?' is-cover':''}`} data-illustration-motion={motionEnabled?'on':'off'} role="region" tabIndex={-1} aria-label="合拍修理手册" data-testid="quick-guide"
      onToggle={event=>{const isOpen=event.newState==='open';setOpened(isOpen);if(!isOpen)swipe.current=null;else panel.current?.focus({preventScroll:true});}}
      onKeyDown={event=>{if(event.target instanceof HTMLSelectElement)return;if(event.key==='ArrowRight'){event.preventDefault();turn(pageRef.current+1);}else if(event.key==='ArrowLeft'){event.preventDefault();turn(pageRef.current-1);}}}>
      <div className="manual-binding" aria-hidden="true"><i/><i/><i/></div>
      <header className="manual-header"><span><BookIcon/>合拍修理手册</span>{stagePage!==null&&<button className="manual-stage-bookmark" onClick={()=>turn(stagePage)} disabled={page===stagePage} title={`跳到${chapterNames[stagePage]}`} data-testid="manual-current-stage">当前步骤</button>}<button className="manual-motion-toggle" onClick={toggleMotion} aria-label={motionLabel} aria-pressed={motionEnabled} title={motionLabel} disabled={reducedMotion}>{motionEnabled?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>}</button><button className="repair-note-close" aria-label="收起修理手册" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <div ref={scrollArea} className="manual-scroll" onPointerDown={event=>{if(event.pointerType==='touch')swipe.current={x:event.clientX,y:event.clientY};}} onPointerCancel={()=>{swipe.current=null;}} onPointerUp={event=>{const start=swipe.current;swipe.current=null;if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)turn(pageRef.current+(dx<0?1:-1));}}>
        {opened&&<div className="manual-page-stack">
          <article key={page} className={`manual-leaf manual-current${page===-1?' is-cover-leaf':''}`} data-manual-page={page+1} aria-labelledby={`${id}-page-title`}><ManualPage page={page} demo={demo} titleId={`${id}-page-title`} animated={motionEnabled}/></article>
        </div>}
      </div>
      <footer className="manual-footer"><button className="manual-prev" disabled={page===-1} onClick={()=>turn(pageRef.current-1)} aria-label={page===0?'返回封面':'上一页'}><PageArrow back/><span>{page===0?'封面':'上一页'}</span></button><label className="manual-index"><span className="manual-sr-only">跳到说明书页面</span><select aria-label="跳到说明书页面" value={page} onChange={event=>turn(Number(event.target.value))}><option value={-1}>封面</option>{chapterNames.map((name,index)=><option key={name} value={index}>{index+1} / {pageCount} · {name}</option>)}</select></label>{page<pageCount-1?<button className={`manual-next${page===-1?' manual-open-cover':''}`} onClick={()=>turn(pageRef.current+1)} aria-label={page===-1?'翻开手册':'下一页'}><span>{page===-1?'翻开手册':'下一页'}</span><PageArrow/></button>:<button className="manual-next repair-note-action" disabled={!inRoom&&!!onTry&&disabled} onClick={begin}>{inRoom?'回到工位':onTry?'开始修理':'收好手册'}<PageArrow/></button>}</footer>
      <span className="manual-sr-only" role="status" aria-live="polite">{page===-1?'手册封面':`第 ${page+1} 页，共 ${pageCount} 页：${chapterNames[page]}`}</span>
    </div>
  </>;
}
