import type { ArrangementVersion, Identity } from './types';

export function describeScoreChange(before:ArrangementVersion,after:ArrangementVersion,self:Identity,demo=false){
  const parts:string[]=[];
  for(const id of ['A','B'] as const){
    const old=before.tracks[id],next=after.tracks[id];
    const beats=next.notes.flatMap((note,index)=>note!==old.notes[index]?[index+1]:[]);
    const who=id===self?'你':demo?`${id} 角色`:'伙伴';
    const edits=[beats.length?`第 ${beats.join('、')} 拍`:'',old.timbre!==next.timbre?'音色':''].filter(Boolean);
    if(edits.length)parts.push(`${who}调整了${id==='A'?'主旋律':'伴奏'}的${edits.join('和')}`);
  }
  if(before.tempo!==after.tempo)parts.push(`共同速度改为${after.tempo==='slow'?'慢一点':'轻快一点'}`);
  return parts.length?`${parts.join('；')}。这一版需要双方重新确认。`:'';
}
