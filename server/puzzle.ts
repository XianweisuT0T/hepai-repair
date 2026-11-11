import type { Gear, Melody, NoteSymbol } from '../shared/types.js';

// This module is deliberately imported only by the server. Answers never enter a client bundle.
export const GEARS: Gear[] = [
  { id: 'gear-1', size: 'small', notches: 1, label: '小号 · 一道刻痕' },
  { id: 'gear-2', size: 'medium', notches: 2, label: '中号 · 两道刻痕' },
  { id: 'gear-3', size: 'large', notches: 3, label: '大号 · 三道刻痕' },
  { id: 'gear-4', size: 'small', notches: 3, label: '小号 · 三道刻痕' },
  { id: 'gear-5', size: 'large', notches: 1, label: '大号 · 一道刻痕' }
];
export const SLOTS = [
  { id: 'slot-1', shape: 'triangle' },
  { id: 'slot-2', shape: 'circle' },
  { id: 'slot-3', shape: 'square' }
];
export const GEAR_ANSWERS: Record<string, string> = {
  'slot-1': 'gear-1', 'slot-2': 'gear-2', 'slot-3': 'gear-3'
};
export const MELODIES: Record<Melody, NoteSymbol[]> = {
  bright: ['leaf', 'star', 'moon', 'star'],
  calm: ['moon', 'leaf', 'star', 'leaf']
};
export const GEAR_BLUEPRINT = SLOTS.map(slot => {
  const gear = GEARS.find(item => item.id === GEAR_ANSWERS[slot.id])!;
  return { slot: slot.id, shape: slot.shape, size: gear.size, notches: gear.notches };
});
