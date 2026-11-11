import express from 'express';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { Action, ArrangementVersion, Command, CreateInput, Identity, Mark, Milestone, NoteSymbol, PublicWork, Result, Role, Snapshot, Stage, Stamp, Work } from '../shared/types.js';
import { arrangementDuration, TRACK_PRESETS } from '../shared/arrangement.js';
import { GEARS, GEAR_ANSWERS, GEAR_BLUEPRINT, MELODIES, SLOTS } from './puzzle.js';
import { JsonStore, type Member, type Room } from './store.js';

export interface RepairServerOptions {
  dataDir: string; port?: number; roomTtlMs?: number; performanceDurationMs?: number;
  windingDurationMs?: number;
  shareTtlMs?: number; allowedOrigins?: string[]; shareBaseUrl?: string | null; production?: boolean;
}
type Session = { code: string; self: Identity; credentialHash: string };
type Ack = (result: Result) => void;
const STAGES: Stage[] = ['waiting', 'gears', 'swap', 'melody', 'arrange', 'launch', 'performance', 'complete', 'ended'];
const IDENTITIES: Identity[] = ['A', 'B'];
const NOTE_SYMBOLS = ['leaf', 'star', 'moon'];
const FINISHES = ['walnut', 'cherry'];
const TIMBRES = ['bell', 'wood', 'soft'];
const STAMPS: Stamp[] = ['sprout', 'crescent', 'spark', 'wave'];
const DEFAULT_STAMPS: Record<Identity, Stamp> = { A: 'sprout', B: 'spark' };
const WORDS = /^[\p{L}\p{N}\s·-]{1,8}$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SHARE_TTL = 7 * 24 * 60 * 60 * 1000;
const PAPER_NOTE_LIMIT = 3;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function boundedString(value: unknown, max: number, min = 0): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}
function digest(token: string) { return createHash('sha256').update(token).digest('hex'); }
function equalHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function member(id: Identity, tokenHash: string): Member {
  return { id, tokenHash, ready: false, swapReady: false, launchReady: false,
    shareConsent: false, exhibitConsent: false, word: '', left: false, testConsent: false, commands: {} };
}
function role(room: Room, self: Identity): Role {
  return room.stage === 'waiting' || room.stage === 'gears' || room.stage === 'swap'
    ? self === 'A' ? 'guide' : 'maker' : self === 'B' ? 'guide' : 'maker';
}
function shuffledGearOrder() {
  let order: string[];
  do {
    order = GEARS.map(gear => gear.id);
    for (let index = order.length - 1; index > 0; index--) {
      const other = randomInt(index + 1);
      [order[index], order[other]] = [order[other], order[index]];
    }
  // A fresh shuffle must not accidentally repeat the three left-to-right answers.
  } while (order.slice(0, 3).every((id, index) => id === `gear-${index + 1}`));
  return order;
}
function normalizeRoom(room: Room, defaultWindingDuration = 1400) {
  let changed = false;
  // Link-sharing permission from an older version never authorizes discovery.
  // Only an actual, persisted boolean true is a member's exhibit consent.
  for (const person of room.members) if (typeof person.exhibitConsent !== 'boolean') {
    person.exhibitConsent = false; changed = true;
  }
  if (!Array.isArray(room.gearOrder) || room.gearOrder.length !== GEARS.length || new Set(room.gearOrder).size !== GEARS.length || room.gearOrder.some(id => !GEARS.some(gear => gear.id === id))) {
    room.gearOrder = shuffledGearOrder(); changed = true;
  }
  if (!Number.isInteger(room.winding) || room.winding! < 0 || room.winding! > 4) { room.winding = 0; changed = true; }
  if (room.windingAt !== undefined && (!Number.isFinite(room.windingAt) || room.windingAt <= 0)) {
    delete room.windingAt; delete room.windingDurationMs; delete room.windingPausedAt; changed = true;
  }
  if (room.windingAt !== undefined && (!Number.isFinite(room.windingDurationMs) || room.windingDurationMs! <= 0)) {
    room.windingDurationMs = defaultWindingDuration; changed = true;
  }
  if (room.windingPausedAt !== undefined && (room.windingAt === undefined || !Number.isFinite(room.windingPausedAt) || room.windingPausedAt < room.windingAt || room.winding! >= 4)) {
    delete room.windingPausedAt; changed = true;
  }
  // A stopped server has no connected participants. Resume an uncheckpointed winding
  // from its last persisted legacy fraction rather than count downtime as work.
  if (room.stage === 'launch' && room.windingAt !== undefined && room.winding! < 4 && room.windingPausedAt === undefined) {
    room.windingPausedAt = room.windingAt + room.winding! / 4 * room.windingDurationMs!; changed = true;
  }
  if (!room.stamps || !STAMPS.includes(room.stamps.A) || !STAMPS.includes(room.stamps.B)) {
    room.stamps = {
      A: room.work?.stamps && STAMPS.includes(room.work.stamps.A) ? room.work.stamps.A : DEFAULT_STAMPS.A,
      B: room.work?.stamps && STAMPS.includes(room.work.stamps.B) ? room.work.stamps.B : DEFAULT_STAMPS.B
    }; changed = true;
  }
  if (!Array.isArray(room.milestones)) { room.milestones = []; changed = true; }
  if (!Array.isArray(room.paperNotes)) { room.paperNotes = []; changed = true; }
  // Old launch switches cannot stand in for the newly introduced winding action.
  if (room.stage === 'launch') {
    const maker = room.members.find(person => role(room, person.id) === 'maker');
    if (maker && maker.launchReady !== (room.winding === 4)) { maker.launchReady = room.winding === 4; changed = true; }
  }
  return changed;
}
function getLanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(entry => entry && entry.family === 'IPv4' && !entry.internal).map(entry => entry!.address))];
}
function validBaseUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}

export function createRepairServer(options: RepairServerOptions) {
  const store = new JsonStore(path.resolve(options.dataDir));
  const app = express();
  const http = createServer(app);
  const sessions = new Map<string, Session>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const windingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const counters = new Map<string, { started: number; count: number }>();
  const roomTtl = options.roomTtlMs ?? 24 * 60 * 60 * 1000;
  const performanceDuration = options.performanceDurationMs ?? 9000;
  const windingDuration = options.windingDurationMs ?? 1400;
  if (!Number.isInteger(windingDuration) || windingDuration <= 0 || windingDuration > 60_000) throw new Error('上弦时长必须是 1 到 60000 毫秒的整数。');
  const durationFor = (room: Room) => options.performanceDurationMs ?? (room.arrangement ? arrangementDuration(room.arrangement.current, 2) : performanceDuration);
  const shareTtl = options.shareTtlMs ?? SHARE_TTL;
  let port = options.port ?? 3001;
  let started = false;
  let closing = false;
  // Render supplies a trusted, service-specific external URL. Other hosts must
  // explicitly set SHARE_BASE_URL; never infer a trusted origin from Host or
  // X-Forwarded-* request headers supplied by a visitor.
  const configuredBase = options.shareBaseUrl ?? process.env.SHARE_BASE_URL ?? process.env.RENDER_EXTERNAL_URL;
  const shareBaseUrl = validBaseUrl(configuredBase);
  if (configuredBase && !shareBaseUrl) throw new Error('SHARE_BASE_URL 必须是完整的 http/https 来源，不含路径、查询或凭证。');
  const explicitOrigins = options.allowedOrigins ?? process.env.ALLOWED_ORIGINS?.split(',').map(item => item.trim()).filter(Boolean);
  if (explicitOrigins?.some(origin => validBaseUrl(origin) !== origin)) throw new Error('ALLOWED_ORIGINS 必须逐项填写准确的 http/https Origin，不能使用通配符或路径。');
  const allowedOrigins = explicitOrigins?.length ? explicitOrigins : shareBaseUrl ? [shareBaseUrl] : undefined;
  function originAllowed(origin: string | undefined) {
    if (!origin) return true; // Native same-machine test clients have no Origin header.
    if (allowedOrigins?.length) return allowedOrigins.includes(origin);
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1', '[::1]', ...getLanAddresses()].includes(url.hostname) &&
        ['5173', String(port)].includes(url.port);
    } catch { return false; }
  }
  const io = new Server(http, {
    cors: { origin: (origin, callback) => callback(null, originAllowed(origin)) },
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)),
    maxHttpBufferSize: 16_384, pingInterval: 2500, pingTimeout: 5000,
    serveClient: false
  });
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'hepai-repair' }));
  app.get('/api/config', (_request, response) => response.json({
    shareBaseUrl, lanAddresses: shareBaseUrl ? [] : getLanAddresses(), port,
    access: shareBaseUrl ? '已配置外部访问入口' : '仅本机或同一局域网；未公开部署', performanceDurationMs: performanceDuration, windingDurationMs: windingDuration
  }));
  app.get('/api/exhibits', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const works = Object.values(store.data.rooms).flatMap(room => {
      const work = exhibitedWork(room);
      return work ? [publicWorkView(work)] : [];
    }).sort((a,b) => Date.parse(b.completedAt)-Date.parse(a.completedAt) || a.shareId.localeCompare(b.shareId)).slice(0,12);
    response.json({ works });
  });
  const parseWithdrawal = express.json({limit:1024});
  app.post('/api/exhibits/:shareId/withdraw', (request,response,next) => {
    response.setHeader('Cache-Control','no-store');
    parseWithdrawal(request,response,error=>{
      if(error){response.status((error as {status?:number}).status===413?413:400).json({error:'撤展信息格式无效，请重试。'});return;}
      next();
    });
  }, async(request,response)=>{
    const shareId=request.params.shareId;
    if(!SAFE_ID.test(shareId)){response.status(404).json({error:'这件展品的分享记录已失效。'});return;}
    if(!plain(request.body)||Object.keys(request.body).length!==1||typeof request.body.token!=='string'||!/^[a-f0-9]{64}$/.test(request.body.token)){
      response.status(400).json({error:'撤展凭条格式无效，请使用原来的标签页。'});return;
    }
    const record=Object.hasOwn(store.data.works,shareId)?store.data.works[shareId]:undefined;
    if(!record){response.status(404).json({error:'作品不存在，或链接分享已被收回。'});return;}
    if(record.expiresAt<=Date.now()){response.status(410).json({error:'分享已过期，作品已不在公开展柜中。'});return;}
    const room=Object.hasOwn(store.data.rooms,record.roomCode)?store.data.rooms[record.roomCode]:undefined;
    if(!room||room.mode!=='real'||record.work.demo||room.work?.id!==record.work.id||room.work?.shareId!==shareId){
      response.status(404).json({error:'这件展品的分享记录已失效。'});return;
    }
    const tokenHash=digest(request.body.token);
    const owner=room.members.find(person=>equalHash(person.tokenHash,tokenHash));
    if(!owner){response.status(403).json({error:'这份撤展凭条不属于该作品的作者，请使用原来的标签页。'});return;}
    // This only withdraws discovery. The original link snapshot stays intact.
    // Ending/leaving/room expiry must not take away an owner's withdrawal right.
    if(owner.exhibitConsent===true){owner.exhibitConsent=false;room.version++;}
    try{
      // Persist even a repeated request, so retrying after a storage failure
      // cannot acknowledge an in-memory withdrawal that was never committed.
      await store.save();broadcast(room);response.json({ok:true});
    }catch{response.status(503).json({error:'撤展暂时未能保存，请保留原标签页并重试。'});}
  });
  app.get('/api/works/:shareId', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const shareId = request.params.shareId;
    if (!SAFE_ID.test(shareId)) { response.status(404).json({ error: '作品链接无效。' }); return; }
    const record = Object.hasOwn(store.data.works, shareId) ? store.data.works[shareId] : undefined;
    if (!record) { response.status(404).json({ error: '作品不存在，或双方已收回分享。' }); return; }
    if (record.expiresAt <= Date.now()) { response.status(410).json({ error: '作品分享已过期，请向创作者询问。' }); return; }
    response.json(record.work);
  });
  if (options.production || process.argv.includes('--production')) {
    // npm start and the container both run from the project root. The compiled
    // server lives under build/server, while the Vite bundle stays under dist.
    const dist = path.resolve('dist');
    app.use(express.static(dist));
    app.get('/{*splat}', (request, response, next) => {
      if (request.path.startsWith('/api/')) { next(); return; }
      response.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use('/api', (_request, response) => response.status(404).json({ error: '没有这个接口。' }));

  function isConnected(room: Room, self: Identity) {
    const participant = room.members.find(item => item.id === self);
    if (!participant || participant.left) return false;
    return [...sessions.values()].some(session => session.code === room.code &&
      (room.mode === 'demo' || session.self === self));
  }
  function allConnected(room: Room) {
    return room.members.length === 2 && room.members.every(item => isConnected(room, item.id));
  }
  function expired(room: Room) { return room.expiresAt <= Date.now(); }
  function currentSharedWork(room: Room) {
    const work = room.work;
    const shareId = work?.shareId;
    if (!work || !shareId || room.mode !== 'real' || work.demo || room.members.length !== 2 ||
        !IDENTITIES.every(id => room.members.some(person => person.id === id && person.shareConsent))) return;
    const record = Object.hasOwn(store.data.works, shareId) ? store.data.works[shareId] : undefined;
    if (!record || record.expiresAt <= Date.now() || record.roomCode !== room.code || record.work.demo ||
        record.work.id !== work.id || record.work.shareId !== shareId) return;
    return record.work;
  }
  function exhibitedWork(room: Room) {
    if (!room.members.every(person => person.exhibitConsent === true)) return;
    // Finished works remain discoverable after participants leave; only the
    // independent permissions and the original share expiry govern the exhibit.
    return currentSharedWork(room);
  }
  function publicWorkView(work: PublicWork): PublicWork {
    return {
      id:work.id,title:work.title,melody:work.melody,notes:[...work.notes],timbre:work.timbre,
      finish:work.finish,completedAt:work.completedAt,demo:work.demo,shareId:work.shareId,
      ...(work.stamps ? {stamps:{A:work.stamps.A,B:work.stamps.B}} : {}),
      ...(work.milestones ? {milestones:work.milestones.map(item=>({type:item.type,at:item.at}))} : {}),
      ...(work.arrangement ? {arrangement:{tempo:work.arrangement.tempo,tracks:{
        A:{notes:[...work.arrangement.tracks.A.notes],timbre:work.arrangement.tracks.A.timbre},
        B:{notes:[...work.arrangement.tracks.B.notes],timbre:work.arrangement.tracks.B.timbre}
      }}} : {})
    };
  }
  function snapshot(room: Room, self: Identity): Snapshot {
    const currentRole = role(room, self);
    const value: Snapshot = {
      code: room.code, mode: room.mode, self, role: currentRole, stage: room.stage, version: room.version,
      members: room.members.map(item => ({ id: item.id, connected: isConnected(room, item.id),
        ready: item.ready, swapReady: item.swapReady, launchReady: item.launchReady,
        shareConsent: item.shareConsent, exhibitConsent: item.exhibitConsent === true, word: item.word, left: item.left })),
      gears: room.gearOrder!.map(id => GEARS.find(gear => gear.id === id)!), installed: room.installed, slots: SLOTS, notes: room.notes,
      melody: room.melody, timbre: room.timbre, finish: room.finish, marks: room.marks,
      hintCount: room.hintCount, hint: room.hint, work: room.work,
      performanceAt: room.performanceAt, expiresAt: room.expiresAt,
      paused: room.mode === 'real' && room.stage !== 'waiting' && room.stage !== 'ended' && !allConnected(room),
      testConsent: room.members.find(item => item.id === self)!.testConsent,
      placementReply: room.placementReply, winding: room.winding ?? 0,
      windingAt: room.windingAt, windingDurationMs: room.windingDurationMs ?? windingDuration, windingPausedAt: room.windingPausedAt,
      stamps: room.stamps, milestones: room.milestones,
      arrangement: room.arrangement, performanceDurationMs: durationFor(room), exhibitListed:!!exhibitedWork(room),
      paperNotes: (room.paperNotes ?? []).filter(note=>note.from===self||note.to===self)
    };
    if (currentRole === 'guide' && room.stage === 'gears') value.blueprint = { gears: GEAR_BLUEPRINT };
    if (currentRole === 'guide' && room.stage === 'melody' && room.melody) value.blueprint = { notes: MELODIES[room.melody] };
    // Separate immutable data for acks/tests. No credential, command history, events or private feedback escapes.
    return structuredClone(value);
  }
  function broadcast(room: Room) {
    for (const [socketId, session] of sessions) if (session.code === room.code) {
      io.sockets.sockets.get(socketId)?.emit('snapshot', snapshot(room, session.self));
    }
  }
  function activity(room: Room, self: Identity, type: string, detail?: string) {
    if (room.mode === 'demo') return;
    const person = room.members.find(item => item.id === self)!;
    if (!person.testConsent) return;
    room.events.push({ self, type, stage: room.stage, at: Date.now(), ...(detail ? { detail } : {}) });
    if (room.events.length > 1000) room.events.splice(0, room.events.length - 1000);
  }
  function milestone(room: Room, type: Milestone['type']) {
    room.milestones ??= [];
    if (!room.milestones.some(item => item.type === type)) room.milestones.push({ type, at: new Date().toISOString() });
  }
  function appendMark(room: Room, value: Omit<Mark, 'at'>) {
    const at = Math.max(Date.now(), (room.marks.at(-1)?.at ?? 0) + 1);
    room.marks = [...room.marks.filter(item => Date.now() - item.at < 60_000), { ...value, at }].slice(-8);
    return at;
  }
  function maybeLaunch(room: Room) {
    if (room.winding === 4 && room.members.every(item => item.launchReady)) {
      room.stage = 'performance'; room.performanceAt = Date.now() + 500;
      milestone(room, 'started');
    }
  }
  function clearWinding(room: Room) {
    const timer = windingTimers.get(room.code);
    if (timer) clearTimeout(timer);
    windingTimers.delete(room.code);
    delete room.windingAt; delete room.windingDurationMs; delete room.windingPausedAt;
  }
  function pauseWinding(room: Room, at = Date.now()) {
    if (room.stage !== 'launch' || room.windingAt === undefined || (room.winding ?? 0) >= 4) return false;
    const timer = windingTimers.get(room.code);
    if (timer) clearTimeout(timer);
    windingTimers.delete(room.code);
    if (room.windingPausedAt !== undefined) return false;
    room.windingPausedAt = Math.max(room.windingAt, Math.min(at, room.windingAt + (room.windingDurationMs ?? windingDuration)));
    return true;
  }
  function resumeWinding(room: Room) {
    if (room.stage !== 'launch' || room.windingAt === undefined || (room.winding ?? 0) >= 4 || !allConnected(room)) return;
    if (room.windingPausedAt !== undefined) {
      room.windingAt += Math.max(0, Date.now() - room.windingPausedAt);
      delete room.windingPausedAt;
    }
  }
  async function finishWinding(room: Room, expectedAt: number) {
    if (closing || expired(room) || room.stage !== 'launch' || room.windingAt !== expectedAt || room.windingPausedAt !== undefined || !allConnected(room)) return;
    if (Date.now() < room.windingAt + (room.windingDurationMs ?? windingDuration)) { scheduleWinding(room); return; }
    const before = room.stage;
    room.winding = 4;
    const maker = room.members.find(item => role(room, item.id) === 'maker');
    if (maker) maker.launchReady = true;
    maybeLaunch(room);
    room.version++;
    stageEvent(room, before);
    try {
      await store.save(); broadcast(room);
      if ((room.stage as Stage) === 'performance') schedulePerformance(room);
    } catch {
      for (const [socketId, session] of sessions) if (session.code === room.code) io.sockets.sockets.get(socketId)?.emit('storageError', {error:'上弦状态暂时未能保存，请保留页面并联系组织者。'});
    }
  }
  function scheduleWinding(room: Room) {
    const previous = windingTimers.get(room.code);
    if (previous) clearTimeout(previous);
    windingTimers.delete(room.code);
    if (closing || room.stage !== 'launch' || room.windingAt === undefined || room.windingPausedAt !== undefined || (room.winding ?? 0) >= 4 || !allConnected(room)) return;
    const expectedAt = room.windingAt;
    const delay = Math.max(0, expectedAt + (room.windingDurationMs ?? windingDuration) - Date.now());
    const timer = setTimeout(()=>{windingTimers.delete(room.code);void finishWinding(room, expectedAt);}, delay);
    windingTimers.set(room.code, timer);
  }
  function stageEvent(room: Room, previous: Stage) {
    if (previous === room.stage) return;
    for (const person of room.members) activity(room, person.id, 'stage_enter', room.stage);
  }
  function generateWork(room: Room) {
    if (room.work || !room.melody) return;
    room.work = {
      id: randomUUID(), title: title(room), melody: room.melody,
      notes: room.arrangement ? [...room.arrangement.current.tracks.A.notes] as NoteSymbol[] : [...MELODIES[room.melody]],
      timbre: room.arrangement?.current.tracks.A.timbre ?? room.timbre,
      finish: room.finish, completedAt: new Date().toISOString(), demo: room.mode === 'demo',
      stamps: { ...room.stamps! }, milestones: structuredClone(room.milestones ?? []),
      ...(room.arrangement ? { arrangement: structuredClone(room.arrangement.current) } : {})
    };
  }
  function title(room: Room) {
    const a = room.members.find(item => item.id === 'A')?.word;
    const b = room.members.find(item => item.id === 'B')?.word;
    return a || b ? [a || '微光', b || '回响'].join(' · ') : '今夜的合拍';
  }
  async function finishPerformance(room: Room) {
    if (closing || expired(room) || room.stage !== 'performance' || !allConnected(room)) return;
    const before = room.stage;
    room.stage = 'complete';
    generateWork(room);
    room.version++;
    stageEvent(room, before);
    for (const person of room.members) activity(room, person.id, 'complete');
    try { await store.save(); broadcast(room); }
    catch { for (const [socketId, session] of sessions) if (session.code === room.code) io.sockets.sockets.get(socketId)?.emit('storageError', { error: '保存暂时失败，请保留页面并联系组织者。' }); }
  }
  function schedulePerformance(room: Room) {
    const previous = timers.get(room.code);
    if (previous) clearTimeout(previous);
    if (room.stage !== 'performance' || !room.performanceAt) return;
    const delay = Math.max(0, room.performanceAt + durationFor(room) - Date.now());
    const timer = setTimeout(() => { timers.delete(room.code); void finishPerformance(room); }, delay);
    timers.set(room.code, timer);
  }
  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do { code = [...randomBytes(6)].map(byte => alphabet[byte % alphabet.length]).join(''); }
    while (Object.hasOwn(store.data.rooms, code));
    return code;
  }
  function roomByCode(code: unknown): Room {
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code)) throw new Error('房间码应为 6 位字母或数字。');
    const room = Object.hasOwn(store.data.rooms, code) ? store.data.rooms[code] : undefined;
    if (!room) throw new Error('没有找到这个工位，请检查房间码。');
    if (expired(room)) throw new Error('这个工位已过期，请重新开一间。');
    return room;
  }
  function getBound(socket: Socket) {
    const session = sessions.get(socket.id);
    if (!session) throw new Error('请先加入工位，或恢复自己的身份。');
    const room = roomByCode(session.code);
    const person = room.members.find(item => item.id === session.self)!;
    if (person.left || room.stage === 'ended') throw new Error('这次修理已结束，请回到门口开新工位。');
    return { session, room, person };
  }
  function bind(socket: Socket, room: Room, self: Identity, credentialHash: string) {
    const prior = sessions.get(socket.id);
    if (prior && prior.code !== room.code) throw new Error('你已经在另一间工位，请先退出。');
    for (const [oldSocketId, oldSession] of sessions) {
      if (oldSocketId !== socket.id && oldSession.code === room.code && equalHash(oldSession.credentialHash, credentialHash)) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        oldSocket?.emit('sessionError', { code: 'duplicate-session', error: '你的身份已在另一个页面打开；这里已暂停。请在新页面继续。' });
        sessions.delete(oldSocketId);
        oldSocket?.disconnect(true);
      }
    }
    sessions.set(socket.id, { code: room.code, self, credentialHash });
  }
  function sendError(ack: Ack | undefined, error: unknown, room?: Room, self?: Identity) {
    if (typeof ack !== 'function') return;
    const errorMessage = error instanceof Error ? error.message : '操作没有完成，请再试一次。';
    ack({ ok: false, error: errorMessage, ...(room && self ? { snapshot: snapshot(room, self) } : {}) });
  }
  function rateLimit(socket: Socket) {
    const now = Date.now();
    let counter = counters.get(socket.id);
    if (!counter || now - counter.started >= 10_000) { counter = { started: now, count: 0 }; counters.set(socket.id, counter); }
    if (++counter.count > 120) throw new Error('操作有些密集，请稍等片刻再试。');
  }

  function validateAction(value: unknown): Action {
    if (!plain(value) || !boundedString(value.type, 30, 1)) throw new Error('操作格式无效。');
    switch (value.type) {
      case 'ready': case 'hint': case 'swapReady': case 'checkMelody': case 'launchReady': case 'wind': case 'finishPerformance': case 'leave': case 'restoreOwnTrack': case 'approveTrack': case 'reopenArrangement': break;
      case 'setTrackPreset':
        if (typeof value.preset !== 'string' || !Object.hasOwn(TRACK_PRESETS, value.preset)) throw new Error('请选择提供的声音片段。');
        break;
      case 'setTrackStep':
        if (!Number.isInteger(value.index) || (value.index as number) < 0 || (value.index as number) > 3 || value.symbol !== null && !NOTE_SYMBOLS.includes(value.symbol as string)) throw new Error('请选择有效拍位和声音符号。');
        break;
      case 'setTempo': if (!['slow','gentle'].includes(value.tempo as string)) throw new Error('请选择舒缓或轻快的速度。'); break;
      case 'auditionArrangement': if (!['current','previous'].includes(value.version as string)) throw new Error('请选择当前或上一版试听。'); break;
      case 'placeGear':
        if (!boundedString(value.gearId, 20, 1) || !GEARS.some(item => item.id === value.gearId) || !SLOTS.some(item => item.id === value.slotId)) throw new Error('请选择零件盘和工作台上实际存在的零件与插槽。');
        break;
      case 'confirmPlacement':
        if (!GEARS.some(item => item.id === value.gearId) || !SLOTS.some(item => item.id === value.slotId) || !Number.isSafeInteger(value.previewAt) || (value.previewAt as number) < 1) throw new Error('请对照伙伴递来的零件，选择实际存在的槽位。');
        break;
      case 'mark': {
        const targets = [...GEARS.map(item => item.id), ...SLOTS.map(item => item.id), 'note-0', 'note-1', 'note-2', 'note-3', 'leaf', 'star', 'moon', 'blueprint', 'melody'];
        if (!targets.includes(value.target as string) || !boundedString(value.text, 18, 1) || value.preview !== undefined && (!boundedString(value.preview, 20, 1) || ![...GEARS.map(item => item.id), ...NOTE_SYMBOLS].includes(value.preview))) throw new Error('标记位置或文字无效。');
        break;
      }
      case 'selectMelody': if (!['bright', 'calm'].includes(value.melody as string)) throw new Error('请选择轻快或舒缓旋律。'); break;
      case 'placeNote': if (!Number.isInteger(value.index) || (value.index as number) < 0 || (value.index as number) > 3 || value.symbol !== null && !NOTE_SYMBOLS.includes(value.symbol as string)) throw new Error('请选择 4 个槽位之一与有效声音片。'); break;
      case 'setTimbre': if (!TIMBRES.includes(value.timbre as string)) throw new Error('没有这种音色。'); break;
      case 'setFinish': if (!FINISHES.includes(value.finish as string)) throw new Error('没有这种外观。'); break;
      case 'setWord': if (!boundedString(value.word, 8) || value.word !== '' && !WORDS.test(value.word)) throw new Error('名字请用 8 字以内的文字或数字，也可以留空。'); break;
      case 'setStamp': if (!STAMPS.includes(value.stamp as Stamp)) throw new Error('请选择提供的刻印图案。'); break;
      case 'sendNote':
        if (!boundedString(value.text, 160, 1) || !value.text.trim() || Array.from(value.text.trim()).length > 80) throw new Error('纸签请留 1—80 字，也可以先不发送。');
        break;
      case 'readNote':
        if (!boundedString(value.noteId, 80, 1) || !SAFE_ID.test(value.noteId)) throw new Error('这张纸签的编号无效。');
        break;
      case 'shareConsent': case 'exhibitConsent': case 'testConsent': if (typeof value.consent !== 'boolean') throw new Error('请明确选择同意或不同意。'); break;
      case 'feedback': if (!boundedString(value.comfortable, 20) || !boundedString(value.again, 20) || !boundedString(value.comment, 240) || value.consent !== undefined && typeof value.consent !== 'boolean') throw new Error('反馈格式无效，留言最多 240 字；请明确选择是否自愿保存。'); break;
      default: throw new Error('暂不支持这个操作。');
    }
    return value as unknown as Action;
  }
  function editArrangement(room: Room, actor: Identity, edit: (version: ArrangementVersion) => void) {
    const state = room.arrangement;
    if (!state) throw new Error('这只音乐盒还没有进入共同改编。');
    const next = structuredClone(state.current);
    edit(next);
    if (stable(next) === stable(state.current)) return;
    state.previous = structuredClone(state.current);
    if (stable(next.tracks[actor]) !== stable(state.current.tracks[actor])) {
      state.previousTracks ??= {};
      state.previousTracks[actor] = structuredClone(state.current.tracks[actor]);
    }
    state.current = next;
    state.approved = { A: false, B: false };
    state.revision++;
    delete state.audition;
  }
  function apply(room: Room, person: Member, action: Action) {
    const currentRole = role(room, person.id);
    const inStage = (...stages: Stage[]) => { if (!stages.includes(room.stage)) throw new Error('已经换到新的步骤，请按当前提示操作。'); };
    const asRole = (expected: Role) => { if (currentRole !== expected) throw new Error(expected === 'guide' ? '这一步由图纸师确认，请和伙伴商量。' : '这一步由装配师操作，你可以给伙伴做标记。'); };
    const requireBoth = () => { if (!allConnected(room)) throw new Error('伙伴暂时离线，等连接恢复后一起继续。'); };
    switch (action.type) {
      case 'ready':
        inStage('waiting'); person.ready = true;
        if (allConnected(room) && room.members.every(item => item.ready)) room.stage = 'gears';
        break;
      case 'placeGear':
        inStage('gears'); asRole('maker'); requireBoth();
        if (Object.hasOwn(room.installed, action.slotId)) throw new Error('这个插槽已经装好了，请看看其他位置。');
        if (Object.values(room.installed).includes(action.gearId)) throw new Error('这枚齿轮已经安装在机芯里了。');
        if (GEAR_ANSWERS[action.slotId] !== action.gearId) {
          activity(room, person.id, 'failed_placement', action.slotId);
          throw new Error('当前零件与这个插槽不匹配，再与伙伴核对尺寸和刻痕。');
        }
        room.installed[action.slotId] = action.gearId;
        milestone(room, 'first_install');
        activity(room, person.id, 'gear_installed', action.slotId);
        if (Object.keys(room.installed).length === 3) { room.stage = 'swap'; room.placementReply = undefined; }
        break;
      case 'mark':
        inStage('gears', 'melody');
        if (action.preview && room.stage === 'gears') {
          asRole('maker'); requireBoth();
          if (!GEARS.some(gear => gear.id === action.preview)) throw new Error('请递送零件盘上的实际齿轮。');
          room.placementReply = undefined;
        }
        if (room.stage === 'gears' && currentRole === 'guide' && room.placementReply?.gearId === action.target && ['换一块', '可以试试'].includes(action.text)) {
          // A later response about this part supersedes the earlier position recommendation.
          room.placementReply = undefined;
        }
        if (room.stage === 'gears' && currentRole === 'guide' && action.text === '这里' && SLOTS.some(slot => slot.id === action.target)) milestone(room, 'first_point');
        appendMark(room, { by: person.id, target: action.target, text: action.text, ...(action.preview ? { preview: action.preview } : {}) });
        break;
      case 'confirmPlacement': {
        inStage('gears'); asRole('guide'); requireBoth();
        const preview = room.marks.findLast(mark => !!mark.preview);
        if (!preview || preview.by === person.id || preview.preview !== action.gearId || preview.at !== action.previewAt) throw new Error('伙伴递来的零件已经更新，请看看最新近景再回应。');
        if (Object.values(room.installed).includes(action.gearId)) throw new Error('这枚齿轮已经装进机芯，请看看下一枚。');
        if (Object.hasOwn(room.installed, action.slotId)) throw new Error('这个位置已经装好，请指向空着的槽位。');
        const at = appendMark(room, { by: person.id, target: action.slotId, text: '对，就放这里' });
        room.placementReply = { by: person.id, gearId: action.gearId, slotId: action.slotId, previewAt: action.previewAt, at };
        milestone(room, 'first_point');
        break;
      }
      case 'hint':
        inStage('gears', 'melody'); requireBoth(); room.hintCount++;
        room.hint = room.stage === 'gears'
          ? '从三角标记开始：先核对齿轮大小，再数中央的刻痕。小号也可能有不同刻痕。'
          : '从第一个槽位开始逐片核对。符号可以重复使用；同一片不需要拿走才能再放一次。';
        activity(room, person.id, 'hint_requested');
        break;
      case 'swapReady':
        inStage('swap'); requireBoth(); person.swapReady = true;
        if (room.members.every(item => item.swapReady)) { room.stage = 'melody'; room.hint = undefined; room.marks = []; room.placementReply = undefined; milestone(room, 'tools_swapped'); }
        break;
      case 'selectMelody':
        inStage('melody'); asRole('guide'); requireBoth();
        if (room.melody !== action.melody) { room.melody = action.melody; room.notes = [null, null, null, null]; }
        break;
      case 'placeNote':
        inStage('melody'); asRole('maker'); requireBoth();
        if (!room.melody) throw new Error('等图纸师选好旋律，再一起接回声音。');
        room.notes[action.index] = action.symbol;
        break;
      case 'setTimbre':
        inStage('melody', 'launch'); asRole('maker'); requireBoth();
        if (room.stage === 'launch' && room.arrangement) throw new Error('想再换声音，可以回到共同改编再一起确认。');
        room.timbre = action.timbre; room.timbreConfirmed = true;
        break;
      case 'setFinish':
        inStage('waiting', 'gears', 'melody', 'arrange', 'launch');
        if (room.stage !== 'waiting') requireBoth();
        room.finish = action.finish;
        break;
      case 'checkMelody':
        inStage('melody'); asRole('maker'); requireBoth();
        if (!room.melody || room.notes.some((symbol, index) => symbol !== MELODIES[room.melody!][index])) {
          activity(room, person.id, 'failed_melody_check');
          throw new Error('还有声音片没有接回原来的位置，请和图纸师逐片核对。');
        }
        if (!room.timbreConfirmed) throw new Error('排列已经合上了；请再亲手选一种音色，留下你的声音。');
        room.stage = 'arrange'; room.marks = []; room.hint = undefined; room.winding = 0; clearWinding(room);
        room.members.forEach(item => { item.launchReady = false; });
        room.arrangement = {
          current: { tracks: {
            A: { notes: [...room.notes], timbre: room.timbre },
            B: structuredClone(TRACK_PRESETS.sparse.track)
          }, tempo: 'slow' },
          approved: { A: false, B: false }, revision: 1
        };
        break;
      case 'setTrackPreset': {
        inStage('arrange'); requireBoth();
        const preset = TRACK_PRESETS[action.preset];
        if (preset.owner !== person.id) throw new Error('这份片段属于伙伴的声部，你可以先听听，再和伙伴商量。');
        editArrangement(room, person.id, version => { version.tracks[person.id] = structuredClone(preset.track); });
        break;
      }
      case 'setTrackStep':
        inStage('arrange'); requireBoth();
        if (person.id === 'A' && action.symbol === null) throw new Error('主旋律的每一拍留一个音；伴奏可以留白。');
        editArrangement(room, person.id, version => {
          const notes = [...version.tracks[person.id].notes];
          notes[action.index] = action.symbol;
          if (!notes.some(symbol => symbol !== null)) throw new Error('留下一次轻轻的声音，再和伙伴合起来听。');
          version.tracks[person.id].notes = notes;
        });
        break;
      case 'setTempo':
        inStage('arrange'); requireBoth();
        editArrangement(room, person.id, version => { version.tempo = action.tempo; });
        break;
      case 'restoreOwnTrack': {
        inStage('arrange'); requireBoth();
        const previous = room.arrangement?.previousTracks?.[person.id];
        if (!previous) throw new Error('你这一轨还没有可恢复的上一版。');
        editArrangement(room, person.id, version => { version.tracks[person.id] = structuredClone(previous); });
        break;
      }
      case 'auditionArrangement': {
        inStage('arrange'); requireBoth();
        if (!room.arrangement || action.version === 'previous' && !room.arrangement.previous) throw new Error('还没有上一版，先听听当前的组合。');
        const at = Math.max(Date.now(), (room.lastArrangementAuditionAt ?? room.arrangement.audition?.at ?? 0) + 1);
        room.lastArrangementAuditionAt = at;
        room.arrangement.audition = { by: person.id, version: action.version, at };
        break;
      }
      case 'approveTrack':
        inStage('arrange'); requireBoth();
        if (!room.arrangement) throw new Error('请先把两段声音调成你们喜欢的样子。');
        room.arrangement.approved[person.id] = true;
        if (IDENTITIES.every(identity => room.arrangement!.approved[identity])) {
          room.stage = 'launch'; room.winding = 0; clearWinding(room);
          room.notes = [...room.arrangement.current.tracks.A.notes];
          room.timbre = room.arrangement.current.tracks.A.timbre;
          // Agreeing on the arrangement does not operate the launch mechanism.
          // B explicitly readies the switch; A becomes ready when winding finishes.
          room.members.forEach(item => { item.launchReady = false; });
        }
        break;
      case 'reopenArrangement':
        inStage('launch'); requireBoth();
        if (!room.arrangement) throw new Error('这件旧版本作品没有可重新打开的改编草稿。');
        room.stage = 'arrange'; room.winding = 0; clearWinding(room);
        room.members.forEach(item => { item.launchReady = false; });
        room.arrangement.approved = { A: false, B: false };
        delete room.arrangement.audition;
        break;
      case 'launchReady':
        inStage('launch'); requireBoth();
        if (currentRole === 'maker' && room.winding !== 4) throw new Error('先转动右侧摇柄或点按上弦；发条到位后会保留你的准备状态。');
        person.launchReady = true;
        maybeLaunch(room);
        break;
      case 'wind':
        inStage('launch'); asRole('maker'); requireBoth();
        if ((room.winding ?? 0) >= 4) throw new Error('发条已经到位，等伙伴拨好启动片就可以。');
        // One intent starts the whole winding. Further input cannot restart or speed it up.
        if (room.windingAt !== undefined) break;
        room.windingDurationMs = windingDuration;
        room.windingAt = Date.now() - (room.winding ?? 0) / 4 * windingDuration;
        delete room.windingPausedAt;
        person.launchReady = false;
        break;
      case 'finishPerformance':
        inStage('performance'); requireBoth();
        if (!room.performanceAt || Date.now() < room.performanceAt + durationFor(room)) throw new Error('让这段旋律好好响完，再把它带走。');
        room.stage = 'complete'; generateWork(room);
        for (const participant of room.members) activity(room, participant.id, 'complete');
        break;
      case 'setWord':
        inStage('complete');
        if (room.work?.shareId) throw new Error('已分享的作品名字已经留在卡片里；先收回分享才能修改。');
        person.word = action.word.trim();
        if (room.work) room.work.title = title(room);
        break;
      case 'setStamp':
        inStage('complete');
        if (room.work?.shareId) throw new Error('已分享的落款已留在铜牌上；先收回分享才能修改。');
        room.stamps ??= { ...DEFAULT_STAMPS };
        room.stamps[person.id] = action.stamp;
        if (room.work) room.work.stamps = { ...room.stamps };
        break;
      case 'sendNote': {
        inStage('complete'); requireBoth();
        const partner = room.members.find(item=>item.id!==person.id&&!item.left);
        if (!partner) throw new Error('伙伴已经离开，纸签暂时无法送达。');
        room.paperNotes ??= [];
        if (room.paperNotes.filter(note=>note.from===person.id).length >= PAPER_NOTE_LIMIT) throw new Error('你已留下三张纸签，可以继续和身边的伙伴聊聊。');
        room.paperNotes.push({id:randomUUID(),from:person.id,to:partner.id,text:action.text.trim(),sentAt:Date.now()});
        break;
      }
      case 'readNote': {
        inStage('complete');
        const note = room.paperNotes?.find(item=>item.id===action.noteId&&item.to===person.id);
        if (!note) throw new Error('当前工位没有收到这张纸签。');
        note.readAt ??= Date.now();
        break;
      }
      case 'shareConsent': {
        inStage('complete');
        if (room.mode === 'demo') throw new Error('单人演示作品不会生成双人公开分享；可以保存本地图片卡。');
        if (action.consent) requireBoth();
        person.shareConsent = action.consent;
        if (!action.consent) room.members.forEach(item => { item.exhibitConsent = false; });
        if (!action.consent && room.work?.shareId) {
          delete store.data.works[room.work.shareId]; delete room.work.shareId;
        }
        if (room.members.every(item => item.shareConsent) && room.work && !room.work.shareId) {
          const shareId = randomBytes(18).toString('base64url');
          room.work.shareId = shareId;
          store.data.works[shareId] = {
            work: structuredClone({ ...room.work, shareId }), expiresAt: Date.now() + shareTtl, roomCode: room.code
          };
        }
        break;
      }
      case 'exhibitConsent':
        inStage('complete');
        if (room.mode !== 'real') throw new Error('单人演示作品不会进入公开展柜，可以保存自己的图片。');
        if (action.consent) {
          requireBoth();
          if (!currentSharedWork(room)) throw new Error('请先由双方同意生成有效的只读分享链接，再决定是否放进公开展柜。');
        }
        person.exhibitConsent = action.consent;
        break;
      case 'testConsent':
        if (room.mode === 'demo') throw new Error('单人演示不收集真实用户测试数据。');
        person.testConsent = action.consent;
        if (!action.consent) {
          room.events = room.events.filter(event => event.self !== person.id);
          delete person.feedback;
        } else activity(room, person.id, 'test_opt_in');
        break;
      case 'feedback':
        inStage('complete');
        if (room.mode === 'demo') throw new Error('单人演示不记录真人反馈。');
        if (!person.testConsent && action.consent !== true) throw new Error('反馈是自愿的；请明确同意保存本次反馈，或直接跳过。');
        person.feedback = { comfortable: action.comfortable, again: action.again, comment: action.comment, at: new Date().toISOString() };
        break;
      case 'leave':
        activity(room, person.id, 'exit', room.work ? 'after_completion' : 'before_completion');
        clearWinding(room);
        person.left = true; room.stage = 'ended';
        break;
    }
  }

  io.on('connection', socket => {
    socket.on('create', async (input: unknown, ack?: Ack) => {
      try {
        rateLimit(socket);
        if (sessions.has(socket.id)) throw new Error('你已经在工位里，请先退出再开新工位。');
        if (!plain(input) || !['real', 'demo'].includes(input.mode as string) || input.relayId !== undefined && (!boundedString(input.relayId, 80, 1) || !SAFE_ID.test(input.relayId))) throw new Error('创建工位的参数无效。');
        let inherited: Work | undefined;
        if (input.relayId) {
          if (input.mode !== 'real') throw new Error('接力会创建一间新的双人工位。');
          const shared = Object.hasOwn(store.data.works, input.relayId as string) ? store.data.works[input.relayId as string] : undefined;
          if (!shared || shared.expiresAt <= Date.now()) throw new Error('这份接力作品已经失效，请重新选择。');
          inherited = shared.work;
        }
        const token = randomBytes(32).toString('hex');
        const tokenHash = digest(token);
        const now = Date.now();
        const mode = (input as unknown as CreateInput).mode;
        const room: Room = {
          code: newCode(), mode, stage: 'waiting', version: 1,
          members: [member('A', tokenHash), ...(mode === 'demo' ? [member('B', digest(randomBytes(32).toString('hex')))] : [])],
          installed: {}, notes: [null, null, null, null], melody: null,
          timbre: inherited?.timbre ?? 'bell', timbreConfirmed: false, finish: inherited?.finish ?? 'walnut',
          marks: [], hintCount: 0, createdAt: now, expiresAt: now + roomTtl,
          ...(mode === 'demo' ? { demoOwnerHash: tokenHash } : {}), events: [],
          gearOrder: shuffledGearOrder(), winding: 0, stamps: { ...DEFAULT_STAMPS }, milestones: [], paperNotes: []
        };
        store.data.rooms[room.code] = room;
        await store.save();
        bind(socket, room, 'A', tokenHash);
        broadcast(room);
        if (typeof ack === 'function') ack({ ok: true, code: room.code, token, self: 'A', snapshot: snapshot(room, 'A') });
      } catch (error) { sendError(ack, error); }
    });
    socket.on('join', async (input: unknown, ack?: Ack) => {
      try {
        rateLimit(socket);
        if (sessions.has(socket.id)) throw new Error('你已经在工位里，请先退出。');
        if (!plain(input)) throw new Error('加入工位的参数无效。');
        const room = roomByCode(input.code);
        if (room.mode !== 'real') throw new Error('这是单人演示，不能作为双人工位加入。');
        if (room.stage === 'ended') throw new Error('这次修理已经结束，请开一间新工位。');
        if (room.members.length >= 2) throw new Error('工位已满，只能坐两个人。原成员请用原来的页面恢复。');
        const token = randomBytes(32).toString('hex');
        const tokenHash = digest(token);
        room.members.push(member('B', tokenHash)); room.version++;
        await store.save(); bind(socket, room, 'B', tokenHash);
        broadcast(room);
        if (typeof ack === 'function') ack({ ok: true, code: room.code, token, self: 'B', snapshot: snapshot(room, 'B') });
      } catch (error) { sendError(ack, error); }
    });
    socket.on('resume', async (input: unknown, ack?: Ack) => {
      try {
        rateLimit(socket);
        if (!plain(input) || typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw new Error('恢复凭证无效，请使用原来的页面。');
        const room = roomByCode(input.code);
        if (room.stage === 'ended') throw new Error('这次修理已明确结束，请重新开工位。');
        const tokenHash = digest(input.token);
        const person = room.members.find(item => equalHash(item.tokenHash, tokenHash));
        if (!person || person.left) throw new Error('恢复凭证与工位不匹配，请使用原来的页面。');
        const prior = sessions.get(socket.id);
        const self = room.mode === 'demo' && prior?.code === room.code ? prior.self : person.id;
        bind(socket, room, self, tokenHash); room.version++;
        resumeWinding(room);
        activity(room, self, 'reconnect');
        await store.save();
        broadcast(room); schedulePerformance(room); scheduleWinding(room);
        if (typeof ack === 'function') ack({ ok: true, code: room.code, self, snapshot: snapshot(room, self) });
      } catch (error) { sendError(ack, error); }
    });
    socket.on('demoSwitch', (input: unknown, ack?: Ack) => {
      try {
        rateLimit(socket);
        const { session, room } = getBound(socket);
        if (room.mode !== 'demo' || !room.demoOwnerHash || !equalHash(session.credentialHash, room.demoOwnerHash)) throw new Error('真实双人模式不能代替伙伴操作。');
        if (!plain(input) || !IDENTITIES.includes(input.self as Identity)) throw new Error('请选择身份 A 或 B。');
        session.self = input.self as Identity;
        if (typeof ack === 'function') ack({ ok: true, self: session.self, snapshot: snapshot(room, session.self) });
        broadcast(room);
      } catch (error) { sendError(ack, error); }
    });
    socket.on('command', async (input: unknown, ack?: Ack) => {
      let context: ReturnType<typeof getBound> | undefined;
      try {
        rateLimit(socket);
        context = getBound(socket);
        const { room, session, person } = context;
        if (!plain(input) || !boundedString(input.id, 80, 1) || !SAFE_ID.test(input.id) || ['__proto__', 'constructor', 'prototype'].includes(input.id) || !STAGES.includes(input.stage as Stage) || !Number.isSafeInteger(input.version) || (input.version as number) < 1 || input.code !== session.code) throw new Error('操作参数或所属工位不正确。');
        const action = validateAction(input.action);
        const command = input as unknown as Command;
        const fingerprint = stable({ code: command.code, stage: command.stage, version: command.version, action });
        const previous = Object.hasOwn(person.commands, command.id) ? person.commands[command.id] : undefined;
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new Error('这个操作编号已经使用，请重新操作。');
          if (typeof ack === 'function') ack({ ok: previous.ok, error: previous.error, duplicate: true, snapshot: snapshot(room, session.self) });
          return;
        }
        if (command.stage !== room.stage || command.version !== room.version) throw new Error('进度已经更新，已为你同步；请按现在的工作台再试一次。');
        const previousStage = room.stage;
        let errorMessage: string | undefined;
        try { apply(room, person, action); }
        catch (error) { errorMessage = error instanceof Error ? error.message : '操作未完成。'; }
        // Remember rejected puzzle attempts too, so retries do not double-count consented events.
        person.commands[command.id] = { fingerprint, ok: !errorMessage, ...(errorMessage ? { error: errorMessage } : {}) };
        const keys = Object.keys(person.commands);
        if (keys.length > 500) for (const key of keys.slice(0, keys.length - 500)) delete person.commands[key];
        if (!errorMessage) { room.version++; stageEvent(room, previousStage); }
        await store.save();
        broadcast(room);
        if (typeof ack === 'function') ack({ ok: !errorMessage, ...(errorMessage ? { error: errorMessage } : {}), snapshot: snapshot(room, session.self) });
        if (!errorMessage && room.stage === 'performance') schedulePerformance(room);
        if (!errorMessage && room.stage === 'launch') scheduleWinding(room);
        if (!errorMessage && action.type === 'leave') {
          for (const [socketId, bound] of sessions) if (bound.code === room.code) sessions.delete(socketId);
          const timer = timers.get(room.code); if (timer) { clearTimeout(timer); timers.delete(room.code); }
        }
      } catch (error) { sendError(ack, error, context?.room, context?.session.self); }
    });
    socket.on('disconnect', () => {
      counters.delete(socket.id);
      const session = sessions.get(socket.id);
      if (!session) return;
      sessions.delete(socket.id);
      const room = store.data.rooms[session.code];
      if (!room) return;
      pauseWinding(room);
      room.version++;
      activity(room, session.self, 'disconnect');
      broadcast(room);
      void store.save().catch(() => undefined);
    });
  });

  return {
    app, http, io,
    async start(requestedPort = port) {
      if (started) return port;
      await store.load();
      let migrated = false;
      for (const room of Object.values(store.data.rooms)) if (normalizeRoom(room, windingDuration)) migrated = true;
      if (migrated) await store.save();
      await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(requestedPort, '0.0.0.0', () => { http.off('error', reject); resolve(); }); });
      const address = http.address();
      if (address && typeof address === 'object') port = address.port;
      started = true;
      return port;
    },
    async stop() {
      closing = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const timer of windingTimers.values()) clearTimeout(timer);
      windingTimers.clear();
      let paused = false;
      for (const room of Object.values(store.data.rooms)) if (pauseWinding(room)) {room.version++;paused = true;}
      if (paused) await store.save();
      await store.flush();
      await new Promise<void>(resolve => io.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      await store.flush();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const serverPort = Number(process.env.PORT || 3001);
  if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) throw new Error('PORT 必须是有效端口。');
  const server = createRepairServer({
    dataDir: process.env.DATA_DIR || path.resolve('data'),
    port: serverPort
  });
  server.start().then(port => {
    const externalBase = validBaseUrl(process.env.SHARE_BASE_URL ?? process.env.RENDER_EXTERNAL_URL);
    console.log(`合拍修理铺服务：${externalBase || `http://localhost:${port}`}`);
    if (!process.argv.includes('--production')) console.log('开发网页：http://localhost:5173（运行 npm run dev）');
  }).catch(error => { console.error('服务启动失败：', error instanceof Error ? error.message : error); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.stop().then(() => { process.exitCode = 0; }); });
}
