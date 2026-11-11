import type { Work } from '../shared/types';

/** A compact record of the actual saved work, with the object itself as the centrepiece. */
export default function CompletedWorkHeader({work,soundSummary}:{work:Work;soundSummary:string}){
  const completed=new Date(work.completedAt);
  return <section className="completion-summary" data-testid="completion-summary" aria-label="共同修复的作品">
    <div className="completion-status">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L20 5M19 13v6H4V4h9"/></svg>
      <span>共同修复完成</span>
      <small>{work.demo?'单人演示':'两人共作'}</small>
    </div>
    <h2 className="work-title">{work.title}</h2>
    <p className="completion-sound">{soundSummary}</p>
    <div className="completion-caption">
      <span>{work.finish==='walnut'?'胡桃木':'樱桃木'} · 黄铜</span>
      <time dateTime={work.completedAt}>{completed.toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})} 留存</time>
    </div>
  </section>;
}
