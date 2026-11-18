import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import './commissions.css';

const PrismLanternViewer = lazy(() => import('./commissions/PrismLanternViewer'));
const colors = [
  { name: '琥珀', swatch: '#edb76b' },
  { name: '翡翠', swatch: '#8cd7b9' },
  { name: '暮紫', swatch: '#b8a0e6' },
];
const patterns = ['林间', '鹿影', '月山'];

class LanternBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="commission-error" role="alert">
      <p>棱灯暂时没能点亮。</p>
      <button className="secondary" onClick={this.props.onRetry}>重新打开模型</button>
    </div>;
  }
}

export default function PrismLanternCommission({ standalone = false }: { standalone?: boolean }) {
  const [expanded, setExpanded] = useState(standalone);
  const [colorIndex, setColorIndex] = useState(0);
  const [patternIndex, setPatternIndex] = useState(0);
  const [viewRevision, setViewRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);

  return <section id="future-prism" className={`future-commission prism-commission${standalone ? ' standalone-commission' : ''}`} aria-labelledby="future-prism-title">
    <div className="commission-heading">
      <h2 id="future-prism-title">合拍棱灯</h2>
      <span className="commission-concept-label">未来修理委托 · 概念试作</span>
    </div>
    <div className="commission-introduction">
      <p>一人调光色，一人换剪影。两人的选择落在同一片灯幕上。</p>
      <div className="commission-role-description">
        <p><b>A · 调光</b><span>转动左侧色轮，改变棱镜的光色。</span></p>
        <p><b>B · 换影</b><span>挑选右侧剪影卡，换一幅投影。</span></p>
      </div>
    </div>
    {!expanded ? <button className="commission-open" data-testid="prism-lantern-open" aria-expanded={false} onClick={() => setExpanded(true)}>
      <span>试试这盏棱灯</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>
    </button> : <div className="commission-preview">
      <div className="commission-viewer-frame prism-viewer-frame">
        <LanternBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}>
          <Suspense fallback={<div className="commission-loading" role="status">正在点亮棱灯…</div>}>
            <PrismLanternViewer colorIndex={colorIndex} patternIndex={patternIndex} viewRevision={viewRevision} onColorChange={setColorIndex} onPatternChange={setPatternIndex}/>
          </Suspense>
        </LanternBoundary>
      </div>
      <div className="commission-controls prism-controls">
        <div className="prism-control-groups">
          <div className="prism-choice">
            <h3 id="prism-color-label">A · 光色</h3>
            <div className="commission-chart-controls" role="group" aria-labelledby="prism-color-label">
              {colors.map(({ name, swatch }, index) => <button key={name} type="button" data-testid={`prism-color-${index}`} aria-pressed={colorIndex === index} onClick={() => setColorIndex(index)}>
                <span className="prism-swatch" aria-hidden="true" style={{ backgroundColor: swatch }}/>{name}
              </button>)}
            </div>
          </div>
          <div className="prism-choice">
            <h3 id="prism-pattern-label">B · 剪影</h3>
            <div className="commission-chart-controls" role="group" aria-labelledby="prism-pattern-label">
              {patterns.map((name, index) => <button key={name} type="button" data-testid={`prism-pattern-${index}`} aria-pressed={patternIndex === index} onClick={() => setPatternIndex(index)}>{name}</button>)}
            </div>
          </div>
        </div>
        <div className="commission-preview-footer prism-controls-footer">
          <small>轻点色轮或剪影卡也能切换。拖动空处换角度。</small>
          <div>
            <button className="subtle" data-testid="prism-reset-view" onClick={() => setViewRevision(value => value + 1)}>复位视角</button>
            {!standalone && <button className="subtle" data-testid="prism-lantern-close" onClick={() => setExpanded(false)}>收起模型</button>}
          </div>
        </div>
      </div>
    </div>}
    <p className="commission-scope">当前可在同一台设备上预览两种操作，双人委托流程仍在设计中。</p>
  </section>;
}
