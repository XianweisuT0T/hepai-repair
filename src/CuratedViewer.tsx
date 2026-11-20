import { useEffect, useRef, useState } from 'react';
import type { ArrangementVersion } from '../shared/types';
import WorkshopMusicBox from './WorkshopMusicBox';
import { ScoreContributions } from './CooperationCue';
import { curatedScore, type CuratedExhibit, type ListeningPart } from './curatedExhibits';

export interface MuseumPlayback {
  playing: boolean;
  highlight: number | null;
  audibleVersion: ArrangementVersion | null;
  clock: { startedAt: number; beatMs: number; beats: number; loops: number } | null;
  onPlay: (score: ArrangementVersion) => void;
  onStop: () => void;
}

export default function CuratedViewer({ exhibit, playback, onBack }: { exhibit: CuratedExhibit; playback: MuseumPlayback; onBack: () => void }) {
  const [part, setPart] = useState<ListeningPart>('together');
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  const score = playback.playing && playback.audibleVersion ? playback.audibleVersion : curatedScore(exhibit, part);
  return <section className="curated-viewer" data-testid="curated-viewer">
    <button className="museum-back" onClick={onBack}>返回示例展柜</button>
    <header className="curated-title"><h1 ref={title} tabIndex={-1}>{exhibit.title}</h1><p>策展示例 · 非真实用户共创作品</p></header>
    <div className="curated-layout">
      <div className="curated-model">
        <WorkshopMusicBox stage="preview" previewState="restored" view="box" roomKey={`curated:${exhibit.id}`} allowExpand
          finish={exhibit.finish} stamps={exhibit.stamps} workTitle={exhibit.title} notes={score.tracks.A.notes}
          score={score} playing={playback.playing} highlightNote={playback.highlight} playbackStartedAt={playback.clock?.startedAt}
          playbackBeatMs={playback.clock?.beatMs} playbackBeats={playback.clock?.beats} playbackLoops={playback.clock?.loops} onRequestStop={playback.onStop} />
        <p className="curated-orbit-note">拖动欣赏不同角度；手机上点「放大欣赏」后旋转。</p>
      </div>
      <div className="curated-listening">
        <h2>听见两种选择，如何相遇</h2><p>{exhibit.description}</p>
        <p className="curated-material">{exhibit.finish === 'walnut' ? '胡桃木' : '樱桃木'} / {exhibit.score.tempo === 'slow' ? '舒缓节奏' : '轻快节奏'}</p>
        <div className="curated-parts" role="group" aria-label="选择试听声部">
          {(['together', 'A', 'B'] as const).map(value => <button key={value} aria-pressed={part === value} onClick={() => { playback.onStop(); setPart(value); }}>{value === 'together' ? '完整合奏' : value === 'A' ? '只听 A' : '只听 B'}</button>)}
        </div>
        <ScoreContributions score={score} playing={playback.playing} beat={playback.highlight} />
        <p className="curated-explanation">A 的音高托起星星，B 的伴奏点亮小灯。单独听一条声部，再听它们合在一起。</p>
        <div className="curated-player">
          <button className="museum-primary" data-testid="curated-play" onClick={() => playback.onPlay(curatedScore(exhibit, part))}>{playback.playing ? '从头再听' : '试听这一版'}</button>
          <button className="museum-back" disabled={!playback.playing} onClick={playback.onStop}>停止试听</button>
        </div>
        <p className="curated-play-status" role="status">{playback.playing ? '正在试听 · 音符与舞台一起变化' : '点按试听后播放，可随时停止。'}</p>
      </div>
    </div>
  </section>;
}
