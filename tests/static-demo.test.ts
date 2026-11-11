import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStaticDemoTransport, STATIC_DEMO_STORAGE_KEY, type StaticDemoOptions, type StaticDemoTransport } from '../src/staticDemo';
import type { Action, Command, Snapshot } from '../shared/types';

class MemoryStorage {
  entries = new Map<string, string>();
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  removeItem(key: string) { this.entries.delete(key); }
}
class Clock {
  time = 100_000; next = 1;
  timers = new Map<number, { at: number; callback: () => void }>();
  options(storage: MemoryStorage): StaticDemoOptions {
    return { storage, now: () => this.time,
      setTimeout: (callback, milliseconds) => { const id = this.next++; this.timers.set(id, { at: this.time + milliseconds, callback }); return id as unknown as ReturnType<typeof setTimeout>; },
      clearTimeout: handle => { this.timers.delete(handle as unknown as number); } };
  }
  advance(milliseconds: number) {
    const end = this.time + milliseconds;
    while (true) {
      const next = [...this.timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at; this.timers.delete(next[0]); next[1].callback();
    }
    this.time = end;
  }
}
let driverCount = 0;
class Driver {
  snapshot!: Snapshot; token = ''; sequence = 0;
  readonly driverId = ++driverCount;
  transport: StaticDemoTransport;
  constructor(readonly storage = new MemoryStorage(), readonly clock = new Clock()) {
    this.transport = createStaticDemoTransport(snapshot => { this.snapshot = snapshot; }, clock.options(storage));
  }
  async request(event: string, input: unknown) { const result = await this.transport.request(event, input); if (result.token) this.token = result.token; if (result.snapshot) this.snapshot = result.snapshot; return result; }
  async create() { const result = await this.request('create', { mode: 'demo' }); assert.equal(result.ok, true, result.error); return result; }
  command(action: Action): Command { return { id: `driver-${this.driverId}-${++this.sequence}`, code: this.snapshot.code, stage: this.snapshot.stage, version: this.snapshot.version, action }; }
  async act(action: Action) { const result = await this.request('command', this.command(action)); assert.equal(result.ok, true, result.error); return result; }
  async as(self: 'A' | 'B') { const result = await this.request('demoSwitch', { self }); assert.equal(result.ok, true, result.error); }
  close() { this.transport.dispose(); }
}
async function reachArrangement(d: Driver) {
  await d.create(); await d.act({ type: 'ready' }); await d.as('B'); await d.act({ type: 'ready' });
  assert.equal(d.snapshot.stage, 'gears');
  const failed = await d.request('command', d.command({ type: 'placeGear', gearId: 'gear-4', slotId: 'slot-1' }));
  assert.equal(failed.ok, false); assert.deepEqual(d.snapshot.installed, {});
  await d.act({ type: 'mark', target: 'gear-1', text: '这块吗？', preview: 'gear-1' });
  const preview = d.snapshot.marks.at(-1)!; await d.as('A');
  assert.equal(d.snapshot.blueprint?.gears?.length, 3);
  await d.act({ type: 'confirmPlacement', gearId: 'gear-1', slotId: 'slot-1', previewAt: preview.at });
  assert.equal(d.snapshot.placementReply?.slotId, 'slot-1');
  await d.as('B'); assert.equal(d.snapshot.blueprint, undefined);
  for (let i = 1; i <= 3; i++) await d.act({ type: 'placeGear', gearId: `gear-${i}`, slotId: `slot-${i}` });
  assert.equal(d.snapshot.stage, 'swap');
  await d.act({ type: 'swapReady' }); await d.as('A'); await d.act({ type: 'swapReady' });
  assert.equal(d.snapshot.stage, 'melody'); assert.equal(d.snapshot.role, 'maker');
  await d.as('B'); await d.act({ type: 'selectMelody', melody: 'bright' });
  assert.deepEqual((d.snapshot as Snapshot).blueprint?.notes, ['leaf', 'star', 'moon', 'star']);
  await d.as('A');
  for (const [index, symbol] of (['leaf', 'star', 'moon', 'star'] as const).entries()) await d.act({ type: 'placeNote', index, symbol });
  const unchosen = await d.request('command', d.command({ type: 'checkMelody' })); assert.equal(unchosen.ok, false);
  await d.act({ type: 'setTimbre', timbre: 'wood' }); await d.act({ type: 'checkMelody' });
  assert.equal(d.snapshot.stage, 'arrange');
}

test('local demonstration completes actual manual A/B actions, music, launch and optional paper exchange', async () => {
  const d = new Driver();
  try {
    await reachArrangement(d);
    const aTrack = structuredClone(d.snapshot.arrangement!.current.tracks.A);
    await d.act({ type: 'approveTrack' }); assert.equal(d.snapshot.arrangement!.approved.A, true);
    await d.as('B'); await d.act({ type: 'setTempo', tempo: 'gentle' });
    assert.deepEqual(d.snapshot.arrangement!.approved, { A: false, B: false });
    await d.act({ type: 'setTrackPreset', preset: 'pulse' });
    assert.deepEqual(d.snapshot.arrangement!.current.tracks.A, aTrack);
    const beforeRestore = structuredClone(d.snapshot.arrangement!.current);
    await d.act({ type: 'auditionArrangement', version: 'previous' });
    assert.equal(d.snapshot.arrangement!.audition!.version, 'previous');
    await d.act({ type: 'restoreOwnTrack' });
    assert.deepEqual(d.snapshot.arrangement!.current.tracks.A, beforeRestore.tracks.A);
    assert.notDeepEqual(d.snapshot.arrangement!.current.tracks.B, beforeRestore.tracks.B);
    await d.act({ type: 'approveTrack' }); await d.as('A'); await d.act({ type: 'approveTrack' });
    assert.equal(d.snapshot.stage, 'launch');
    assert.ok(d.snapshot.members.every(member => member.launchReady === false), 'arrangement approval cannot operate the switch');
    const wrongRole = await d.request('command', d.command({ type: 'launchReady' })); assert.equal(wrongRole.ok, false);
    await d.act({ type: 'wind' }); const originalWindingAt = d.snapshot.windingAt;
    await d.act({ type: 'wind' }); assert.equal(d.snapshot.windingAt, originalWindingAt, 'repeated intent cannot restart winding');
    d.clock.advance(1400);
    assert.equal(d.snapshot.stage, 'launch'); assert.equal(d.snapshot.winding, 4);
    assert.equal(d.snapshot.members.find(member => member.id === 'B')!.launchReady, false);
    await d.as('B'); await d.act({ type: 'launchReady' });
    assert.equal(d.snapshot.stage, 'performance');
    assert.equal((await d.request('demoSwitch', { self: 'A' })).ok, false);
    d.clock.advance(500 + d.snapshot.performanceDurationMs!);
    assert.equal(d.snapshot.stage, 'complete'); assert.equal(d.snapshot.work!.demo, true);
    assert.equal(d.snapshot.work!.shareId, undefined);
    await d.act({ type: 'setWord', word: '晚风' }); await d.act({ type: 'setStamp', stamp: 'wave' });
    await d.act({ type: 'sendNote', text: '这一拍很喜欢。' });
    assert.equal(d.snapshot.paperNotes!.length, 1);
    assert.equal(d.snapshot.paperNotes![0].to, 'A');
    const id = d.snapshot.paperNotes![0].id;
    assert.equal((await d.request('command', d.command({ type: 'readNote', noteId: id }))).ok, false);
    await d.as('A'); await d.act({ type: 'readNote', noteId: id });
    const readAt = d.snapshot.paperNotes![0].readAt;
    d.clock.advance(100); await d.act({ type: 'readNote', noteId: id });
    assert.equal(d.snapshot.paperNotes![0].readAt, readAt);
    await d.act({ type: 'setWord', word: '微光' });
    assert.equal(d.snapshot.work!.title, '微光 · 晚风');
    assert.equal(d.snapshot.work!.stamps!.B, 'wave');
    assert.equal('paperNotes' in d.snapshot.work!, false, 'local archive contains a work, not private messages');
    const work = structuredClone(d.snapshot.work), code = d.snapshot.code, token = d.token;
    d.close();
    const reopened = new Driver(d.storage, d.clock);
    const restored = await reopened.request('resume', { code, token });
    assert.equal(restored.ok, true); assert.deepEqual(reopened.snapshot.work, work);
    assert.equal(reopened.snapshot.self, 'A'); assert.equal(reopened.snapshot.paperNotes![0].readAt, readAt);
    reopened.close();
  } finally { d.close(); }
});

test('refresh retains room shuffle, selected identity, approval state and an active performance deadline', async () => {
  const d = new Driver();
  try {
    await reachArrangement(d); const order = d.snapshot.gears.map(gear => gear.id);
    await d.act({ type: 'approveTrack' }); await d.as('B');
    const code = d.snapshot.code, token = d.token; d.close();
    const refreshed = new Driver(d.storage, d.clock);
    assert.equal((await refreshed.request('resume', { code, token: 'bad' })).ok, false);
    assert.equal((await refreshed.request('resume', { code, token })).ok, true);
    assert.equal(refreshed.snapshot.self, 'B');
    assert.deepEqual(refreshed.snapshot.gears.map(gear => gear.id), order);
    assert.deepEqual(refreshed.snapshot.arrangement!.approved, { A: true, B: false });
    await refreshed.act({ type: 'approveTrack' });
    await refreshed.act({ type: 'launchReady' }); await refreshed.as('A'); await refreshed.act({ type: 'wind' });
    d.clock.advance(1400); assert.equal(refreshed.snapshot.stage, 'performance');
    const due = refreshed.snapshot.performanceAt! + refreshed.snapshot.performanceDurationMs!;
    refreshed.close(); d.clock.advance(due - d.clock.time + 50);
    const again = new Driver(d.storage, d.clock); assert.equal((await again.request('resume', { code, token })).ok, true);
    assert.equal(again.snapshot.stage, 'complete'); assert.ok(again.snapshot.work);
    const originalId = again.snapshot.work!.id; await again.create();
    assert.equal(again.snapshot.work!.id, originalId, 'create recovers an active local session instead of erasing it');
    again.close();
  } finally { d.close(); }
});

test('public static transport rejects real joining, sharing and research; commands are idempotent', async () => {
  const d = new Driver();
  try {
    assert.equal((await d.request('create', { mode: 'real' })).ok, false);
    assert.equal((await d.request('join', { code: 'ABC234' })).ok, false);
    await d.create(); const command = d.command({ type: 'ready' });
    const first = await d.request('command', command); assert.equal(first.ok, true);
    const version = d.snapshot.version;
    const duplicate = await d.request('command', command); assert.equal(duplicate.ok, true); assert.equal(duplicate.duplicate, true);
    assert.equal(d.snapshot.version, version);
    assert.equal((await d.request('command', { ...command, action: { type: 'leave' } })).ok, false);
    for (const action of [{ type: 'shareConsent', consent: true }, { type: 'exhibitConsent', consent: true }, { type: 'testConsent', consent: true }] as Action[]) {
      const result = await d.request('command', d.command(action)); assert.equal(result.ok, false);
    }
    const oldCode = d.snapshot.code;
    assert.equal((await d.request('leave', {})).ok, true); assert.equal(d.snapshot.stage, 'ended');
    await d.create(); assert.notEqual(d.snapshot.code, oldCode); assert.equal(d.snapshot.stage, 'waiting');
    assert.equal(d.snapshot.members.some(member => member.ready), false, 'neither demo identity is automatically ready');
    assert.ok(d.storage.getItem(STATIC_DEMO_STORAGE_KEY));
  } finally { d.close(); }
});
