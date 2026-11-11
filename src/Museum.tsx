import { useEffect, useState } from 'react';
import type { MusicTrack, PublicWork } from '../shared/types';
import MusicBox, { NoteIcon, StampIcon } from './MusicBox';
import './museum.css';
import { IS_STATIC_DEMO } from './runtimeMode';

interface MuseumProps {
  onBack: () => void;
  onCreate: () => void;
  onSelect: (work: PublicWork) => void;
  onPersonalWorks?: () => void;
  createDisabled?: boolean;
}

type LoadState = 'loading' | 'ready' | 'error';
const timbreNames = { bell: '玻璃铃', wood: '木琴', soft: '柔和钢片' };
const noteSymbols = new Set(['leaf', 'star', 'moon']);
const stampSymbols = new Set(['sprout', 'crescent', 'spark', 'wave']);

function isTrack(value: unknown): value is MusicTrack {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<MusicTrack>;
  return Array.isArray(track.notes) && track.notes.length === 4
    && track.notes.every(symbol => symbol === null || noteSymbols.has(symbol))
    && (track.timbre === 'bell' || track.timbre === 'wood' || track.timbre === 'soft');
}

function isExhibit(value: unknown): value is PublicWork {
  if (!value || typeof value !== 'object') return false;
  const work = value as Partial<PublicWork>;
  return typeof work.id === 'string' && !!work.id && typeof work.shareId === 'string' && !!work.shareId
    && typeof work.title === 'string' && !!work.title.trim() && work.demo === false
    && typeof work.completedAt === 'string' && Number.isFinite(Date.parse(work.completedAt))
    && (work.finish === 'walnut' || work.finish === 'cherry')
    && (work.timbre === 'bell' || work.timbre === 'wood' || work.timbre === 'soft')
    && Array.isArray(work.notes) && work.notes.length === 4 && work.notes.every(symbol => noteSymbols.has(symbol))
    && (!work.stamps || (stampSymbols.has(work.stamps.A) && stampSymbols.has(work.stamps.B)))
    && (!work.arrangement || ((work.arrangement.tempo === 'slow' || work.arrangement.tempo === 'gentle')
      && isTrack(work.arrangement.tracks?.A) && isTrack(work.arrangement.tracks?.B)));
}

function DirectionIcon({ back = false }: { back?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="museum-direction">
    {back ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 19 19 5M7 5h12v12" />}
  </svg>;
}

function Track({ label, track }: { label: string; track: MusicTrack }) {
  return <div className="museum-track">
    <span className="museum-track-owner">{label}</span>
    <div className="museum-track-notes" aria-label={`${label}的声音片`}>
      {track.notes.map((symbol, index) => <span key={index} className="museum-track-step">
        {symbol ? <NoteIcon symbol={symbol} size={20} /> : <svg viewBox="0 0 24 24" role="img" aria-label="留白"><path d="M6 12h12" /></svg>}
      </span>)}
    </div>
    <span className="museum-track-timbre">{timbreNames[track.timbre]}</span>
  </div>;
}

function Exhibit({ work, onSelect }: { work: PublicWork; onSelect: MuseumProps['onSelect'] }) {
  const date = new Date(work.completedAt);
  const tracks = work.arrangement?.tracks;
  return <li className="museum-exhibit" data-testid={`museum-card-${work.id}`} data-work-id={work.id} data-finish={work.finish}>
    <div className="museum-object" aria-hidden="true">
      <MusicBox stage="preview" previewState="restored" view="box" finish={work.finish}
        notes={work.notes} stamps={work.stamps} workTitle={work.stamps ? work.title : undefined} />
      <div className="museum-plinth" />
    </div>
    <article className="museum-label" aria-labelledby={`museum-title-${work.id}`}>
      <div className="museum-label-heading">
        <h3 id={`museum-title-${work.id}`}>{work.title}</h3>
        <time dateTime={work.completedAt}>{date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' })}</time>
      </div>
      <div className="museum-score">
        {tracks ? <><Track label="A" track={tracks.A} /><Track label="B" track={tracks.B} /></>
          : <Track label="旋律" track={{ notes: work.notes, timbre: work.timbre }} />}
      </div>
      <div className="museum-material-and-stamps">
        <span>{work.finish === 'cherry' ? '樱桃木' : '胡桃木'} · 黄铜</span>
        {work.stamps && <span className="museum-stamps" aria-label="两位伙伴留下的刻印">
          {(['A', 'B'] as const).map(id => <span key={id}><small>{id}</small><StampIcon stamp={work.stamps![id]} size={22} /></span>)}
        </span>}
      </div>
      <button type="button" className="museum-open" data-testid={`museum-open-${work.shareId}`} onClick={() => onSelect(work)} aria-label={`欣赏音乐盒：${work.title}`}>
        欣赏这只音乐盒 <DirectionIcon />
      </button>
    </article>
  </li>;
}

export default function Museum({ onBack, onCreate, onSelect, onPersonalWorks, createDisabled = false }: MuseumProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [works, setWorks] = useState<PublicWork[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (IS_STATIC_DEMO) { setWorks([]); setState('ready'); return; }
    const request = new AbortController();
    setState('loading'); setWorks([]);
    fetch('/api/exhibits', { signal: request.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Exhibit request failed');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('works' in data) || !Array.isArray(data.works) || !data.works.every(isExhibit)) throw new Error('Invalid exhibit response');
        if (!request.signal.aborted) { setWorks(data.works.slice(0, 12)); setState('ready'); }
      })
      .catch(() => { if (!request.signal.aborted) setState('error'); });
    return () => request.abort();
  }, [attempt]);

  return <main className="museum-view" data-testid="museum">
    <nav className="museum-nav" aria-label="展柜导航">
      <button type="button" className="museum-back" data-testid="museum-back" onClick={onBack}><DirectionIcon back />回修理铺</button>
      <button type="button" className="museum-create-link" data-testid="museum-create" disabled={createDisabled} aria-busy={createDisabled} onClick={onCreate}>{IS_STATIC_DEMO?'开始单人体验':'和伙伴修一只'} <DirectionIcon /></button>
    </nav>
    <header className="museum-heading">
      <h1>合拍音乐盒博物馆</h1>
      <p>一个小小展柜，放下两个人一起修好的旋律。</p>
    </header>

    {state === 'loading' && <section className="museum-message museum-loading" data-testid="museum-loading" role="status" aria-live="polite">
      <div className="museum-fetch-line" aria-hidden="true"><span /></div>
      <h2>正在打开小展柜…</h2>
      <p>看看有哪些音乐盒，被两位伙伴一起留在了这里。</p>
    </section>}

    {state === 'error' && <section className="museum-message museum-error" data-testid="museum-error" role="alert">
      <h2>展柜暂时没能打开。</h2>
      <p>这次没有取到展品。可以再试一次，或先回修理铺。</p>
      <button type="button" className="museum-primary" data-testid="museum-retry" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>重新打开展柜 <DirectionIcon /></button>
    </section>}

    {state === 'ready' && works.length === 0 && <section className="museum-empty" data-testid="museum-empty" aria-labelledby="museum-empty-title">
      <div className="museum-empty-stage" aria-hidden="true">
        <div className="museum-empty-space" />
        <div className="museum-empty-plate">为下一次合拍，留个位置</div>
        <div className="museum-empty-shelf" />
      </div>
      <div className="museum-empty-invitation">
        <h2 id="museum-empty-title">{IS_STATIC_DEMO?<>小展台，<br />为未来的合拍留个位置。</>:<>第一只音乐盒，<br />可以由你们一起修好。</>}</h2>
        <p>{IS_STATIC_DEMO?<>当前版本开放单人体验，暂未开放公共作品陈列。<br />你完成的旋律会留在当前浏览器，也可以下载图片。</>:<>这里还没有共同同意展出的作品。<br />小展台先空着，等一段属于你们的旋律。</>}</p>
        <button type="button" className="museum-primary" data-testid="museum-create-first" disabled={createDisabled} aria-busy={createDisabled} onClick={onCreate}>{IS_STATIC_DEMO?'先修好自己的音乐盒':'和伙伴修第一只'} <DirectionIcon /></button>
        {onPersonalWorks && <button type="button" className="museum-own-works" data-testid="museum-own-works" onClick={onPersonalWorks}>先看看我的作品</button>}
        <p className="museum-consent-note">{IS_STATIC_DEMO?'单人体验作品不会自动公开，也不会放入公共展柜。':'修好后，先生成双方同意的只读链接，再各自同意放进展柜。'}</p>
      </div>
    </section>}

    {state === 'ready' && works.length > 0 && <section className="museum-collection" aria-labelledby="museum-collection-title">
      <div className="museum-collection-heading"><h2 id="museum-collection-title">小小展柜</h2><span>{works.length} 只音乐盒正在展出</span></div>
      <p className="museum-browse-note">挑一只欣赏，转着看看，也听听它的声音。</p>
      <ul className="museum-shelf">{works.map(work => <Exhibit key={work.shareId} work={work} onSelect={onSelect} />)}</ul>
    </section>}

    {state === 'ready' && <footer className="museum-footer">
      <p>{IS_STATIC_DEMO?'未来只陈列由双方共同同意公开的作品。当前没有虚构展品。':'每一件展品，都由两位伙伴共同同意公开展出。修理时的私密反馈不会放进展柜。'}</p>
      <span>小小修理，慢慢靠近。</span>
    </footer>}
  </main>;
}
