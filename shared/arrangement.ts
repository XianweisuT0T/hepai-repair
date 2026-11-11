import type { ArrangementPreset, ArrangementVersion, Identity, MusicTrack, Tempo } from './types';

// Public creative palette, unrelated to the server-only repair answers.
export const TRACK_PRESETS:Record<ArrangementPreset,{owner:Identity;name:string;description:string;track:MusicTrack}>={
  gentle:{owner:'A',name:'舒缓走向',description:'像晚风一样，留住轻轻的开头',track:{notes:['leaf','leaf','star','moon'],timbre:'soft'}},
  bright:{owner:'A',name:'轻快尾音',description:'把一点跳跃放在旋律的结尾',track:{notes:['star','leaf','star','moon'],timbre:'bell'}},
  sparse:{owner:'B',name:'留白敲击',description:'少一点声音，也是一种陪伴',track:{notes:['leaf',null,'star',null],timbre:'wood'}},
  pulse:{owner:'B',name:'轻轻跳动',description:'在两拍之间，接住伙伴的旋律',track:{notes:['leaf','star',null,'moon'],timbre:'wood'}}
};
export const BEAT_MS:Record<Tempo,number>={slow:850,gentle:650};
export const arrangementDuration=(version:ArrangementVersion,loops=2)=>BEAT_MS[version.tempo]*4*loops+1000;
