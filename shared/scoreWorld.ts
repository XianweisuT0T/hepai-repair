import { BEAT_MS } from './arrangement';
import type { ArrangementVersion, NoteSymbol, Tempo, Timbre } from './types';

export type Four<T> = [T,T,T,T];
export const SCORE_PITCH_HZ:Record<NoteSymbol,number>={leaf:523.25,star:659.25,moon:783.99};
export const SCORE_STAR_HEIGHT:Record<NoteSymbol,number>={leaf:.44,star:.67,moon:.90};
export const SCORE_LAMP_DIM=.025;
export const SCORE_LAMP_ON=.32;

export interface ScoreWorldLayout {
  tempo:Tempo;
  beatMs:number;
  lead:Four<NoteSymbol|null>;
  accompaniment:Four<NoteSymbol|null>;
  starHeights:Four<number>;
  lampOn:Four<boolean>;
}
export interface ScorePlayback {
  playing:boolean;
  startedAt?:number;
  loops?:number;
  beatMs?:number;
  beats?:number;
}
export interface ScoreClock {
  playing:boolean;
  active:boolean;
  pending:boolean;
  beat:number|null;
  phase:number;
  pulse:number;
  beatMs:number;
  elapsedBeats:number;
  totalBeats:number;
}
export interface ScoreWorldRenderedState extends ScoreClock {
  tempo:Tempo;
  starHeights:Four<number>;
  starBaseHeights:Four<number>;
  starScales:Four<number>;
  starWorldHeights:Four<number>;
  lampOn:Four<boolean>;
  lampIntensities:Four<number>;
}

export function fourNotes(notes:readonly(NoteSymbol|null)[]):Four<NoteSymbol|null>{
  return [notes[0]??null,notes[1]??null,notes[2]??null,notes[3]??null];
}

/** Legacy works contribute only the notes they actually contain, never a made-up B track. */
export function scoreFromNotes(notes:readonly(NoteSymbol|null)[],timbre:Timbre='soft',tempo:Tempo='gentle'):ArrangementVersion{
  return {tempo,tracks:{A:{notes:fourNotes(notes),timbre},B:{notes:[null,null,null,null],timbre:'wood'}}};
}

export function getScoreWorldLayout(score:ArrangementVersion):ScoreWorldLayout{
  const lead=fourNotes(score.tracks.A.notes),accompaniment=fourNotes(score.tracks.B.notes);
  return {tempo:score.tempo,beatMs:BEAT_MS[score.tempo],lead,accompaniment,
    starHeights:lead.map(note=>note?SCORE_STAR_HEIGHT[note]:.30)as Four<number>,
    lampOn:accompaniment.map(note=>note!==null)as Four<boolean>};
}

/** Epoch milliseconds are shared with the audio scheduler. No independent animation clock. */
export function sampleScoreWorldClock(layout:ScoreWorldLayout,playback:ScorePlayback,nowMs:number):ScoreClock{
  const beatMs=playback.beatMs!==undefined&&Number.isFinite(playback.beatMs)&&playback.beatMs>0?playback.beatMs:layout.beatMs;
  const loops=playback.loops!==undefined&&Number.isFinite(playback.loops)?Math.max(1,Math.floor(playback.loops)):1;
  const totalBeats=playback.beats!==undefined&&Number.isFinite(playback.beats)?Math.max(0,Math.floor(playback.beats)):4*loops;
  const hasStart=playback.startedAt!==undefined&&Number.isFinite(playback.startedAt);
  const elapsed=hasStart?nowMs-playback.startedAt!:0;
  const pending=playback.playing&&hasStart&&elapsed<0&&totalBeats>0;
  const elapsedBeats=playback.playing&&hasStart?Math.max(0,Math.min(totalBeats,elapsed/beatMs)):0;
  const active=playback.playing&&hasStart&&elapsed>=0&&elapsed<beatMs*totalBeats;
  const phase=active?elapsedBeats-Math.floor(elapsedBeats):0;
  const pulse=active&&phase<.72?Math.sin(Math.PI*phase/.72)**2:0;
  return {playing:playback.playing,active,pending,beat:active?Math.floor(elapsedBeats)%4:null,phase,pulse,beatMs,elapsedBeats,totalBeats};
}
