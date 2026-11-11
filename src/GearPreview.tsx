import { useEffect, useRef, useState } from 'react';
import type { Gear, Identity, Mark, PlacementReply } from '../shared/types';
import { GearIcon } from './MusicBox';
import './gear-preview.css';

interface GearPreviewProps {
  gear: Gear;
  preview: Mark;
  response?: Mark;
  self: Identity;
  disabled: boolean;
  installed: boolean;
  selectionChanged: boolean;
  pointedSlot?: {id:string;label:string};
  confirmed?: PlacementReply;
  onConfirm:()=>unknown;
  onFeedback: (text: '换一块' | '可以试试') => void;
}
const sizeNames = { small: '小号', medium: '中号', large: '大号' };

export default function GearPreview({ gear, preview, response, self, disabled, installed, selectionChanged, pointedSlot, confirmed, onConfirm, onFeedback }: GearPreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const mine = preview.by === self;

  useEffect(() => {
    setExpanded(true);
    const frame = requestAnimationFrame(() => {
      const panel = ref.current?.closest<HTMLElement>('.tool-panel');
      // Reveal the received part inside the phone's tool tray; leave the music box in place.
      if (panel && panel.scrollHeight > panel.clientHeight + 2) {
        const top = ref.current!.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
        const inset = window.matchMedia('(max-width: 600px)').matches ? 4 : 20;
        panel.scrollTop = Math.max(0, top - inset);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [preview.at, preview.preview]);

  useEffect(()=>{
    if(!pointedSlot || mine)return;
    setExpanded(false);
    const frame=requestAnimationFrame(()=>{
      const panel=ref.current?.closest<HTMLElement>('.tool-panel');
      if(panel && panel.scrollHeight>panel.clientHeight+2)panel.scrollTop=Math.max(0,ref.current!.offsetTop-5);
    });
    return()=>cancelAnimationFrame(frame);
  },[pointedSlot?.id,mine]);

  return <section ref={ref} className={`gear-preview ${mine ? 'is-sender' : 'is-receiver'}`} data-testid="gear-preview" data-gear-id={gear.id} aria-label={mine ? '你递出的零件近景' : '伙伴递来的零件近景'}>
    <button className="gear-preview-heading" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span className="preview-hand" aria-hidden="true"><svg viewBox="0 0 28 24"><path d="M3 15h5l4-3h6c3 0 3 3 0 3h-5m-6 6h7l10-7c2-2 0-4-2-3l-4 2M3 12v11M8 15l-1 6"/><circle cx="12" cy="5" r="3.2"/><path d="M12 0v2m0 6v2M7 5h2m6 0h2"/></svg></span>
      <span><small>{mine ? '你递到伙伴手边的' : '伙伴递到你手边的'}</small><b>{mine ? '这块吗？' : '一起看看这枚零件'}</b></span>
      <span className="preview-fold">{expanded ? '收起近景' : '展开近景'} <i aria-hidden="true">{expanded ? '−' : '+'}</i></span>
    </button>
    <div className="gear-preview-content" hidden={!expanded}>
      <div className="gear-inspection">
        <div className="gear-inspection-object"><span className="inspection-corner top-left"/><span className="inspection-corner bottom-right"/><GearIcon gear={gear} size={148}/><span className="inspection-caption">黄铜机芯 · 实物近景</span></div>
        <dl className="gear-inspection-facts">
          <div><dt>尺寸</dt><dd data-testid="preview-gear-size">{sizeNames[gear.size]}</dd><span className="size-reference" aria-hidden="true">{(['small','medium','large'] as const).map(size => <i key={size} className={`${size}${gear.size === size ? ' active' : ''}`}/>)}</span></div>
          <div><dt>轴心上方的刻痕</dt><dd data-testid="preview-gear-notches">{gear.notches} 道刻痕 <span className="notch-reference" aria-hidden="true">{Array.from({ length: gear.notches }, (_, i) => <i key={i}/>)}</span></dd></div>
        </dl>
      </div>
      <p className="inspection-part-name" data-testid="preview-gear-name">{gear.label}</p>
    </div>
    <div className="gear-preview-reply" aria-live="polite">
      {installed ? <p className="preview-confirmed">这枚已装入机芯 <span>来自工作台的安装结果</span></p>
      : confirmed ? <p className="preview-confirmed" data-testid="preview-feedback"><span>{confirmed.by===self?'你指给伙伴':'伙伴指了这里'}</span><b>{{'slot-1':'三角槽','slot-2':'圆形槽','slot-3':'方形槽'}[confirmed.slotId]}</b></p>
      : response ? <p data-testid="preview-feedback"><span>{response.by === self ? '你的回应' : '伙伴回应'}</span><b>{response.text}</b></p>
      : <p data-testid="preview-feedback"><span className="waiting-dot"/>{mine ? '已递出，等伙伴看看。' : '对照图纸，给伙伴一个回应。'}</p>}
      {!mine && !installed && <div className="preview-reply-buttons">{(['换一块','可以试试'] as const).map(text => <button key={text} disabled={disabled} aria-pressed={response?.text === text} onClick={() => onFeedback(text)}>{text}<span aria-hidden="true">{text === '换一块' ? '↶' : '↗'}</span></button>)}</div>}
      {!mine&&!installed&&(pointedSlot?<><p className="placement-selection">你在图纸上指了：{pointedSlot.label}。</p><button className="preview-confirm-placement" data-testid="confirm-placement" disabled={disabled} onClick={onConfirm}>对，就放这里 <small>{pointedSlot.label} ↗</small></button></>:<small className="preview-point-reminder">也可以先点图纸或机芯的槽位，再确认“对，就放这里”。</small>)}
      {mine && selectionChanged && !installed && <small className="preview-selection-note">你另选了一枚；再次点“这块吗？”才会递过去。</small>}
    </div>
  </section>;
}
