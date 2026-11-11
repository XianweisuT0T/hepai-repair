export type Identity = 'A' | 'B';
export type Role = 'guide' | 'maker';
export type Stage = 'waiting' | 'gears' | 'swap' | 'melody' | 'arrange' | 'launch' | 'performance' | 'complete' | 'ended';
export type NoteSymbol = 'leaf' | 'star' | 'moon';
export type Melody = 'bright' | 'calm';
export type Timbre = 'bell' | 'wood' | 'soft';
export type Finish = 'walnut' | 'cherry';
export type Stamp = 'sprout' | 'crescent' | 'spark' | 'wave';
export type ArrangementPreset = 'gentle'|'bright'|'sparse'|'pulse';
export type Tempo = 'slow'|'gentle';
export interface MusicTrack { notes:(NoteSymbol|null)[]; timbre:Timbre }
export interface ArrangementVersion { tracks:Record<Identity,MusicTrack>; tempo:Tempo }
export interface ArrangementState {
  current:ArrangementVersion; previous?:ArrangementVersion;
  previousTracks?:Partial<Record<Identity,MusicTrack>>;
  approved:Record<Identity,boolean>; revision:number;
  audition?:{by:Identity;version:'current'|'previous';at:number};
}
export interface Milestone { type:'first_point'|'first_install'|'tools_swapped'|'started'; at:string }
export interface PlacementReply { by:Identity; gearId:string; slotId:string; previewAt:number; at:number }
/** A private note exchanged only by the two members of the completed room. */
export interface PaperNote { id:string; from:Identity; to:Identity; text:string; sentAt:number; readAt?:number }
export interface Gear { id: string; size: 'small' | 'medium' | 'large'; notches: number; label: string }
export interface Blueprint { gears?: {slot: string; shape: string; size: Gear['size']; notches: number}[]; notes?: NoteSymbol[] }
export interface MemberView { id: Identity; connected: boolean; ready: boolean; swapReady: boolean; launchReady: boolean; shareConsent: boolean; exhibitConsent: boolean; word: string; left: boolean }
export interface Mark { by: Identity; target: string; text: string; at: number; preview?: string }
export interface Work { id: string; title: string; melody: Melody; notes: NoteSymbol[]; timbre: Timbre; finish: Finish; completedAt: string; demo: boolean; shareId?: string; stamps?:Record<Identity,Stamp>; milestones?:Milestone[]; arrangement?:ArrangementVersion }
export interface Snapshot {
  code: string; mode: 'real' | 'demo'; self: Identity; role: Role; stage: Stage; version: number;
  members: MemberView[]; gears: Gear[]; installed: Record<string,string>; slots: {id:string;shape:string}[];
  notes: (NoteSymbol | null)[]; melody: Melody | null; timbre: Timbre; finish: Finish;
  blueprint?: Blueprint; marks: Mark[]; hintCount: number; hint?: string; work?: Work;
  performanceAt?: number; expiresAt: number; paused: boolean; testConsent: boolean;
  placementReply?:PlacementReply; winding?:number; stamps?:Record<Identity,Stamp>; milestones?:Milestone[];
  windingAt?:number; windingDurationMs?:number; windingPausedAt?:number;
  arrangement?:ArrangementState; performanceDurationMs?:number; exhibitListed:boolean;
  paperNotes?:PaperNote[];
}
export type Action =
  | {type:'ready'} | {type:'placeGear';gearId:string;slotId:string}
  | {type:'mark';target:string;text:string;preview?:string}
  | {type:'confirmPlacement';gearId:string;slotId:string;previewAt:number}
  | {type:'hint'} | {type:'swapReady'} | {type:'selectMelody';melody:Melody}
  | {type:'placeNote';index:number;symbol:NoteSymbol | null} | {type:'checkMelody'}
  | {type:'setTimbre';timbre:Timbre} | {type:'setFinish';finish:Finish}
  | {type:'launchReady'} | {type:'wind'} | {type:'finishPerformance'} | {type:'setWord';word:string}
  | {type:'setStamp';stamp:Stamp}
  | {type:'setTrackPreset';preset:ArrangementPreset}
  | {type:'setTrackStep';index:number;symbol:NoteSymbol|null}
  | {type:'setTempo';tempo:Tempo} | {type:'restoreOwnTrack'}
  | {type:'auditionArrangement';version:'current'|'previous'}
  | {type:'approveTrack'} | {type:'reopenArrangement'}
  | {type:'sendNote';text:string} | {type:'readNote';noteId:string}
  | {type:'shareConsent';consent:boolean} | {type:'exhibitConsent';consent:boolean} | {type:'testConsent';consent:boolean}
  | {type:'feedback';comfortable:string;again:string;comment:string;consent?:boolean} | {type:'leave'};
export interface Command { id:string; code:string; stage:Stage; version:number; action:Action }
export interface Result { ok:boolean; error?:string; code?:string; token?:string; self?:Identity; snapshot?:Snapshot; duplicate?:boolean }
export interface CreateInput { mode:'real'|'demo'; relayId?:string }
export interface JoinInput {code:string}
export interface ResumeInput {code:string;token:string}
export interface PublicWork extends Work { shareId:string }
