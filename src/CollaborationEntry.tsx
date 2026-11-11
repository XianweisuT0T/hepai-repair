import { useEffect, useRef } from 'react';
import './collaboration-entry.css';

export type CollaborationIntent = 'create' | 'join';

type Props = {
  intent: CollaborationIntent;
  onIntentChange: (intent: CollaborationIntent) => void;
  onClose: () => void;
  onDemo: () => void;
  demoDisabled: boolean;
};

export default function CollaborationEntry({ intent, onIntentChange, onClose, onDemo, demoDisabled }: Props) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [onClose]);

  return <div className="modal-backdrop" onClick={onClose}>
    <section ref={panel} className="dialog paper-panel collaboration-entry" role="dialog" aria-modal="true"
      aria-labelledby="collaboration-title" aria-describedby="collaboration-status" onClick={event => event.stopPropagation()}>
      <button ref={close} className="dialog-close" aria-label="关闭双人协作窗口" onClick={onClose}>×</button>
      <div className="collaboration-content">
      <h2 id="collaboration-title">和伙伴，一起合拍。</h2>
      <p className="collaboration-intro">一人看图纸，一人装零件，中途交换，<br/>一起修好这只音乐盒。</p>
      <div className="collaboration-modes" aria-label="选择双人工位入口">
        <button type="button" className="secondary" aria-pressed={intent === 'create'} onClick={() => onIntentChange('create')}>开一间工位</button>
        <button type="button" className="secondary" aria-pressed={intent === 'join'} onClick={() => onIntentChange('join')}>加入工位</button>
      </div>
      <div className="collaboration-form">
        {intent === 'create'
          ? <><p>你先拿图纸，伙伴带着工具加入；修理到一半，再交换分工。</p><button className="secondary" disabled aria-describedby="collaboration-status">创建双人工位</button></>
          : <><label htmlFor="collaboration-room-code">伙伴的工位码</label><input id="collaboration-room-code" placeholder="6 位工位码" maxLength={6} disabled aria-describedby="collaboration-status"/><button className="secondary" disabled aria-describedby="collaboration-status">加入这间工位</button></>}
      </div>
      <div className="collaboration-status" id="collaboration-status">
        <h3>线上联机暂未开放</h3>
        <p>双人协作功能已实现。当前网页尚未部署实时联机服务，暂时不能创建或加入双人工位。</p>
        <p>可以先用单人演示，切换 A / B，体验双方的修复与共创流程。</p>
      </div>
      </div>
      <button className="primary collaboration-demo" data-testid="collaboration-demo" disabled={demoDisabled} onClick={onDemo}>先用单人演示 <span aria-hidden="true">↗</span></button>
    </section>
  </div>;
}
