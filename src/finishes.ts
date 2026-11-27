import type { Finish } from '../shared/types';

/** Neutral grain lets the four pigments remain distinct under the same warm light. */
export const FINISH_PALETTES: Record<Finish,{wood:string;edge:string;highlight:string;shadow:string}> = {
  walnut: {wood:'#674838',edge:'#403025',highlight:'#94725a',shadow:'#2d231e'},
  cherry: {wood:'#a45b45',edge:'#733d31',highlight:'#c88766',shadow:'#4c2c27'},
  forest: {wood:'#366960',edge:'#20483f',highlight:'#71988b',shadow:'#18352f'},
  ivory: {wood:'#ded8c1',edge:'#b2a88b',highlight:'#f1ead6',shadow:'#8c8065'}
};
