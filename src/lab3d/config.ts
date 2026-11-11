export const BOX = { width: 6.4, depth: 3.9, rimY: 1.58, deckY: 1.25, deckTop: 1.37, hingeZ: -1.95 };
export const GEARS = [
  { id: 'left', radius: .52, teeth: 14, notches: 1, x: -1.65, z: .85 },
  { id: 'middle', radius: .65, teeth: 18, notches: 2, x: -.15, z: .85 },
  { id: 'last', radius: .73, teeth: 20, notches: 3, x: 1.5, z: .85 },
] as const;
export const PAD_POSITION = [-3.65, .36, 2.65] as const;
export const GEAR_TARGET = [GEARS[2].x, BOX.deckTop + .04, GEARS[2].z] as const;
export const CRANK_CENTER = [3.46, .94, .08] as const;
export const CAMERA = { position: [7.9, 6.97, 10.0] as const, target: [0, 2.1, 0] as const, fov: 35 };
