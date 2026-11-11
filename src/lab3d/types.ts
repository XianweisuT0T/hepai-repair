export type LabMode = 'observe' | 'assemble';
export interface Lab3DState {
  mode: LabMode;
  lidOpen: boolean;
  selected: boolean;
  installed: boolean;
  installingAt: number | null;
  winding: number;
  playing: boolean;
  epoch: number;
  viewRevision: number;
  reduceMotion: boolean;
  lidMoving?: boolean;
}
export interface MusicBox3DProps {
  state: Lab3DState;
  onSelect: () => void;
  onInstall: () => void;
  /** Effective clockwise travel, normalized so one full turn fills the spring. */
  onWind: (fraction: number) => void;
  onError: (message: string) => void;
}
export const LAB_INSTALL_MS = 700;
export const LAB_PLAY_MS = 6500;
