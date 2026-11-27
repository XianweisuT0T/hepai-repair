import type { ArrangementVersion, Finish, Stamp } from '../shared/types';

/** Authored listening examples. These are never Work/PublicWork or API exhibits. */
export interface CuratedExhibit {
  id: string;
  title: string;
  description: string;
  finish: Finish;
  stamps: { A: Stamp; B: Stamp };
  score: ArrangementVersion;
}

export const CURATED_EXHIBITS: CuratedExhibit[] = [
  { id: 'moon-forest', title: '月下林间', description: '慢一点，让柔和的主旋律与留白的敲击相遇。', finish: 'walnut', stamps: { A: 'crescent', B: 'sprout' },
    score: { tempo: 'slow', tracks: { A: { notes: ['moon', 'leaf', 'leaf', 'star'], timbre: 'soft' }, B: { notes: ['leaf', null, 'moon', null], timbre: 'wood' } } } },
  { id: 'star-letter', title: '星河来信', description: '明亮的铃声跃上星轨，伴奏在拍间轻轻回应。', finish: 'cherry', stamps: { A: 'spark', B: 'wave' },
    score: { tempo: 'gentle', tracks: { A: { notes: ['leaf', 'star', 'moon', 'star'], timbre: 'bell' }, B: { notes: [null, 'leaf', 'star', 'moon'], timbre: 'soft' } } } },
  { id: 'morning-prelude', title: '晨光序曲', description: '两条疏朗的声部轮流出现，把安静也留在作品里。', finish: 'walnut', stamps: { A: 'sprout', B: 'spark' },
    score: { tempo: 'gentle', tracks: { A: { notes: ['leaf', null, 'moon', null], timbre: 'wood' }, B: { notes: [null, 'star', null, 'leaf'], timbre: 'bell' } } } },
];

export type ListeningPart = 'together' | 'A' | 'B';
export function curatedScore(exhibit: CuratedExhibit, part: ListeningPart): ArrangementVersion {
  const score = structuredClone(exhibit.score);
  if (part !== 'together') score.tracks[part === 'A' ? 'B' : 'A'].notes = [null, null, null, null];
  return score;
}
