import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeScoreChange } from '../shared/cooperation';
import { scoreFromNotes } from '../shared/scoreWorld';

test('score change describes both contributors, rests and tempo without attributing shared tempo to a person',()=>{
  const before=scoreFromNotes(['leaf','star','moon','star']);
  const after=structuredClone(before);
  after.tracks.A.notes[2]='leaf';after.tracks.B.notes[1]='moon';after.tempo='slow';
  const message=describeScoreChange(before,after,'A');
  assert.match(message,/你调整了主旋律的第 3 拍/);
  assert.match(message,/伙伴调整了伴奏的第 2 拍/);
  assert.match(message,/共同速度改为慢一点/);
  assert.match(message,/双方重新确认/);
  assert.match(describeScoreChange(after,before,'A',true),/B 角色调整了伴奏的第 2 拍/);
  assert.equal(describeScoreChange(before,before,'B'),'');
});
