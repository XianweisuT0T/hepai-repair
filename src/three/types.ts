import type { ArrangementVersion, Finish, Gear, Mark, NoteSymbol, Role, Stage, Stamp, Work } from '../../shared/types';

/** Public rendering state only. Private blueprints and room credentials stay outside WebGL. */
export interface CollaborativeSceneProps {
  stage: Stage | 'preview';
  roomKey: string;
  role?: Role;
  previewState: 'unrepaired' | 'restored';
  cameraPreparing?: boolean;
  view: 'box' | 'mechanism' | 'winding';
  installedGearMap: Partial<Record<string, Gear>>;
  gears: Gear[];
  notes: (NoteSymbol | null)[];
  finish: Finish;
  selectedGear: Gear | null;
  selectedNote: NoteSymbol | null;
  marks: Mark[];
  playing: boolean;
  score?: ArrangementVersion;
  playbackStartedAt?: number;
  playbackLoops?: number;
  playbackBeatMs?: number;
  playbackBeats?: number;
  highlightNote: number | null;
  windingProgress: number;
  windingStarted: boolean;
  guideReady: boolean;
  canPlaceGears: boolean;
  canPlaceNotes: boolean;
  canPoint: boolean;
  canWind: boolean;
  canArm: boolean;
  stamps?: Record<'A' | 'B', Stamp>;
  workTitle?: string;
  work?: Work;
  lidOpen: boolean;
  mode: 'observe' | 'assemble';
  viewRevision: number;
  reduceMotion: boolean;
  onSlot: (id: string) => void;
  onNoteSlot: (index: number) => void;
  onPoint: (target: string) => void;
  onWind: () => void;
  onArm: () => void;
  onReady: () => void;
  onError: (message: string) => void;
  onCameraMoving?: (moving: boolean) => void;
  onCrankHint?: (message: string | null) => void;
}
