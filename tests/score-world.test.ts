import test from 'node:test';
import assert from 'node:assert/strict';
import type { ArrangementVersion } from '../shared/types';
import { getScoreWorldLayout, sampleScoreWorldClock, scoreFromNotes, SCORE_PITCH_HZ } from '../shared/scoreWorld';

const score:ArrangementVersion={tempo:'gentle',tracks:{A:{notes:['leaf','star','moon','leaf'],timbre:'soft'},B:{notes:['leaf',null,'moon',null],timbre:'wood'}}};
test('A音高只决定对应星高度；修改第三拍不改其他星或B灯',()=>{
  const before=getScoreWorldLayout(score),changed=getScoreWorldLayout({...score,tracks:{...score.tracks,A:{...score.tracks.A,notes:['leaf','star','leaf','leaf']}}});
  assert.ok(SCORE_PITCH_HZ.leaf<SCORE_PITCH_HZ.star&&SCORE_PITCH_HZ.star<SCORE_PITCH_HZ.moon);
  assert.ok(before.starHeights[0]<before.starHeights[1]&&before.starHeights[1]<before.starHeights[2]);
  assert.ok(changed.starHeights[2]<before.starHeights[2]);
  assert.deepEqual(changed.starHeights.filter((_,i)=>i!==2),before.starHeights.filter((_,i)=>i!==2));
  assert.deepEqual(changed.lampOn,before.lampOn);
  assert.ok(Math.max(...before.starHeights)+.08<1.22);
});
test('B音符只决定有音/留白，不借音高或音色捏造强弱',()=>{
  const before=getScoreWorldLayout(score),changed=getScoreWorldLayout({...score,tracks:{...score.tracks,B:{notes:['moon',null,'leaf',null],timbre:'bell'}}});
  assert.deepEqual(before.lampOn,[true,false,true,false]);assert.deepEqual(changed.lampOn,before.lampOn);assert.deepEqual(changed.starHeights,before.starHeights);
});
test('同一起点与tempo确定拍相位，未来起点等待，尾音不继续脉冲',()=>{
  const fast=getScoreWorldLayout(score),slow=getScoreWorldLayout({...score,tempo:'slow'});
  const clock={playing:true,startedAt:1000,loops:2};
  assert.equal(sampleScoreWorldClock(fast,clock,999).pending,true);
  assert.equal(sampleScoreWorldClock(fast,clock,1700).beat,1);
  assert.equal(sampleScoreWorldClock(slow,clock,1700).beat,0);
  assert.equal(sampleScoreWorldClock(fast,clock,1000+650*8).beat,null);
  assert.equal(sampleScoreWorldClock(fast,clock,1000+650*8+500).pulse,0);
  assert.equal(sampleScoreWorldClock(fast,clock,1000+650*8+500).playing,true);
});
test('legacy620ms与总拍数覆盖保持同步，停止立即无当前拍',()=>{
  const layout=getScoreWorldLayout(scoreFromNotes(['moon','leaf','star','moon']));
  assert.deepEqual(layout.lampOn,[false,false,false,false]);
  assert.equal(sampleScoreWorldClock(layout,{playing:true,startedAt:0,beatMs:620,beats:12},620*5).beat,1);
  assert.equal(sampleScoreWorldClock(layout,{playing:true,startedAt:0,beatMs:620,beats:12},620*12).active,false);
  assert.equal(sampleScoreWorldClock(layout,{playing:false,startedAt:0,beatMs:620,beats:12},620*5).beat,null);
});
