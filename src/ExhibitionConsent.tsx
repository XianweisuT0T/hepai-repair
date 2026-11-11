import type { Action, Snapshot } from '../shared/types';
import './score-exhibition.css';

/** Public exhibition is an explicit choice after both people enable link sharing. */
export function ExhibitionConsent({snapshot,disabled,onAction,onVisit}:{snapshot:Snapshot;disabled:boolean;onAction:(action:Action)=>unknown;onVisit:()=>void}){
  const me=snapshot.members.find(member=>member.id===snapshot.self);
  const partner=snapshot.members.find(member=>member.id!==snapshot.self);
  const shared=!!snapshot.work?.shareId;
  return <section className="exhibit-consent" aria-labelledby="exhibit-consent-title">
    <h3 id="exhibit-consent-title">再远一点，放进小展柜</h3>
    <p>链接分享与公开陈列分别选择。展柜中的访客可以看见作品名、双方刻印，试听旋律，并沿用风格创建自己的工位。</p>
    <label><input data-testid="exhibit-consent" type="checkbox" checked={!!me?.exhibitConsent} disabled={disabled||(!shared&&!me?.exhibitConsent)||(!me?.exhibitConsent&&snapshot.paused)} onChange={event=>onAction({type:'exhibitConsent',consent:event.target.checked})}/>我同意将这件作品公开陈列在合拍音乐盒博物馆</label>
    <p className="exhibit-status" data-testid="exhibit-status" role="status">{snapshot.exhibitListed?'双方已授权，作品正在小展柜中。':!shared?'先由双方开启上面的链接分享，再分别决定是否公开陈列。':me?.exhibitConsent?'你已同意，等待伙伴的公开授权。':partner?.exhibitConsent?'伙伴已同意，是否公开由你自己决定。':'目前仅通过链接分享，尚未进入小展柜。'}</p>
    <small>任意一方取消勾选即可撤展；撤展后仍可保留分享链接。私人反馈和操作记录不会陈列。展柜目前在此原型服务内开放。</small>
    <button className="text-link" data-testid="museum-from-complete" onClick={onVisit}>去小展柜看看 <span aria-hidden="true">↗</span></button>
  </section>;
}

