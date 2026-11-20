import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_EXHIBITS, curatedScore } from '../src/curatedExhibits';

test('策展示例有不同的双声部，且不冒充真实授权作品', () => {
  assert.equal(CURATED_EXHIBITS.length, 3);
  assert.equal(new Set(CURATED_EXHIBITS.map(e => JSON.stringify(e.score))).size, 3);
  for (const exhibit of CURATED_EXHIBITS) {
    for (const key of ['shareId', 'demo', 'completedAt', 'members', 'exhibitConsent']) assert.equal(key in exhibit, false);
    for (const track of Object.values(exhibit.score.tracks)) {
      assert.equal(track.notes.length, 4);
      assert.ok(track.notes.some(Boolean));
      assert.ok(track.notes.every(n => n === null || ['leaf', 'star', 'moon'].includes(n)));
    }
  }
});

test('分声部试听只静音另一条声部，不能改动原曲谱', () => {
  for (const exhibit of CURATED_EXHIBITS) {
    const original = structuredClone(exhibit.score);
    for (const part of ['A', 'B'] as const) {
      const score = curatedScore(exhibit, part);
      assert.deepEqual(score.tracks[part], original.tracks[part]);
      assert.deepEqual(score.tracks[part === 'A' ? 'B' : 'A'].notes, [null, null, null, null]);
      assert.equal(score.tempo, original.tempo);
      score.tracks[part].notes[0] = null;
    }
    assert.deepEqual(exhibit.score, original);
    assert.deepEqual(curatedScore(exhibit, 'together'), original);
  }
});
