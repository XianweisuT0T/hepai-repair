import type { Finish } from './types';

// Keep existing IDs so saved works and shared links retain their chosen finish.
export const FINISH_IDS = ['walnut', 'cherry', 'forest', 'ivory'] as const;
export const FINISH_NAMES: Record<Finish,string> = {
  walnut: '胡桃棕', cherry: '樱桃红', forest: '松石绿', ivory: '月光白'
};
export function isFinish(value:unknown):value is Finish {
  return FINISH_IDS.some(finish=>finish===value);
}
