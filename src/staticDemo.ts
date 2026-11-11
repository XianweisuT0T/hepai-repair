import type { Action, ArrangementState, ArrangementVersion, Command, Gear, Identity, Mark, Melody, MemberView, NoteSymbol, Result, Role, Snapshot, Stage, Stamp, Work } from '../shared/types';
import { arrangementDuration, TRACK_PRESETS } from '../shared/arrangement';

/** Browser-only role demonstration. Its answers are intentionally visible in the
 * bundle; it supplies neither private remote blueprints nor a connected partner. */
export const STATIC_DEMO_STORAGE_KEY = 'hepai.static-demo.v1';
const IDENTITIES: Identity[] = ['A', 'B'];
const NOTES: NoteSymbol[] = ['leaf', 'star', 'moon'];
const STAMPS: Stamp[] = ['sprout', 'crescent', 'spark', 'wave'];
const GEARS: Gear[] = [
  { id: 'gear-1', size: 'small', notches: 1, label: '小号 · 一道刻痕' },
  { id: 'gear-2', size: 'medium', notches: 2, label: '中号 · 两道刻痕' },
  { id: 'gear-3', size: 'large', notches: 3, label: '大号 · 三道刻痕' },
  { id: 'gear-4', size: 'small', notches: 3, label: '小号 · 三道刻痕' },
  { id: 'gear-5', size: 'large', notches: 1, label: '大号 · 一道刻痕' }
];
const SLOTS = [{ id: 'slot-1', shape: 'triangle' }, { id: 'slot-2', shape: 'circle' }, { id: 'slot-3', shape: 'square' }];
const ANSWERS: Record<string, string> = { 'slot-1': 'gear-1', 'slot-2': 'gear-2', 'slot-3': 'gear-3' };
const MELODIES: Record<Melody, NoteSymbol[]> = { bright: ['leaf', 'star', 'moon', 'star'], calm: ['moon', 'leaf', 'star', 'leaf'] };
type TimerHandle = ReturnType<typeof setTimeout>;
type Saved = { schema: 1; token: string; snapshot: Snapshot; timbreConfirmed: boolean; commands: Record<string, { fingerprint: string; error?: string }> };
export interface StaticDemoOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
  setTimeout?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
}
export interface StaticDemoTransport {
  request(event: string, input: unknown): Promise<Result>;
  dispose(): void;
}
const clone = <T,>(value: T): T => structuredClone(value);
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function uniqueHex(bytes: number) {
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let i = 0; i < bytes; i++) values[i] = Math.floor(Math.random() * 256);
  return Array.from(values, n => n.toString(16).padStart(2, '0')).join('');
}
function role(snapshot: Snapshot): Role {
  return ['waiting', 'gears', 'swap'].includes(snapshot.stage)
    ? snapshot.self === 'A' ? 'guide' : 'maker' : snapshot.self === 'B' ? 'guide' : 'maker';
}
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${fingerprint(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }

export function createStaticDemoTransport(receive: (snapshot: Snapshot) => void, options: StaticDemoOptions = {}): StaticDemoTransport {
  const storage = options.storage ?? browserStorage();
  const now = options.now ?? Date.now;
  const later = options.setTimeout ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const cancel = options.clearTimeout ?? (handle => clearTimeout(handle));
  let state: Saved | undefined, timer: TimerHandle | undefined, disposed = false, bound = false;
  try {
    const saved: unknown = JSON.parse(storage?.getItem(STATIC_DEMO_STORAGE_KEY) || 'null');
    if (plain(saved) && saved.schema === 1 && typeof saved.token === 'string' && plain(saved.snapshot) && saved.snapshot.mode === 'demo' && saved.snapshot.code && Array.isArray(saved.snapshot.members)) state = saved as unknown as Saved;
  } catch { /* Invalid old local data never becomes a server or real-room session. */ }
  function get() { check(state, '请先开始单人演示。'); return state.snapshot; }
  function save() {
    check(storage, '浏览器禁止本地存储，暂时不能保存演示进度。请允许此网站使用会话存储后重试。');
    storage.setItem(STATIC_DEMO_STORAGE_KEY, JSON.stringify(state));
  }
  function view() {
    const value = clone(get()); value.role = role(value); delete value.blueprint;
    if (value.role === 'guide' && value.stage === 'gears') value.blueprint = { gears: SLOTS.map(slot => {
      const gear = GEARS.find(item => item.id === ANSWERS[slot.id])!;
      return { slot: slot.id, shape: slot.shape, size: gear.size, notches: gear.notches };
    }) };
    if (value.role === 'guide' && value.stage === 'melody' && value.melody) value.blueprint = { notes: clone(MELODIES[value.melody]) };
    return value;
  }
  function emit() { if (bound && !disposed && state) receive(view()); }
  function title() { const s = get(); const [a, b] = s.members.map(member => member.word); return a || b ? `${a || '微光'} · ${b || '回响'}` : '今夜的合拍'; }
  function makeWork() {
    const s = get(); if (s.work || !s.melody) return;
    s.work = { id: `local-${uniqueHex(16)}`, title: title(), melody: s.melody,
      notes: [...(s.arrangement?.current.tracks.A.notes ?? s.notes)] as NoteSymbol[],
      timbre: s.arrangement?.current.tracks.A.timbre ?? s.timbre, finish: s.finish,
      completedAt: new Date(now()).toISOString(), demo: true, stamps: clone(s.stamps),
      ...(s.arrangement ? { arrangement: clone(s.arrangement.current) } : {}) } satisfies Work;
  }
  function maybeLaunch() {
    const s = get();
    if (s.winding === 4 && s.members.every(member => member.launchReady)) {
      s.stage = 'performance'; s.performanceAt = now() + 500;
      s.performanceDurationMs = s.arrangement ? arrangementDuration(s.arrangement.current) : 9000;
    }
  }
  function advance() {
    if (!state) return false; const s = get(); let changed = false;
    if (s.stage === 'launch' && s.windingAt !== undefined && (s.winding ?? 0) < 4 && now() >= s.windingAt + (s.windingDurationMs ?? 1400)) {
      s.winding = 4; s.members.find(member => member.id === 'A')!.launchReady = true; maybeLaunch(); changed = true;
    }
    if (s.stage === 'performance' && s.performanceAt !== undefined && now() >= s.performanceAt + (s.performanceDurationMs ?? 9000)) {
      s.stage = 'complete'; makeWork(); changed = true;
    }
    if (changed) { s.version++; save(); } return changed;
  }
  function schedule() {
    if (timer !== undefined) cancel(timer); timer = undefined;
    if (!bound || disposed || !state) return;
    const s = get(); let due: number | undefined;
    if (s.stage === 'launch' && s.windingAt !== undefined && (s.winding ?? 0) < 4) due = s.windingAt + (s.windingDurationMs ?? 1400);
    if (s.stage === 'performance' && s.performanceAt !== undefined) due = s.performanceAt + (s.performanceDurationMs ?? 9000);
    if (due !== undefined) timer = later(() => {
      timer = undefined;
      try { if (advance()) emit(); schedule(); } catch { /* The next explicit request can report a storage error. */ }
    }, Math.max(1, due - now()));
  }
  function mark(action: { target: string; text: string; preview?: string }) {
    const s = get(); const at = Math.max(now(), (s.marks.at(-1)?.at ?? 0) + 1);
    s.marks = [...s.marks.filter(item => now() - item.at < 60_000), { by: s.self, ...action, at }].slice(-8);
    return at;
  }
  function edit(editVersion: (version: ArrangementVersion) => void) {
    const s = get(); const arrangement = s.arrangement; check(arrangement, '请先进入共同改编。');
    const next = clone(arrangement.current); editVersion(next);
    if (fingerprint(next) === fingerprint(arrangement.current)) return;
    arrangement.previous = clone(arrangement.current);
    if (fingerprint(next.tracks[s.self]) !== fingerprint(arrangement.current.tracks[s.self])) {
      arrangement.previousTracks ??= {}; arrangement.previousTracks[s.self] = clone(arrangement.current.tracks[s.self]);
    }
    arrangement.current = next; arrangement.approved = { A: false, B: false }; arrangement.revision++; delete arrangement.audition;
  }
  function clearWinding() {
    const s = get(); s.winding = 0; delete s.windingAt; delete s.windingPausedAt;
    s.members.forEach(member => { member.launchReady = false; });
  }
  function apply(value: unknown) {
    check(plain(value) && typeof value.type === 'string', '操作格式无效。');
    const s = get(); const self = s.self; const me = s.members.find(member => member.id === self)!;
    const inStage = (...stages: Stage[]) => check(stages.includes(s.stage), '已经换到新的步骤，请按当前提示操作。');
    const asRole = (expected: Role) => check(role(s) === expected, `这一步由${expected === 'guide' ? '图纸师' : '装配师'}操作，请手动切换演示角色。`);
    const symbol = (v: unknown) => check(v === null || NOTES.includes(v as NoteSymbol), '请选择提供的声音片。');
    const step = () => { check(Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 4, '请选择四拍中的一拍。'); symbol(value.symbol); };
    const action = value as unknown as Action;
    switch (action.type) {
      case 'ready': inStage('waiting'); me.ready = true; if (s.members.every(member => member.ready)) s.stage = 'gears'; break;
      case 'placeGear':
        inStage('gears'); asRole('maker');
        check(!s.installed[action.slotId], '这个位置已经装好。');
        check(!Object.values(s.installed).includes(action.gearId), '这枚齿轮已经装进机芯。');
        check(ANSWERS[action.slotId] === action.gearId, '零件与插槽不匹配，请核对尺寸与刻痕。');
        s.installed[action.slotId] = action.gearId;
        if (Object.keys(s.installed).length === 3) { s.stage = 'swap'; delete s.placementReply; } break;
      case 'mark':
        inStage('gears', 'melody');
        check(typeof action.target === 'string' && action.target.length <= 80 && typeof action.text === 'string' && action.text.length <= 80, '指认格式无效。');
        if (action.preview) { asRole('maker'); check(GEARS.some(gear => gear.id === action.preview), '请选择零件盘上的齿轮。'); delete s.placementReply; }
        if (role(s) === 'guide' && ['换一块', '可以试试'].includes(action.text)) delete s.placementReply;
        mark({ target: action.target, text: action.text, ...(action.preview ? { preview: action.preview } : {}) }); break;
      case 'confirmPlacement': {
        inStage('gears'); asRole('guide'); const preview = s.marks.findLast(item => !!item.preview);
        check(preview && preview.by !== self && preview.preview === action.gearId && preview.at === action.previewAt, '请回应当前递来的那枚零件。');
        check(SLOTS.some(slot => slot.id === action.slotId) && !s.installed[action.slotId], '请选择一个空着的槽位。');
        check(!Object.values(s.installed).includes(action.gearId), '这枚齿轮已经装好。');
        s.placementReply = { by: self, gearId: action.gearId, slotId: action.slotId, previewAt: action.previewAt, at: mark({ target: action.slotId, text: '对，就放这里' }) }; break;
      }
      case 'hint': inStage('gears', 'melody'); s.hintCount++; s.hint = s.stage === 'gears' ? '先核对大小，再数刻痕；三角槽用小号一道刻痕。' : '切换到图纸师查看旋律，再逐拍核对声音片。'; break;
      case 'swapReady': inStage('swap'); me.swapReady = true; if (s.members.every(member => member.swapReady)) { s.stage = 'melody'; s.marks = []; delete s.hint; } break;
      case 'selectMelody': inStage('melody'); asRole('guide'); check(['bright', 'calm'].includes(action.melody), '请选择提供的旋律。'); if (s.melody !== action.melody) { s.melody = action.melody; s.notes = [null, null, null, null]; } break;
      case 'placeNote': inStage('melody'); asRole('maker'); step(); check(s.melody, '先切换到图纸师选择旋律。'); s.notes[action.index] = action.symbol; break;
      case 'setTimbre': inStage('melody'); asRole('maker'); check(['bell', 'wood', 'soft'].includes(action.timbre), '请选择提供的音色。'); s.timbre = action.timbre; state!.timbreConfirmed = true; break;
      case 'setFinish': inStage('waiting', 'gears', 'melody', 'arrange', 'launch'); check(['walnut', 'cherry'].includes(action.finish), '请选择提供的木色。'); s.finish = action.finish; break;
      case 'checkMelody':
        inStage('melody'); asRole('maker'); check(s.melody && s.notes.every((item, index) => item === MELODIES[s.melody!][index]), '还有声音片没有接回，请切换图纸师逐拍核对。');
        check(state!.timbreConfirmed, '请再亲手选择一种音色。');
        s.stage = 'arrange'; s.marks = []; delete s.hint; clearWinding();
        s.arrangement = { current: { tracks: { A: { notes: [...s.notes], timbre: s.timbre }, B: clone(TRACK_PRESETS.sparse.track) }, tempo: 'slow' }, approved: { A: false, B: false }, revision: 1 } satisfies ArrangementState; break;
      case 'setTrackPreset': inStage('arrange'); check(Object.hasOwn(TRACK_PRESETS, action.preset) && TRACK_PRESETS[action.preset].owner === self, '请选择当前角色的声部片段。'); edit(version => { version.tracks[self] = clone(TRACK_PRESETS[action.preset].track); }); break;
      case 'setTrackStep': inStage('arrange'); step(); check(self !== 'A' || action.symbol !== null, '主旋律每一拍留一个音；伴奏可以留白。'); edit(version => { version.tracks[self].notes[action.index] = action.symbol; check(version.tracks[self].notes.some(item => item !== null), '请至少留下一次声音。'); }); break;
      case 'setTempo': inStage('arrange'); check(['slow', 'gentle'].includes(action.tempo), '请选择提供的速度。'); edit(version => { version.tempo = action.tempo; }); break;
      case 'restoreOwnTrack': { inStage('arrange'); const old = s.arrangement?.previousTracks?.[self]; check(old, '当前声部还没有上一版。'); edit(version => { version.tracks[self] = clone(old); }); break; }
      case 'auditionArrangement': inStage('arrange'); check(['current', 'previous'].includes(action.version) && s.arrangement && (action.version === 'current' || s.arrangement.previous), '还没有可比较的上一版。'); s.arrangement.audition = { by: self, version: action.version, at: Math.max(now(), (s.arrangement.audition?.at ?? 0) + 1) }; break;
      case 'approveTrack':
        inStage('arrange'); check(s.arrangement, '请先进入共同改编。'); s.arrangement.approved[self] = true;
        if (IDENTITIES.every(id => s.arrangement!.approved[id])) { s.stage = 'launch'; clearWinding(); s.notes = [...s.arrangement.current.tracks.A.notes]; s.timbre = s.arrangement.current.tracks.A.timbre; } break;
      case 'reopenArrangement': inStage('launch'); check(s.arrangement, '没有可重新打开的改编。'); s.stage = 'arrange'; clearWinding(); s.arrangement.approved = { A: false, B: false }; delete s.arrangement.audition; break;
      case 'launchReady': inStage('launch'); check(self === 'B' || s.winding === 4, '请先完成上弦。'); me.launchReady = true; maybeLaunch(); break;
      case 'wind': inStage('launch'); asRole('maker'); check((s.winding ?? 0) < 4, '发条已经到位。'); if (s.windingAt === undefined) { s.windingAt = now(); s.windingDurationMs = 1400; me.launchReady = false; } break;
      case 'finishPerformance': inStage('performance'); check(s.performanceAt !== undefined && now() >= s.performanceAt + (s.performanceDurationMs ?? 9000), '让旋律完整响完，再把它带走。'); s.stage = 'complete'; makeWork(); break;
      case 'setWord': inStage('complete'); check(typeof action.word === 'string' && Array.from(action.word).length <= 8 && /^[\p{L}\p{N}\s·-]*$/u.test(action.word), '作品短词请使用8字以内的文字或数字。'); me.word = action.word.trim(); if (s.work) s.work.title = title(); break;
      case 'setStamp': inStage('complete'); check(STAMPS.includes(action.stamp), '请选择提供的刻印。'); s.stamps![self] = action.stamp; if (s.work) s.work.stamps = clone(s.stamps); break;
      case 'sendNote':
        inStage('complete'); check(typeof action.text === 'string' && action.text.trim().length && Array.from(action.text.trim()).length <= 80 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(action.text), '纸签请填写1到80字。');
        check((s.paperNotes ?? []).filter(note => note.from === self).length < 3, '当前角色已留下三张本地演示纸签。');
        s.paperNotes!.push({ id: uniqueHex(16), from: self, to: self === 'A' ? 'B' : 'A', text: action.text.trim(), sentAt: now() }); break;
      case 'readNote': { inStage('complete'); const note = s.paperNotes?.find(item => item.id === action.noteId && item.to === self); check(note, '请切换到收件角色查看这张本地纸签。'); note.readAt ??= now(); break; }
      case 'shareConsent': case 'exhibitConsent': throw new Error('这是本地单人演示，不会生成双人分享链接或公开展品。可以保存作品图片。');
      case 'testConsent': case 'feedback': throw new Error('单人演示不收集或伪造真人研究数据。');
      case 'leave': s.stage = 'ended'; s.members.forEach(member => { member.left = true; member.connected = false; }); break;
      default: throw new Error('单人演示不支持这个操作。');
    }
  }
  function create() {
    const active = state && state.snapshot.stage !== 'ended' && state.snapshot.expiresAt > now();
    if (!active) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = 'D' + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      const order = clone(GEARS);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.slice(0, 3).every((gear, i) => gear.id === `gear-${i + 1}`)) order.reverse();
      const members: MemberView[] = IDENTITIES.map(id => ({ id, connected: true, ready: false, swapReady: false, launchReady: false, shareConsent: false, exhibitConsent: false, word: '', left: false }));
      state = { schema: 1, token: uniqueHex(32), timbreConfirmed: false, commands: {}, snapshot: {
        code, mode: 'demo', self: 'A', role: 'guide', stage: 'waiting', version: 1, members,
        gears: order, installed: {}, slots: clone(SLOTS), notes: [null, null, null, null], melody: null,
        timbre: 'bell', finish: 'walnut', marks: [], hintCount: 0, expiresAt: now() + 24 * 60 * 60 * 1000,
        paused: false, testConsent: false, winding: 0, windingDurationMs: 1400,
        stamps: { A: 'sprout', B: 'spark' }, milestones: [], paperNotes: [], exhibitListed: false
      } };
    }
    bound = true; advance(); save(); emit(); schedule();
    return { ok: true, code: get().code, token: state!.token, self: get().self, snapshot: view() } satisfies Result;
  }
  return {
    async request(event, input): Promise<Result> {
      if (disposed) return { ok: false, error: '本地演示已经关闭，请刷新页面。' };
      let before = state ? clone(state) : undefined;
      try {
        if (event === 'join') throw new Error('GitHub Pages 版是单人角色演示，不能加入真实双人工位。');
        if (event === 'create') { check(plain(input) && input.mode === 'demo', '此公开入口仅提供单人演示，请选择“先一个人试试”。'); return create(); }
        if (event === 'resume') {
          check(plain(input) && state && input.code === get().code && input.token === state.token && get().stage !== 'ended' && get().expiresAt > now(), '本机没有这份有效的演示进度，请重新开始。');
          bound = true; advance(); emit(); schedule(); return { ok: true, code: get().code, self: get().self, snapshot: view() };
        }
        check(bound && state, '请先开始或恢复本地单人演示。');
        if (advance()) emit();
        // A rejected click must not roll back a winding/performance transition
        // whose deadline has already elapsed and whose snapshot was delivered.
        before = clone(state);
        const s = get(); check(s.stage !== 'ended', '这次演示已结束，请重新开始。');
        if (event === 'demoSwitch') {
          check(plain(input) && IDENTITIES.includes(input.self as Identity), '请选择角色A或B。');
          check(s.stage !== 'performance', '先听完这一段演出，再切换角色。');
          s.self = input.self as Identity; save(); emit(); schedule(); return { ok: true, self: s.self, snapshot: view() };
        }
        if (event === 'leave') { apply({ type: 'leave' }); s.version++; save(); emit(); schedule(); return { ok: true, snapshot: view() }; }
        check(event === 'command' && plain(input) && typeof input.id === 'string' && input.id.length > 0 && input.id.length < 100, '操作格式无效。');
        const command = input as unknown as Command; const key = `${s.self}:${command.id}`;
        const print = fingerprint({ action: command.action, stage: command.stage, version: command.version });
        const prior = state!.commands[key];
        if (prior) { check(prior.fingerprint === print, '同一个操作编号不能用于不同内容。'); return { ok: !prior.error, ...(prior.error ? { error: prior.error } : {}), duplicate: true, snapshot: view() }; }
        check(command.code === s.code && command.stage === s.stage && command.version === s.version, '状态已更新，请按当前界面再试一次。');
        apply(command.action); s.version++;
        state!.commands[key] = { fingerprint: print };
        const keys = Object.keys(state!.commands); for (const old of keys.slice(0, Math.max(0, keys.length - 256))) delete state!.commands[old];
        save(); emit(); schedule(); return { ok: true, snapshot: view() };
      } catch (error) {
        state = before; schedule();
        return { ok: false, error: error instanceof Error ? error.message : '本地操作未能保存，请重试。', ...(state && bound ? { snapshot: view() } : {}) };
      }
    },
    dispose() { disposed = true; bound = false; if (timer !== undefined) cancel(timer); timer = undefined; }
  };
}
