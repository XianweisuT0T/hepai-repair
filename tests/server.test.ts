import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createRepairServer } from '../server/index.ts';
import type { Action, Blueprint, Command, Result, Snapshot } from '../shared/types.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, message: string, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await delay(10); }
  assert.ok(check(), message);
}
class Player {
  socket: Socket;
  snapshot!: Snapshot;
  token = '';
  constructor(readonly url: string, readonly peers: Player[] = []) {
    this.socket = io(url, { transports: ['websocket'], autoConnect: false, forceNew: true, reconnection: false });
    this.socket.on('snapshot', (snapshot: Snapshot) => { this.snapshot = snapshot; });
  }
  async connect() {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', resolve); this.socket.once('connect_error', reject); this.socket.connect();
    });
    return this;
  }
  async emit(event: string, input: unknown): Promise<Result> {
    const result = await new Promise<Result>((resolve, reject) => {
      this.socket.timeout(2500).emit(event, input, (error: Error | null, value: Result) => error ? reject(error) : resolve(value));
    });
    if (result.snapshot) this.snapshot = result.snapshot;
    if (result.token) this.token = result.token;
    return result;
  }
  async settle() {
    const target = this.snapshot.version, code = this.snapshot.code;
    await eventually(() => this.peers.filter(peer => peer.socket.connected && peer.snapshot?.code === code).every(peer => peer.snapshot.version >= target), '各连接收到已确认版本');
  }
  async create(mode: 'real' | 'demo' = 'real', relayId?: string) {
    const result = await this.emit('create', { mode, ...(relayId ? { relayId } : {}) });
    assert.equal(result.ok, true, result.error); await this.settle(); return result;
  }
  async join(code: string) { const result = await this.emit('join', { code }); assert.equal(result.ok, true, result.error); await this.settle(); return result; }
  command(action: Action, overrides: Partial<Command> = {}) {
    return this.emit('command', { id: crypto.randomUUID(), code: this.snapshot.code, stage: this.snapshot.stage, version: this.snapshot.version, action, ...overrides });
  }
  async act(action: Action) { const result = await this.command(action); assert.equal(result.ok, true, result.error); await this.settle(); return result; }
  close() { this.socket.disconnect(); }
}
async function fixture(options: { roomTtlMs?: number; performanceDurationMs?: number; shareTtlMs?: number; windingDurationMs?: number } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'hepai-test-'));
  const server = createRepairServer({ dataDir, performanceDurationMs: 120, windingDurationMs: 80, ...options });
  const port = await server.start(0); const url = `http://127.0.0.1:${port}`;
  const players: Player[] = [];
  return {
    ...server, dataDir, url,
    player: async () => { const player = await new Player(url, players).connect(); players.push(player); return player; },
    cleanup: async () => { players.forEach(player => player.close()); await server.stop(); assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir())); assert.ok(path.basename(dataDir).startsWith('hepai-test-')); await rm(dataDir, { recursive: true, force: true }); }
  };
}
async function prepare(a: Player, b: Player) {
  await a.create(); await b.join(a.snapshot.code);
  await a.act({ type: 'ready' }); await b.act({ type: 'ready' });
  await eventually(() => a.snapshot.stage === 'gears' && b.snapshot.stage === 'gears', '双方进入齿轮阶段');
}
async function gears(b: Player) {
  for (let i = 1; i <= 3; i++) await b.act({ type: 'placeGear', gearId: `gear-${i}`, slotId: `slot-${i}` });
}
async function wind(maker: Player) { await maker.act({ type: 'wind' }); await eventually(()=>maker.snapshot.winding===4,'一次动作完成连续上弦'); }
async function melody(a: Player, b: Player, finalize = true) {
  await a.act({ type: 'swapReady' }); await b.act({ type: 'swapReady' });
  await b.act({ type: 'selectMelody', melody: 'bright' });
  await a.act({ type: 'setTimbre', timbre: 'wood' });
  for (const [index, symbol] of ['leaf', 'star', 'moon', 'star'].entries()) await a.act({ type: 'placeNote', index, symbol: symbol as 'leaf' | 'star' | 'moon' });
  await a.act({ type: 'checkMelody' });
  if (finalize) { await a.act({type:'approveTrack'}); await b.act({type:'approveTrack'}); }
}
async function complete(a:Player,b:Player){
  await prepare(a,b);await gears(b);await melody(a,b);
  await b.act({type:'launchReady'});await wind(a);
  await eventually(()=>a.snapshot.stage==='complete'&&b.snapshot.stage==='complete','真实修复与共同定稿完成');
}
async function exhibits(url:string){
  const response=await fetch(`${url}/api/exhibits`);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.deepEqual(Object.keys(body),['works']);
  return body.works as import('../shared/types.ts').PublicWork[];
}

test('真实双人：私有图纸、合作修复、权限/幂等、共同启动、保存与接力形成完整链路', async () => {
  const f = await fixture();
  try {
    const a = await f.player(), b = await f.player(), stranger = await f.player();
    await prepare(a, b);
    assert.equal(a.snapshot.self, 'A'); assert.equal(a.snapshot.role, 'guide');
    assert.equal(b.snapshot.self, 'B'); assert.equal(b.snapshot.role, 'maker');
    assert.equal(a.snapshot.blueprint?.gears?.length, 3);
    assert.equal(b.snapshot.blueprint, undefined, '装配师的网络快照不含图纸');
    assert.equal((await stranger.emit('join', { code: a.snapshot.code })).ok, false, '第三人不得进入');
    assert.equal((await stranger.emit('join', { code: 'XXXXXX' })).ok, false, '错误房间码提示');
    assert.equal((await a.command({ type: 'placeGear', gearId: 'gear-1', slotId: 'slot-1' })).ok, false, '图纸师无装配权限');
    assert.equal((await b.command({ type: 'placeGear', gearId: 'gear-4', slotId: 'slot-1' })).ok, false, '错误零件被拒绝');
    assert.deepEqual(b.snapshot.installed, {});
    const oldVersion = b.snapshot.version;
    const order = b.snapshot.gears.map(gear => gear.id);
    assert.equal(new Set(order).size, 5);
    assert.notDeepEqual(order.slice(0,3), ['gear-1','gear-2','gear-3'], '零件盘不能再默认按三个答案的顺序排列');
    assert.deepEqual(a.snapshot.gears, b.snapshot.gears, '房间的零件顺序两端相同');
    assert.equal((await a.command({ type:'mark', target:'gear-4', text:'这块吗？', preview:'gear-4' })).ok, false, '图纸师不能代拿零件');
    await b.act({ type:'mark', target:'gear-4', text:'这块吗？', preview:'gear-4' });
    const stalePreviewAt = b.snapshot.marks.at(-1)!.at;
    assert.equal((await b.command({ type:'confirmPlacement', gearId:'gear-4', slotId:'slot-1', previewAt:stalePreviewAt })).ok, false, '装配师不能代替图纸师回应');
    await a.act({ type:'confirmPlacement', gearId:'gear-4', slotId:'slot-1', previewAt:stalePreviewAt });
    assert.deepEqual(b.snapshot.installed, {}, '指认只表达伙伴意见，不自动安装');
    assert.equal(b.snapshot.placementReply?.gearId, 'gear-4', '允许伙伴实际指错；指认不会泄漏正确答案');
    await a.act({type:'mark',target:'gear-4',text:'换一块'});
    assert.equal(a.snapshot.placementReply,undefined,'换一块撤回自己的旧位置指认');
    assert.equal(b.snapshot.placementReply,undefined,'伙伴也不再看见已撤回的旧位置');
    assert.deepEqual(b.snapshot.installed,{},'撤回位置反馈不改动已提交安装');
    assert.equal(a.snapshot.milestones?.filter(item=>item.type==='first_point').length,1,'撤回不抹去实际发生过的第一次指认');
    await a.act({ type:'confirmPlacement', gearId:'gear-4', slotId:'slot-1', previewAt:stalePreviewAt });
    await a.act({type:'mark',target:'gear-4',text:'可以试试'});
    assert.equal(b.snapshot.placementReply,undefined,'不指定位置的一般回应也不会继续展示旧位置纸签');
    await a.act({ type:'confirmPlacement', gearId:'gear-4', slotId:'slot-1', previewAt:stalePreviewAt });
    assert.equal((await b.command({ type:'placeGear', gearId:'gear-4', slotId:'slot-1' })).ok, false, '真正试放才由系统核验不匹配');
    await b.act({ type: 'mark', target: 'slot-1', text: '这块吗？', preview: 'gear-1' });
    assert.equal(b.snapshot.placementReply, undefined, '更换递送零件后清除旧指认');
    await eventually(() => a.snapshot.marks.some(mark => mark.preview === 'gear-1'), '零件预览到达图纸师');
    assert.equal((await a.command({ type:'confirmPlacement', gearId:'gear-4', slotId:'slot-1', previewAt:stalePreviewAt })).ok, false, '过期的递送不能得到当前确认');
    await a.act({ type:'confirmPlacement', gearId:'gear-1', slotId:'slot-1', previewAt:a.snapshot.marks.at(-1)!.at });
    await eventually(() => b.snapshot.placementReply?.slotId === 'slot-1', '图纸师位置反馈到达装配师');
    assert.deepEqual(b.snapshot.gears.map(gear => gear.id), order, '标记和反馈不会重排零件');
    await a.act({ type: 'hint' });
    assert.equal(a.snapshot.hintCount, 1);
    assert.equal((await b.command({ type: 'placeGear', gearId: 'gear-1', slotId: 'slot-1' }, { version: oldVersion })).ok, false, '过时命令被拒绝');
    const command: Command = { id: crypto.randomUUID(), code: b.snapshot.code, stage: b.snapshot.stage, version: b.snapshot.version, action: { type: 'placeGear', gearId: 'gear-1', slotId: 'slot-1' } };
    const placed = await b.emit('command', command); assert.equal(placed.ok, true, placed.error);
    const repeated = await b.emit('command', command); assert.equal(repeated.ok, true, repeated.error); assert.equal(repeated.duplicate, true);
    assert.equal(Object.keys(b.snapshot.installed).length, 1);
    assert.equal((await b.emit('command', { ...command, action: { type: 'placeGear', gearId: 'gear-2', slotId: 'slot-2' } })).ok, false, '同一命令ID不得替换意图');
    await stranger.create();
    assert.equal((await b.command({ type: 'hint' }, { code: stranger.snapshot.code })).ok, false, '跨工位操作被拒绝');
    await b.act({ type: 'placeGear', gearId: 'gear-2', slotId: 'slot-2' });
    await b.act({ type: 'placeGear', gearId: 'gear-3', slotId: 'slot-3' });
    await eventually(() => a.snapshot.stage === 'swap', '双方看到交换工具');
    assert.equal(a.snapshot.placementReply, undefined, '换阶段清除旧零件指认');
    assert.deepEqual(a.snapshot.installed, b.snapshot.installed);
    await a.act({ type: 'swapReady' }); await b.act({ type: 'swapReady' });
    assert.equal(a.snapshot.role, 'maker'); assert.equal(b.snapshot.role, 'guide');
    await b.act({ type: 'selectMelody', melody: 'bright' });
    assert.deepEqual((b.snapshot.blueprint as Blueprint | undefined)?.notes, ['leaf', 'star', 'moon', 'star']);
    assert.equal(a.snapshot.blueprint, undefined);
    await a.act({ type: 'placeNote', index: 0, symbol: 'moon' });
    assert.equal((await a.command({ type: 'checkMelody' })).ok, false, '尚未拼好不推进');
    await a.act({ type: 'setTimbre', timbre: 'wood' });
    await a.act({ type: 'setFinish', finish: 'cherry' });
    for (const [index, symbol] of ['leaf', 'star', 'moon', 'star'].entries()) await a.act({ type: 'placeNote', index, symbol: symbol as 'leaf' | 'star' | 'moon' });
    await a.act({ type: 'checkMelody' }); assert.equal(a.snapshot.stage, 'arrange');
    await a.act({type:'approveTrack'}); assert.equal(a.snapshot.stage,'arrange');
    await b.act({type:'approveTrack'}); assert.equal(a.snapshot.stage,'launch');
    assert.equal((await a.command({ type: 'launchReady' })).ok, false, '装配师不能绕过上弦直接准备');
    assert.ok(a.snapshot.members.every(person=>!person.launchReady),'共同定稿只确认声音，双方启动操作仍待完成');
    await wind(a); assert.equal(a.snapshot.stage, 'launch','A上弦到位仍等待B实际拨片');
    assert.equal(a.snapshot.members.find(person=>person.id==='A')?.launchReady,true);
    assert.equal(a.snapshot.members.find(person=>person.id==='B')?.launchReady,false);
    const waitingForB=structuredClone(a.snapshot);
    assert.equal(waitingForB.performanceAt,undefined);assert.equal(waitingForB.work,undefined);
    await b.act({type:'launchReady'});assert.equal(a.snapshot.stage,'performance','B明确准备后才开始演出');
    await eventually(() => a.snapshot.performanceAt === b.snapshot.performanceAt, '服务器统一启动时间');
    await eventually(() => a.snapshot.stage === 'complete' && b.snapshot.stage === 'complete', '有限演出结束并保存');
    assert.ok(a.snapshot.work?.id); assert.equal(a.snapshot.work?.timbre, 'wood'); assert.equal(a.snapshot.work?.finish, 'cherry');
    assert.equal(a.snapshot.work?.shareId, undefined);
    assert.equal((await fetch(`${f.url}/api/works/${a.snapshot.work!.id}`)).status, 404);
    await a.act({ type: 'setWord', word: '晚风' }); await b.act({ type: 'setWord', word: '星光' });
    await a.act({ type:'setStamp', stamp:'wave' }); await b.act({ type:'setStamp', stamp:'crescent' });
    assert.deepEqual(a.snapshot.work?.stamps, {A:'wave',B:'crescent'});
    assert.deepEqual(a.snapshot.work?.milestones?.map(item=>item.type), ['first_point','first_install','tools_swapped','started']);
    assert.ok(a.snapshot.work?.milestones?.every(item=>Number.isFinite(Date.parse(item.at))));
    await a.act({ type: 'shareConsent', consent: true }); assert.equal(a.snapshot.work?.shareId, undefined, '单方同意不生成分享');
    await b.act({ type: 'shareConsent', consent: true });
    const sharedId = b.snapshot.work!.shareId; assert.ok(sharedId);
    assert.equal((await a.command({type:'setStamp',stamp:'spark'})).ok, false, '分享后的落款冻结');
    assert.equal((await a.command({type:'setStamp',stamp:'unknown' as never})).ok, false, '任意印章值被拒绝');
    const publicResponse = await fetch(`${f.url}/api/works/${sharedId}`); assert.equal(publicResponse.status, 200);
    const publicWork = await publicResponse.json();
    assert.equal(publicWork.title, '晚风 · 星光');
    assert.deepEqual(publicWork.stamps, {A:'wave',B:'crescent'});
    assert.deepEqual(publicWork.milestones.map((item:{type:string})=>item.type), ['first_point','first_install','tools_swapped','started']);
    for (const privateKey of ['token', 'code', 'members', 'feedback', 'blueprint']) assert.equal(publicWork[privateKey], undefined, `只读作品不公开${privateKey}`);
    const beforeConsent = JSON.parse(await readFile(path.join(f.dataDir, 'state.json'), 'utf8'));
    assert.deepEqual(beforeConsent.rooms[a.snapshot.code].events, [], '未同意前不采集匿名事件');
    assert.equal((await a.command({ type: 'feedback', comfortable: 'comfortable', again: 'yes', comment: 'not-consented' })).ok, false);
    await a.act({ type: 'feedback', comfortable: 'comfortable', again: 'yes', comment: 'PRIVATE-SEPARATE-CONSENT', consent: true });
    const feedbackOnly = JSON.parse(await readFile(path.join(f.dataDir, 'state.json'), 'utf8'));
    assert.deepEqual(feedbackOnly.rooms[a.snapshot.code].events, [], '仅同意反馈不采集匿名操作事件');
    assert.equal(a.snapshot.testConsent, false, '反馈同意不等于事件记录同意');
    assert.ok(!JSON.stringify(b.snapshot).includes('PRIVATE-SEPARATE-CONSENT'), '独立反馈不向伙伴公开');
    await a.act({ type: 'testConsent', consent: true });
    await a.act({ type: 'feedback', comfortable: 'comfortable', again: 'yes', comment: 'PRIVATE-COMMENT-ONLY-A' });
    assert.ok(!JSON.stringify(b.snapshot).includes('PRIVATE-COMMENT-ONLY-A'), '主观反馈不向伙伴公开');
    const relay = await f.player(); await relay.create('real', sharedId);
    assert.notEqual(relay.snapshot.code, a.snapshot.code); assert.equal(relay.snapshot.stage, 'waiting');
    assert.deepEqual(relay.snapshot.installed, {}); assert.deepEqual(relay.snapshot.notes, [null, null, null, null]);
    assert.equal(relay.snapshot.finish, 'cherry'); assert.equal(relay.snapshot.timbre, 'wood');
    assert.deepEqual(relay.snapshot.stamps, {A:'sprout',B:'spark'}, '接力从新参与者的默认印记开始');
    assert.deepEqual(relay.snapshot.milestones, [], '接力没有继承原作品的动作回顾');
    assert.equal(relay.snapshot.winding, 0);
    const reread = await (await fetch(`${f.url}/api/works/${sharedId}`)).json(); assert.deepEqual(reread, publicWork, '接力不修改原作品');
    const persisted = await readFile(path.join(f.dataDir, 'state.json'), 'utf8');
    assert.ok(persisted.includes(a.snapshot.work!.id), '作品已经真实写入文件');
    assert.ok(!persisted.includes(a.token), '恢复原始凭证不落盘');
  } finally { await f.cleanup(); }
});

test('临时断线暂停关键推进；恢复本人、刷新接管、明确退出', async () => {
  const f = await fixture();
  try {
    const a = await f.player(), b = await f.player(); await prepare(a, b);
    const code = b.snapshot.code, token = b.token;
    await b.act({ type: 'placeGear', gearId: 'gear-1', slotId: 'slot-1' }); b.close();
    await eventually(() => a.snapshot.paused && !a.snapshot.members.find(member => member.id === 'B')?.connected, '伙伴看到真实掉线');
    assert.equal((await a.command({ type: 'hint' })).ok, false, '掉线时关键操作暂停');
    const restored = await f.player(); const resume = await restored.emit('resume', { code, token }); assert.equal(resume.ok, true, resume.error);
    assert.equal(restored.snapshot.self, 'B'); assert.equal(restored.snapshot.installed['slot-1'], 'gear-1');
    await eventually(() => !a.snapshot.paused, '伙伴恢复后解除暂停');
    const duplicated = await f.player();
    let oldSessionError = '';
    restored.socket.on('sessionError', payload => { oldSessionError = payload.code; });
    assert.equal((await duplicated.emit('resume', { code, token })).ok, true);
    await eventually(() => !restored.socket.connected, '重复打开时旧端被明确断开');
    assert.equal(oldSessionError, 'duplicate-session');
    await duplicated.act({ type: 'leave' });
    const afterExit = await f.player();
    assert.equal((await afterExit.emit('resume', { code, token })).ok, false, '离开凭证不能重新占位');
    await eventually(() => a.snapshot.stage === 'ended', '明确退出使未完成体验结束');
    assert.equal(a.snapshot.work, undefined, '退出不能伪造完成作品');
  } finally { await f.cleanup(); }
});

test('关键进度持久化：服务端重启后仅凭本人凭证恢复，不继承已断开的在线状态', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'hepai-restart-'));
  let server = createRepairServer({ dataDir }); let port = await server.start(0);
  const players: Player[] = [];
  try {
    const a = await new Player(`http://127.0.0.1:${port}`, players).connect(), b = await new Player(`http://127.0.0.1:${port}`, players).connect(); players.push(a,b);
    await prepare(a,b); await b.act({ type: 'placeGear', gearId: 'gear-1', slotId: 'slot-1' });
    const credential = { code: a.snapshot.code, token: a.token };
    const order = a.snapshot.gears.map(gear => gear.id);
    players.forEach(player => player.close()); await server.stop();
    server = createRepairServer({ dataDir }); port = await server.start(0);
    const restored = await new Player(`http://127.0.0.1:${port}`, players).connect(); players.push(restored);
    assert.equal((await restored.emit('resume', credential)).ok, true);
    assert.equal(restored.snapshot.self, 'A'); assert.equal(restored.snapshot.stage, 'gears');
    assert.deepEqual(restored.snapshot.gears.map(gear=>gear.id), order, '服务端重启不改变房间零件盘顺序');
    assert.equal(restored.snapshot.installed['slot-1'], 'gear-1'); assert.equal(restored.snapshot.paused, true);
    assert.equal(restored.snapshot.members.find(member => member.id === 'B')?.connected, false);
    const wrong = await new Player(`http://127.0.0.1:${port}`, players).connect(); players.push(wrong);
    assert.equal((await wrong.emit('resume', { ...credential, token: 'wrong-recovery-token' })).ok, false);
  } finally { players.forEach(player => player.close()); await server.stop(); assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir())); assert.ok(path.basename(dataDir).startsWith('hepai-restart-')); await rm(dataDir, { recursive: true, force: true }); }
});

test('演示身份切换只在演示房生效，不能加入/分享成真实双人，也不采集真实研究事件', async () => {
  const f = await fixture();
  try {
    const demo = await f.player(), outsider = await f.player(); await demo.create('demo');
    assert.equal(demo.snapshot.mode, 'demo'); assert.equal(demo.snapshot.self, 'A');
    assert.equal((await outsider.emit('join', { code: demo.snapshot.code })).ok, false);
    await demo.act({ type: 'ready' });
    assert.equal((await demo.emit('demoSwitch', { self: 'B' })).ok, true);
    await demo.act({ type: 'ready' }); assert.equal(demo.snapshot.role, 'maker');
    await gears(demo); await demo.act({ type: 'swapReady' });
    await demo.emit('demoSwitch', { self: 'A' }); await demo.act({ type: 'swapReady' });
    await demo.emit('demoSwitch', { self: 'B' }); await demo.act({ type: 'selectMelody', melody: 'calm' });
    assert.deepEqual(demo.snapshot.blueprint?.notes, ['moon','leaf','star','leaf']);
    await demo.emit('demoSwitch', { self: 'A' }); await demo.act({ type: 'setTimbre', timbre: 'soft' });
    for (const [index, symbol] of ['moon', 'leaf', 'star', 'leaf'].entries()) await demo.act({ type: 'placeNote', index, symbol: symbol as 'leaf'|'star'|'moon' });
    await demo.act({ type: 'checkMelody' }); await demo.act({type:'approveTrack'});
    await demo.emit('demoSwitch',{self:'B'}); await demo.act({type:'approveTrack'});
    assert.equal(demo.snapshot.members.find(person=>person.id==='B')?.launchReady,false);
    await demo.act({type:'launchReady'});
    await demo.emit('demoSwitch',{self:'A'}); await wind(demo);
    await eventually(() => demo.snapshot.stage === 'complete', '演示可操作跑完整体验'); assert.equal(demo.snapshot.work?.demo, true);
    assert.equal((await demo.command({ type: 'shareConsent', consent: true })).ok, false, '演示不生成真实公共分享');
    assert.equal((await demo.command({ type:'exhibitConsent',consent:true })).ok,false,'演示不得进入真实公开展柜');
    assert.deepEqual(await exhibits(f.url),[],'演示作品不混入展柜');
    assert.equal((await demo.command({ type: 'feedback', comfortable: 'comfortable', again: 'yes', comment: '', consent: true })).ok, false, '演示即使同意也不保存真人主观反馈');
    await demo.act({type:'sendNote',text:'单人演示里，A留给B的一句话'});
    assert.equal(demo.snapshot.paperNotes?.length,1,'演示不会自动生成假伙伴回复');
    await demo.emit('demoSwitch',{self:'B'});
    assert.equal(demo.snapshot.paperNotes?.[0].to,'B');
    await demo.act({type:'readNote',noteId:demo.snapshot.paperNotes![0].id});
    await demo.act({type:'sendNote',text:'切到B后，才亲手回复'});
    assert.equal(demo.snapshot.paperNotes?.length,2);
    await outsider.create(); assert.equal((await outsider.emit('demoSwitch', { self: 'B' })).ok, false);
    const state = JSON.parse(await readFile(path.join(f.dataDir, 'state.json'), 'utf8'));
    assert.deepEqual(state.rooms[demo.snapshot.code].events, [], '演示不写入真人研究事件');
  } finally { await f.cleanup(); }
});

test('边界输入、阶段、过期和不存在的只读链接均得到拒绝', async () => {
  const f = await fixture({ roomTtlMs: 250 });
  try {
    const a = await f.player(), b = await f.player();
    assert.equal((await a.emit('create', { mode: 'other' })).ok, false);
    assert.equal((await a.emit('join', { code: 'A'.repeat(2000) })).ok, false);
    assert.equal((await a.emit('resume', { code: {}, token: [] })).ok, false);
    await a.create();
    assert.equal((await a.command({ type: 'launchReady' })).ok, false, '等待阶段不能启动');
    assert.equal((await a.emit('command', { id: 'x', code: a.snapshot.code, stage: 'waiting', version: a.snapshot.version, action: null })).ok, false);
    const code = a.snapshot.code; await delay(300);
    const expired = await b.emit('join', { code }); assert.equal(expired.ok, false); assert.match(expired.error ?? '', /过期/);
    assert.equal((await fetch(`${f.url}/api/works/does-not-exist`)).status, 404);
  } finally { await f.cleanup(); }
});

test('只读分享可撤回，过期链接返回410且不能接力', async () => {
  const f = await fixture({ shareTtlMs: 120 });
  try {
    const a = await f.player(), b = await f.player(); await prepare(a,b); await gears(b); await melody(a,b);
    await b.act({type:'launchReady'});await wind(a);
    await eventually(() => a.snapshot.stage === 'complete' && b.snapshot.stage === 'complete', '完成后才能分享');
    await a.act({ type: 'shareConsent', consent: true }); await b.act({ type: 'shareConsent', consent: true });
    const firstId = a.snapshot.work!.shareId!;
    assert.equal((await fetch(`${f.url}/api/works/${firstId}`)).status, 200);
    await a.act({ type: 'shareConsent', consent: false });
    assert.equal((await fetch(`${f.url}/api/works/${firstId}`)).status, 404, '单人收回即撤销访问');
    await a.act({ type: 'shareConsent', consent: true });
    const nextId = a.snapshot.work!.shareId!; assert.notEqual(nextId, firstId);
    await delay(150);
    assert.equal((await fetch(`${f.url}/api/works/${nextId}`)).status, 410);
    const relay = await f.player(); assert.equal((await relay.emit('create', { mode: 'real', relayId: nextId })).ok, false);
  } finally { await f.cleanup(); }
});

test('真实展柜独立授权：旧链接同意不等于公开，双同意才上架，撤回/离线/接力互不混淆',async()=>{
  const f=await fixture();
  try{
    assert.deepEqual(await exhibits(f.url),[],'没有授权作品时是真实空列表');
    const a=await f.player(),b=await f.player();await complete(a,b);
    assert.ok(a.snapshot.members.every(person=>person.exhibitConsent===false));assert.equal(a.snapshot.exhibitListed,false);
    assert.equal((await a.command({type:'exhibitConsent',consent:true})).ok,false,'先独立决定链接分享');
    assert.equal((await a.command({type:'exhibitConsent',consent:'true' as never})).ok,false,'授权必须是明确布尔值');
    await a.act({type:'shareConsent',consent:true});
    assert.equal((await a.command({type:'exhibitConsent',consent:true})).ok,false,'单方链接同意还不能上架');
    await b.act({type:'shareConsent',consent:true});const firstShare=a.snapshot.work!.shareId!;
    assert.deepEqual(await exhibits(f.url),[],'已有双分享链接依然不公开到展柜');
    await a.act({type:'exhibitConsent',consent:true});assert.equal(a.snapshot.exhibitListed,false);
    assert.deepEqual(await exhibits(f.url),[],'单方展柜同意也不公开');
    const grant:Command={id:crypto.randomUUID(),code:b.snapshot.code,stage:'complete',version:b.snapshot.version,action:{type:'exhibitConsent',consent:true}};
    assert.equal((await b.emit('command',grant)).ok,true);await b.settle();
    const repeated=await b.emit('command',grant);assert.equal(repeated.ok,true);assert.equal(repeated.duplicate,true);
    assert.equal(a.snapshot.exhibitListed,true);assert.equal(b.snapshot.exhibitListed,true);
    await a.act({type:'feedback',comfortable:'舒适',again:'愿意',comment:'PRIVATE-EXHIBIT-FEEDBACK',consent:true});
    const listed=await exhibits(f.url);assert.equal(listed.length,1);
    const publicWork=await (await fetch(`${f.url}/api/works/${firstShare}`)).json();assert.deepEqual(listed[0],publicWork);
    for(const key of ['token','tokenHash','code','roomCode','members','feedback','events','blueprint','commands','exhibitConsent'])assert.equal((listed[0]as unknown as Record<string,unknown>)[key],undefined);
    assert.ok(!JSON.stringify(listed).includes('PRIVATE-EXHIBIT-FEEDBACK'));
    const relay=await f.player();await relay.create('real',firstShare);
    assert.equal(relay.snapshot.stage,'waiting');assert.equal(relay.snapshot.exhibitListed,false);
    assert.ok(relay.snapshot.members.every(person=>!person.exhibitConsent&&!person.shareConsent));
    assert.deepEqual(relay.snapshot.notes,[null,null,null,null]);assert.deepEqual(relay.snapshot.installed,{});
    assert.deepEqual(await exhibits(f.url),listed,'接力不改原作品、原授权或快照');
    await b.act({type:'exhibitConsent',consent:false});assert.equal(a.snapshot.exhibitListed,false);
    assert.deepEqual(await exhibits(f.url),[],'单方撤回公开立即下架');
    assert.equal((await fetch(`${f.url}/api/works/${firstShare}`)).status,200,'撤展保留独立的只读链接');
    await b.act({type:'exhibitConsent',consent:true});assert.equal((await exhibits(f.url)).length,1);
    await a.act({type:'shareConsent',consent:false});
    assert.ok(a.snapshot.members.every(person=>!person.exhibitConsent),'撤链接同时清双方公开授权');
    assert.deepEqual(await exhibits(f.url),[]);assert.equal((await fetch(`${f.url}/api/works/${firstShare}`)).status,404);
    await a.act({type:'shareConsent',consent:true});const secondShare=a.snapshot.work!.shareId!;
    assert.notEqual(secondShare,firstShare);assert.deepEqual(await exhibits(f.url),[],'重新给链接不会复用旧的展柜授权');
    assert.equal((await b.emit('command',grant)).duplicate,true,'旧编号只能取回结果，不能重新执行已撤销授权');
    assert.deepEqual(await exhibits(f.url),[]);
    await a.act({type:'exhibitConsent',consent:true});await b.act({type:'exhibitConsent',consent:true});
    const credential={code:b.snapshot.code,token:b.token};b.close();await eventually(()=>a.snapshot.paused,'伙伴掉线');
    assert.equal((await exhibits(f.url)).length,1,'下线不撤销已经明确给出的公开许可');
    await a.act({type:'exhibitConsent',consent:false});assert.deepEqual(await exhibits(f.url),[],'伙伴掉线也能立即撤回');
    assert.equal((await a.command({type:'exhibitConsent',consent:true})).ok,false,'掉线时不能新增公开授权');
    const restored=await f.player();assert.equal((await restored.emit('resume',credential)).ok,true);await restored.settle();
    await a.act({type:'exhibitConsent',consent:true});assert.equal((await exhibits(f.url)).length,1);
    await a.act({type:'leave'});
    assert.equal((await exhibits(f.url))[0].shareId,secondShare,'完成后正常结束工位不隐式撤展');
    assert.deepEqual(await (await fetch(`${f.url}/api/works/${secondShare}`)).json(),{...publicWork,shareId:secondShare},'原只读快照始终不被接力或展柜动作覆盖');
  }finally{await f.cleanup();}
});

test('真实展柜过期：只读分享到期后自动排除，不能沿失效链接重新授权或接力',async()=>{
  const f=await fixture({shareTtlMs:180});
  try{
    const a=await f.player(),b=await f.player();await complete(a,b);
    await a.act({type:'shareConsent',consent:true});await b.act({type:'shareConsent',consent:true});
    const shareId=a.snapshot.work!.shareId!;
    await a.act({type:'exhibitConsent',consent:true});await b.act({type:'exhibitConsent',consent:true});
    assert.equal((await exhibits(f.url)).length,1);
    await delay(220);assert.deepEqual(await exhibits(f.url),[]);
    assert.equal((await fetch(`${f.url}/api/works/${shareId}`)).status,410);
    const expiredWithdrawal=await fetch(`${f.url}/api/exhibits/${shareId}/withdraw`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:a.token})});
    assert.equal(expiredWithdrawal.status,410,'作者凭条也不能把过期分享当有效展品管理');
    assert.equal((await a.command({type:'exhibitConsent',consent:true})).ok,false,'过期链接不得重新授权上架');
    assert.equal(a.snapshot.exhibitListed,false);
    const next=await f.player();assert.equal((await next.emit('create',{mode:'real',relayId:shareId})).ok,false);
  }finally{await f.cleanup();}
});

test('展柜授权持久化：旧分享安全迁移为未公开，明确授权可跨重启，列表只投影作品白名单',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'hepai-exhibit-'));
  let server=createRepairServer({dataDir,performanceDurationMs:1,windingDurationMs:1});let port=await server.start(0);
  const players:Player[]=[];
  try{
    let url=`http://127.0.0.1:${port}`;
    const a=await new Player(url,players).connect(),b=await new Player(url,players).connect();players.push(a,b);
    await complete(a,b);await a.act({type:'shareConsent',consent:true});await b.act({type:'shareConsent',consent:true});
    const credentials=[{code:a.snapshot.code,token:a.token},{code:b.snapshot.code,token:b.token}],shareId=a.snapshot.work!.shareId!;
    players.forEach(player=>player.close());await server.stop();
    const saved=JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8'));
    delete saved.rooms[credentials[0].code].members[0].exhibitConsent;
    saved.rooms[credentials[0].code].members[1].exhibitConsent='true';
    // Historical extra fields cannot leak through the exhibit projection even
    // if an older saved work unexpectedly carried them.
    Object.assign(saved.works[shareId].work,{token:'PRIVATE-OLD-TOKEN',roomCode:'PRIVATE-ROOM',feedback:'PRIVATE-OLD-FEEDBACK'});
    saved.works[shareId].work.arrangement.previous={private:'PRIVATE-DRAFT'};
    await writeFile(path.join(dataDir,'state.json'),JSON.stringify(saved),'utf8');
    server=createRepairServer({dataDir});port=await server.start(0);url=`http://127.0.0.1:${port}`;
    assert.deepEqual(await exhibits(url),[],'旧双链接许可与非boolean真值都不能被迁移成公开授权');
    const a2=await new Player(url,players).connect(),b2=await new Player(url,players).connect();players.push(a2,b2);
    assert.equal((await a2.emit('resume',credentials[0])).ok,true);assert.equal((await b2.emit('resume',credentials[1])).ok,true);await b2.settle();
    assert.ok(a2.snapshot.members.every(person=>person.exhibitConsent===false));assert.equal(a2.snapshot.exhibitListed,false);
    assert.equal((await fetch(`${url}/api/works/${shareId}`)).status,200,'旧只读链接保持原语义');
    await a2.act({type:'exhibitConsent',consent:true});await b2.act({type:'exhibitConsent',consent:true});
    const listed=await exhibits(url);assert.equal(listed.length,1);
    assert.ok(!JSON.stringify(listed).includes('PRIVATE-'));
    assert.deepEqual(Object.keys(listed[0]).sort(),['arrangement','completedAt','demo','finish','id','melody','milestones','notes','shareId','stamps','timbre','title'].sort());
    assert.deepEqual(Object.keys(listed[0].arrangement!).sort(),['tempo','tracks']);
    players.forEach(player=>player.close());await server.stop();
    server=createRepairServer({dataDir});port=await server.start(0);url=`http://127.0.0.1:${port}`;
    assert.deepEqual(await exhibits(url),listed,'明确给出的公开许可和冻结作品跨重启保留，不要求重新在线');
    const a3=await new Player(url,players).connect(),b3=await new Player(url,players).connect();players.push(a3,b3);
    assert.equal((await a3.emit('resume',credentials[0])).ok,true);assert.equal(a3.snapshot.exhibitListed,true);
    assert.ok(a3.snapshot.members.every(person=>person.exhibitConsent));
    assert.equal((await b3.emit('resume',credentials[1])).ok,true);await b3.settle();
    await b3.act({type:'exhibitConsent',consent:false});assert.deepEqual(await exhibits(url),[],'恢复后仍可单方撤回');
  }finally{
    players.forEach(player=>player.close());await server.stop();
    assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(tmpdir()));assert.ok(path.basename(dataDir).startsWith('hepai-exhibit-'));
    await rm(dataDir,{recursive:true,force:true});
  }
});

test('展柜最多返回最近12件：全部来自隔离工位实际通关和两类双人授权，无默认种子',async()=>{
  const f=await fixture({performanceDurationMs:1,windingDurationMs:1});
  try{
    assert.deepEqual(await exhibits(f.url),[]);const completedIds:string[]=[];
    for(let index=0;index<13;index++){
      const a=await f.player(),b=await f.player();await complete(a,b);
      await a.act({type:'shareConsent',consent:true});await b.act({type:'shareConsent',consent:true});
      await a.act({type:'exhibitConsent',consent:true});await b.act({type:'exhibitConsent',consent:true});
      completedIds.push(a.snapshot.work!.id);a.close();b.close();
    }
    const works=await exhibits(f.url);
    assert.equal(works.length,12);assert.deepEqual(works.map(work=>work.id),completedIds.slice(-12).reverse());
    assert.ok(works.every(work=>!work.demo&&work.shareId));
    assert.equal((await fetch(`${f.url}/api/exhibits?limit=999999`)).status,200);
    assert.equal((await (await fetch(`${f.url}/api/exhibits?limit=999999`)).json()).works.length,12,'客户端不能突破固定列表上限');
  }finally{await f.cleanup();}
});

test('作者凭条可在主动结束和房间过期后撤展：单方、幂等、严格payload，保留链接且不泄漏凭证',async()=>{
  const f=await fixture({roomTtlMs:3000});
  try{
    const a=await f.player(),b=await f.player();await complete(a,b);
    await a.act({type:'shareConsent',consent:true});await b.act({type:'shareConsent',consent:true});
    await a.act({type:'exhibitConsent',consent:true});await b.act({type:'exhibitConsent',consent:true});
    const shareId=a.snapshot.work!.shareId!,roomCode=a.snapshot.code,expires=a.snapshot.expiresAt;
    const original=await (await fetch(`${f.url}/api/works/${shareId}`)).json();
    const withdraw=(payload:unknown,id=shareId)=>fetch(`${f.url}/api/exhibits/${id}/withdraw`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal((await withdraw({token:'0'.repeat(64)})).status,403,'旁观者不能撤展');
    assert.equal((await withdraw({token:a.token,role:'A'})).status,400,'只接受私密token，不允许夹带角色或命令');
    assert.equal((await withdraw({token:'invalid'})).status,400);
    assert.equal((await withdraw({token:a.token},'not-a-real-share')).status,404);
    const malformed=await fetch(`${f.url}/api/exhibits/${shareId}/withdraw`,{method:'POST',headers:{'content-type':'application/json'},body:'{"token":'});
    assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:'撤展信息格式无效，请重试。'});
    assert.equal((await exhibits(f.url)).length,1,'无权或非法请求不能改变展品');
    await a.act({type:'leave'});assert.equal(b.snapshot.stage,'ended');
    await delay(Math.max(0,expires-Date.now()+20));
    assert.equal((await exhibits(f.url)).length,1,'房间过期不应隐式清除仍有效的分享和展柜许可');
    const response=await withdraw({token:a.token});assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true});
    assert.deepEqual(await exhibits(f.url),[],'已离开作者仍能单方撤展');
    assert.deepEqual(await (await fetch(`${f.url}/api/works/${shareId}`)).json(),original,'撤展不撤链接、不改冻结作品');
    const first=JSON.parse(await readFile(path.join(f.dataDir,'state.json'),'utf8')).rooms[roomCode];
    assert.equal(first.members.find((person:{id:string})=>person.id==='A').exhibitConsent,false);
    assert.equal(first.members.find((person:{id:string})=>person.id==='B').exhibitConsent,true,'不代替伙伴改授权');
    const again=await withdraw({token:a.token});assert.equal(again.status,200);assert.deepEqual(await again.json(),{ok:true});
    const second=JSON.parse(await readFile(path.join(f.dataDir,'state.json'),'utf8')).rooms[roomCode];
    assert.equal(second.version,first.version,'重复撤展不重复增加状态变化');
    assert.ok(!(await readFile(path.join(f.dataDir,'state.json'),'utf8')).includes(a.token),'原始token不落服务端文件');
    for(const value of [original,await exhibits(f.url),await (await withdraw({token:'0'.repeat(64)})).json()]){
      const text=JSON.stringify(value);assert.ok(!text.includes(a.token)&&!text.includes(b.token)&&!text.includes(roomCode));
    }
  }finally{await f.cleanup();}
});

test('一次连续上弦：角色校验、同一时钟、重复不加速、掉线冻结与恢复后共同启动', async () => {
  const f = await fixture({windingDurationMs:240});
  try {
    const a = await f.player(), b = await f.player(); await prepare(a,b); await gears(b); await melody(a,b);
    assert.equal(a.snapshot.winding, 0);
    assert.ok(a.snapshot.members.every(person=>!person.launchReady),'确认伴奏不自动拨好启动片');
    assert.equal((await b.command({type:'wind'})).ok, false, '图纸师不能替伙伴上弦');
    assert.equal((await a.command({type:'launchReady'})).ok, false, '装配师不能绕过发条');
    const ready:Command={id:crypto.randomUUID(),code:b.snapshot.code,stage:'launch',version:b.snapshot.version,action:{type:'launchReady'}};
    assert.equal((await b.emit('command',ready)).ok,true);await b.settle();
    const duplicateReady=await b.emit('command',ready);assert.equal(duplicateReady.ok,true);assert.equal(duplicateReady.duplicate,true);
    assert.equal(a.snapshot.members.find(person=>person.id==='B')?.launchReady, true, '拨片就绪保留，不需持续按住');
    assert.equal(a.snapshot.stage, 'launch');
    const command: Command = {id:crypto.randomUUID(),code:a.snapshot.code,stage:'launch',version:a.snapshot.version,action:{type:'wind'}};
    assert.equal((await a.emit('command',command)).ok,true); await a.settle();
    const repeated=await a.emit('command',command); assert.equal(repeated.ok,true); assert.equal(repeated.duplicate,true);
    const startedAt=a.snapshot.windingAt!;
    assert.ok(startedAt>0);assert.equal(a.snapshot.windingDurationMs,240);
    assert.equal(a.snapshot.winding,0,'第一次操作启动连续过程，不立即伪造完成');
    assert.equal(a.snapshot.members.find(person=>person.id==='A')?.launchReady,false,'计时完成前装配师还未就绪');
    assert.equal(b.snapshot.windingAt,startedAt,'两端获得同一个服务器开始时刻');
    const input = {type:'wind', amount:999, windingDurationMs:0} as unknown as Action;
    await a.act(input);
    assert.equal(a.snapshot.windingAt,startedAt,'新的重复意图不重新开始');
    assert.equal(a.snapshot.windingDurationMs,240,'客户端不能缩短持续时间');
    await delay(45);
    assert.equal(a.snapshot.stage,'launch','未到完整时长不能演出');
    assert.equal((await a.command({type:'launchReady'})).ok,false,'进行中仍不能用准备按钮绕过');
    const credential={code:b.snapshot.code,token:b.token}; b.close();
    await eventually(()=>a.snapshot.paused,'掉线使工位暂停');
    assert.equal((await a.command({type:'wind'})).ok,false);
    const frozenAt=a.snapshot.windingPausedAt!;
    assert.ok(frozenAt>=startedAt&&frozenAt<startedAt+240,'服务端保存真实暂停时刻');
    await delay(270);
    assert.equal(a.snapshot.stage,'launch');assert.equal(a.snapshot.winding,0,'离线超过原截止时间也不能自动完成');
    assert.equal(a.snapshot.windingPausedAt,frozenAt,'暂停时钟保持不动');
    const restored=await f.player(); assert.equal((await restored.emit('resume',credential)).ok,true); await restored.settle();
    assert.equal(restored.snapshot.members.find(person=>person.id==='B')?.launchReady,true,'恢复后保留拨片准备');
    assert.equal(restored.snapshot.windingPausedAt,undefined);
    assert.ok(restored.snapshot.windingAt!>startedAt+250,'恢复时排除离线时长');
    assert.equal(a.snapshot.stage,'launch','重连后继续剩余时间，不跳过未完成部分');
    await eventually(()=>a.snapshot.winding===4&&a.snapshot.stage==='performance','不需要再点，服务器自动完成连续上弦');
    assert.ok(a.snapshot.performanceAt!>=a.snapshot.windingAt!+240,'演出一定在上弦真实完成后启动');
    await eventually(()=>a.snapshot.stage==='complete'&&restored.snapshot.stage==='complete','上弦与拨片均到位后有限演出完成');
    assert.deepEqual(a.snapshot.work?.milestones?.map(item=>item.type),['first_install','tools_swapped','started'],'没有发生指认时不补写第一次指认');
  } finally { await f.cleanup(); }
});

test('生产默认连续上弦为1400毫秒，重新改编会撤销时钟并取消旧的完成回调', async () => {
  const f = await fixture({windingDurationMs:undefined});
  try {
    const a=await f.player(),b=await f.player();
    assert.equal((await (await fetch(`${f.url}/api/config`)).json()).windingDurationMs,1400);
    await prepare(a,b);await gears(b);await melody(a,b);
    await a.act({type:'wind'});
    const startedAt=a.snapshot.windingAt!;
    assert.equal(a.snapshot.windingDurationMs,1400);
    assert.equal(a.snapshot.winding,0);
    await delay(30);await b.act({type:'reopenArrangement'});
    assert.equal(a.snapshot.stage,'arrange');
    assert.equal(a.snapshot.windingAt,undefined);assert.equal(b.snapshot.windingAt,undefined);
    assert.equal(a.snapshot.windingPausedAt,undefined);
    assert.deepEqual(a.snapshot.arrangement!.approved,{A:false,B:false});
    const persisted=JSON.parse(await readFile(path.join(f.dataDir,'state.json'),'utf8')).rooms[a.snapshot.code];
    assert.equal(persisted.windingAt,undefined);assert.equal(persisted.windingDurationMs,undefined);
    await delay(Math.max(0,startedAt+1450-Date.now()));
    assert.equal(a.snapshot.stage,'arrange','已撤销的旧计时不能在原截止时间擅自启动演出');
    assert.equal(a.snapshot.winding,0);assert.equal(a.snapshot.performanceAt,undefined);
    assert.equal(a.snapshot.milestones?.some(item=>item.type==='started'),false);
    await a.act({type:'approveTrack'});await b.act({type:'approveTrack'});
    assert.equal(a.snapshot.stage,'launch');assert.equal(a.snapshot.windingAt,undefined,'重新定稿从未上弦状态开始');
    assert.equal(a.snapshot.members.find(item=>item.id==='A')!.launchReady,false);
    assert.equal(a.snapshot.members.find(item=>item.id==='B')!.launchReady,false,'回到改编后重新定稿仍须重新拨片');
  } finally {await f.cleanup();}
});

test('旧四格房间兼容与连续上弦重启：保留旧比例、持续时间和已提交暂停状态', async () => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'hepai-restart-'));
  let server=createRepairServer({dataDir}); let port=await server.start(0);
  const players: Player[]=[];
  try {
    const a=await new Player(`http://127.0.0.1:${port}`,players).connect(), b=await new Player(`http://127.0.0.1:${port}`,players).connect(); players.push(a,b);
    await prepare(a,b); await gears(b); await melody(a,b);
    const credentials=[{code:a.snapshot.code,token:a.token},{code:b.snapshot.code,token:b.token}];
    players.forEach(player=>player.close()); await server.stop();
    const state=JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8'));
    const legacy=state.rooms[credentials[0].code];
    delete legacy.gearOrder; delete legacy.stamps; delete legacy.milestones; delete legacy.arrangement;
    legacy.winding=2;delete legacy.windingAt;delete legacy.windingDurationMs;delete legacy.windingPausedAt;
    legacy.members.find((person:{id:string})=>person.id==='A').launchReady=true;
    legacy.members.find((person:{id:string})=>person.id==='B').launchReady=true;
    await writeFile(path.join(dataDir,'state.json'),JSON.stringify(state),'utf8');
    server=createRepairServer({dataDir,windingDurationMs:300}); port=await server.start(0);
    const a2=await new Player(`http://127.0.0.1:${port}`,players).connect(),b2=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a2,b2);
    assert.equal((await a2.emit('resume',credentials[0])).ok,true);assert.equal((await b2.emit('resume',credentials[1])).ok,true);await b2.settle();
    assert.equal(a2.snapshot.stage,'launch');assert.equal(a2.snapshot.winding,2);assert.equal(a2.snapshot.windingAt,undefined);
    assert.equal(a2.snapshot.members.find(person=>person.id==='A')?.launchReady,false,'旧装配师按钮不等同新上弦');
    assert.equal(a2.snapshot.members.find(person=>person.id==='B')?.launchReady,true,'旧图纸师准备保留');
    assert.deepEqual(a2.snapshot.stamps,{A:'sprout',B:'spark'});assert.deepEqual(a2.snapshot.milestones,[],'迁移不补编过去动作');
    const order=a2.snapshot.gears.map(gear=>gear.id);
    await a2.act({type:'wind'});
    assert.ok(Date.now()-a2.snapshot.windingAt!>=150,'旧一半进度映射到连续时间的一半');
    await delay(35);
    players.forEach(player=>player.close());await server.stop();
    const stopped=JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8')).rooms[credentials[0].code];
    assert.ok(stopped.windingPausedAt>stopped.windingAt);
    const savedProgress=(stopped.windingPausedAt-stopped.windingAt)/stopped.windingDurationMs;
    assert.ok(savedProgress>=.5&&savedProgress<1,'停服前提交实际已完成比例');
    await delay(350);
    server=createRepairServer({dataDir,performanceDurationMs:120,windingDurationMs:500});port=await server.start(0);
    const a3=await new Player(`http://127.0.0.1:${port}`,players).connect(),b3=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a3,b3);
    assert.equal((await a3.emit('resume',credentials[0])).ok,true);assert.equal((await b3.emit('resume',credentials[1])).ok,true);await b3.settle();
    assert.equal(a3.snapshot.winding,2);assert.equal(a3.snapshot.windingDurationMs,300,'已有进行中的时长不被新配置重设');
    assert.deepEqual(a3.snapshot.gears.map(gear=>gear.id),order,'重启不再迁移或重新洗牌');
    assert.equal(a3.snapshot.windingPausedAt,undefined);
    const restoredProgress=(Date.now()-a3.snapshot.windingAt!)/a3.snapshot.windingDurationMs!;
    assert.ok(restoredProgress>=savedProgress&&restoredProgress<savedProgress+.15,'重启后从保存比例继续，不重新开始或计入停服时间');
    assert.equal(a3.snapshot.members.find(person=>person.id==='B')?.launchReady,true);
    await eventually(()=>a3.snapshot.stage==='complete','恢复后无需再点，剩余上弦自动完成');
    assert.equal(a3.snapshot.work?.arrangement,undefined,'旧房不会被补造成新改编');
    assert.deepEqual(a3.snapshot.work?.milestones?.map(item=>item.type),['started'],'旧动作没有被回填成新事件');
  } finally {players.forEach(player=>player.close());await server.stop();assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(tmpdir()));assert.ok(path.basename(dataDir).startsWith('hepai-restart-'));await rm(dataDir,{recursive:true,force:true});}
});

test('共同改编：本人声部、前后版本、确认失效、重新打开和最终作品均由真实状态决定', async () => {
  const f=await fixture();
  try {
    const a=await f.player(),b=await f.player();await prepare(a,b);await gears(b);await melody(a,b,false);
    assert.equal(a.snapshot.stage,'arrange');assert.equal(a.snapshot.blueprint,undefined);assert.equal(b.snapshot.blueprint,undefined);
    const original=structuredClone(a.snapshot.arrangement!.current);
    assert.deepEqual(original.tracks.A.notes,['leaf','star','moon','star']);
    assert.deepEqual(original.tracks.B.notes,['leaf',null,'star',null]);
    assert.deepEqual(a.snapshot.arrangement,b.snapshot.arrangement,'两端能看见彼此实际贡献');
    assert.equal((await a.command({type:'setTrackPreset',preset:'sparse'})).ok,false,'A不能替B选择伴奏');
    assert.equal((await b.command({type:'setTrackPreset',preset:'bright'})).ok,false,'B不能替A选择主旋律');
    assert.equal((await a.command({type:'setTrackPreset',preset:'__proto__' as never})).ok,false);
    assert.equal((await a.command({type:'setTrackStep',index:0,symbol:null})).ok,false,'主旋律保留清楚的4个音');
    assert.equal((await b.command({type:'setTrackStep',index:5,symbol:'star'})).ok,false);
    assert.equal((await a.command({type:'restoreOwnTrack'})).ok,false,'未编辑过不能虚构上一轨');
    assert.equal((await a.command({type:'auditionArrangement',version:'previous'})).ok,false,'没有上一版就不伪造对比');
    await a.act({type:'approveTrack'});assert.equal(a.snapshot.stage,'arrange','单方确认不能定稿');
    const revision=a.snapshot.arrangement!.revision;
    await a.act({type:'setTrackStep',index:0,symbol:'leaf'});
    assert.equal(a.snapshot.arrangement!.approved.A,true,'同值意图不会撤销既有确认');
    assert.equal(a.snapshot.arrangement!.revision,revision);
    await b.act({type:'setTrackStep',index:1,symbol:'moon'});
    assert.deepEqual(a.snapshot.arrangement!.approved,{A:false,B:false},'听到的组合变了，两人重新确认');
    assert.deepEqual(a.snapshot.arrangement!.current.tracks.A,original.tracks.A,'B的编辑只改B声部');
    assert.deepEqual(a.snapshot.arrangement!.previous,original,'保存真实上一组合供试听');
    await a.act({type:'setTrackPreset',preset:'bright'});
    await a.act({type:'setTrackStep',index:0,symbol:'moon'});
    const aBeforeRestore=structuredClone(a.snapshot.arrangement!.current.tracks.A);
    await b.act({type:'restoreOwnTrack'});
    assert.deepEqual(b.snapshot.arrangement!.current.tracks.B,original.tracks.B,'B能恢复自己的上一轨');
    assert.deepEqual(b.snapshot.arrangement!.current.tracks.A,aBeforeRestore,'恢复本人不会改伙伴刚刚调整的主旋律');
    await a.act({type:'restoreOwnTrack'});
    assert.deepEqual(a.snapshot.arrangement!.current.tracks.A.notes,['star','leaf','star','moon']);
    await a.act({type:'auditionArrangement',version:'previous'});
    const audition=a.snapshot.arrangement!.audition!;
    assert.equal(audition.by,'A');assert.equal(audition.version,'previous');assert.deepEqual(b.snapshot.arrangement!.audition,audition,'双方收到同一次对比试听');
    await b.act({type:'auditionArrangement',version:'current'});
    assert.ok(b.snapshot.arrangement!.audition!.at>audition.at,'每次明确试听都有唯一递增时刻');
    const beforeEditAudition=b.snapshot.arrangement!.audition!.at;
    await a.act({type:'approveTrack'});await b.act({type:'setTempo',tempo:'gentle'});
    assert.deepEqual(a.snapshot.arrangement!.approved,{A:false,B:false},'共同速度改变也须重新确认');
    await a.act({type:'auditionArrangement',version:'current'});
    assert.ok(a.snapshot.arrangement!.audition!.at>beforeEditAudition,'编辑清理试听状态后，新试听仍有独立时间标识');
    await a.act({type:'setTrackStep',index:0,symbol:'moon'});
    await a.act({type:'setTrackStep',index:1,symbol:'moon'});
    await b.act({type:'setTrackStep',index:0,symbol:'star'});
    await b.act({type:'setTrackStep',index:2,symbol:'moon'});
    assert.deepEqual(a.snapshot.arrangement!.current.tracks.A.notes,['moon','moon','star','moon'],'自由改编允许任何合法主旋律，不再按维修答案判对错');
    assert.equal((await a.command({type:'wind'})).ok,false,'没有共同定稿不能上弦');
    await a.act({type:'approveTrack'});await b.act({type:'approveTrack'});
    assert.equal(a.snapshot.stage,'launch');assert.equal(a.snapshot.members.find(item=>item.id==='B')?.launchReady,false,'B定稿后仍需明确拨片');
    assert.equal(a.snapshot.performanceDurationMs,120,'测试配置可缩短演出，生产按最终曲子计算');
    await b.act({type:'launchReady'});
    await a.act({type:'wind'});await b.act({type:'reopenArrangement'});
    assert.equal(a.snapshot.stage,'arrange');assert.equal(a.snapshot.winding,0);assert.deepEqual(a.snapshot.arrangement!.approved,{A:false,B:false});
    assert.ok(a.snapshot.members.every(item=>!item.launchReady),'回去再调会清旧启动条件');
    const finalVersion=structuredClone(a.snapshot.arrangement!.current);
    await a.act({type:'approveTrack'});await b.act({type:'approveTrack'});await b.act({type:'launchReady'});await wind(a);
    await eventually(()=>a.snapshot.stage==='complete'&&b.snapshot.stage==='complete','播放最终双轨版本后保存');
    assert.deepEqual(a.snapshot.work!.arrangement,finalVersion);
    assert.deepEqual(a.snapshot.work!.notes,finalVersion.tracks.A.notes);assert.equal(a.snapshot.work!.timbre,finalVersion.tracks.A.timbre);
    await a.act({type:'shareConsent',consent:true});await b.act({type:'shareConsent',consent:true});
    const shareId=a.snapshot.work!.shareId!;
    const published=await (await fetch(`${f.url}/api/works/${shareId}`)).json();
    assert.deepEqual(published.arrangement,finalVersion,'只读端获得最终曲子，不是维修原曲或可变草稿');
    assert.equal(published.arrangement.approved,undefined);assert.equal(published.arrangement.previous,undefined,'不公开改编草稿与确认过程');
    const relay=await f.player();await relay.create('real',shareId);
    assert.equal(relay.snapshot.arrangement,undefined,'接力从修理开始，不继承原两人的创作轨');
    assert.deepEqual(relay.snapshot.installed,{});assert.equal(relay.snapshot.timbre,finalVersion.tracks.A.timbre);
    assert.deepEqual((await (await fetch(`${f.url}/api/works/${shareId}`)).json()).arrangement,finalVersion,'新工位不改原曲');
  } finally {await f.cleanup();}
});

test('改编草稿与确认可跨进程恢复，离线暂停编辑，旧作品不被补造成新曲', async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'hepai-restart-'));
  let server=createRepairServer({dataDir});let port=await server.start(0);
  const players:Player[]=[];
  try{
    const a=await new Player(`http://127.0.0.1:${port}`,players).connect(),b=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a,b);
    await prepare(a,b);await gears(b);await melody(a,b,false);
    await a.act({type:'setTrackPreset',preset:'bright'});await b.act({type:'setTrackPreset',preset:'pulse'});await a.act({type:'approveTrack'});
    const saved=structuredClone(a.snapshot.arrangement!);
    const credentials=[{code:a.snapshot.code,token:a.token},{code:b.snapshot.code,token:b.token}];
    b.close();await eventually(()=>a.snapshot.paused,'离线状态真实可见');
    assert.equal((await a.command({type:'setTrackStep',index:0,symbol:'moon'})).ok,false,'伙伴离线不悄悄改曲');
    assert.deepEqual(a.snapshot.arrangement,saved);
    players.forEach(player=>player.close());await server.stop();
    server=createRepairServer({dataDir});port=await server.start(0);
    const a2=await new Player(`http://127.0.0.1:${port}`,players).connect(),b2=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a2,b2);
    assert.equal((await a2.emit('resume',credentials[0])).ok,true);assert.equal(a2.snapshot.paused,true);
    assert.equal((await b2.emit('resume',credentials[1])).ok,true);await b2.settle();
    assert.deepEqual(a2.snapshot.arrangement,saved,'当前、上一组合、本人上一轨与确认都恢复');
    assert.equal(a2.snapshot.stage,'arrange');assert.equal(a2.snapshot.performanceDurationMs,7800,'生产演出与舒缓8拍加尾音一致');
    await b2.act({type:'approveTrack'});assert.equal(a2.snapshot.stage,'launch');
    assert.equal(a2.snapshot.members.find(item=>item.id==='B')?.launchReady,false,'恢复过的改编确认也不自动替B拨片');
    assert.equal((await a2.command({type:'setTimbre',timbre:'wood'})).ok,false,'定稿后换音色应回到共同改编重新确认');
    await a2.act({type:'reopenArrangement'});
    await b2.act({type:'setTrackStep',index:0,symbol:null});
    await b2.act({type:'setTrackStep',index:1,symbol:null});
    assert.equal((await b2.command({type:'setTrackStep',index:3,symbol:null})).ok,false,'伴奏可留白但至少保留一声');
    assert.ok(b2.snapshot.arrangement!.current.tracks.B.notes.some(Boolean));
  }finally{players.forEach(player=>player.close());await server.stop();assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(tmpdir()));assert.ok(path.basename(dataDir).startsWith('hepai-restart-'));await rm(dataDir,{recursive:true,force:true});}
});

test('完成纸签：双端私密传送、明确已读、刷新恢复、幂等与边界；分享和接力均不含纸签',async()=>{
  const f=await fixture();
  try{
    const a=await f.player(),b=await f.player(),outside=await f.player();
    await outside.create();
    assert.equal((await outside.command({type:'sendNote',text:'还没完成就留言'})).ok,false,'未完成不能发送结束纸签');
    await complete(a,b);
    const secret='我喜欢你在最后一拍留下的空白。';
    const id=crypto.randomUUID();
    await a.act({type:'sendNote',text:`  ${secret}  `});
    const first=a.snapshot.paperNotes![0];
    assert.equal(first.from,'A');assert.equal(first.to,'B');assert.equal(first.text,secret);assert.equal(first.readAt,undefined);
    assert.deepEqual(b.snapshot.paperNotes,a.snapshot.paperNotes,'伙伴收到同一张真正保存的纸签');
    assert.equal((await a.command({type:'readNote',noteId:first.id})).ok,false,'发件人不能替收件人标记已读');
    assert.equal((await b.command({type:'readNote',noteId:'not-a-note'})).ok,false);
    assert.equal((await outside.command({type:'readNote',noteId:first.id},{code:a.snapshot.code})).ok,false,'别的工位不能读取或操作这张纸签');
    assert.deepEqual(outside.snapshot.paperNotes,[]);
    assert.equal((await a.command({type:'sendNote',text:'\u0000'})).ok,false);
    assert.equal((await a.command({type:'sendNote',text:' \n\t '})).ok,false);
    assert.equal((await a.command({type:'sendNote',text:'字'.repeat(81)})).ok,false);
    const command={id,code:a.snapshot.code,stage:a.snapshot.stage,version:a.snapshot.version,action:{type:'sendNote',text:'再一起试一次轻快的结尾。'} as const};
    const sent=await a.emit('command',command);assert.equal(sent.ok,true);await a.settle();
    const resent=await a.emit('command',command);assert.equal(resent.ok,true);assert.equal(resent.duplicate,true);
    assert.equal(a.snapshot.paperNotes?.length,2,'相同命令重试不会重复投递');
    await b.act({type:'readNote',noteId:first.id});
    const readAt=b.snapshot.paperNotes![0].readAt;assert.ok(readAt);
    await b.act({type:'readNote',noteId:first.id});assert.equal(b.snapshot.paperNotes![0].readAt,readAt,'重复查看保留首次已读时刻');
    await a.act({type:'sendNote',text:'✨'.repeat(80)});
    assert.equal((await a.command({type:'sendNote',text:'第四张'})).ok,false,'每人最多三张，避免无界聊天记录');
    await b.act({type:'sendNote',text:'我也喜欢我们刚才一起选的声音。'});
    const credential={code:b.snapshot.code,token:b.token};b.close();await eventually(()=>a.snapshot.paused,'伙伴离线时明确暂停');
    const offline=await a.command({type:'sendNote',text:'离线时不伪装送达'});assert.equal(offline.ok,false);assert.match(offline.error!,/离线/);
    const b2=await f.player();assert.equal((await b2.emit('resume',credential)).ok,true);await b2.settle();
    assert.equal(b2.snapshot.paperNotes?.length,4);assert.equal(b2.snapshot.paperNotes?.[0].readAt,readAt);
    assert.equal(b2.snapshot.paperNotes?.[1].readAt,undefined,'未读纸签刷新后仍待本人查看');
    await a.act({type:'shareConsent',consent:true});await b2.act({type:'shareConsent',consent:true});
    await a.act({type:'exhibitConsent',consent:true});await b2.act({type:'exhibitConsent',consent:true});
    const publicResponse=await (await fetch(`${f.url}/api/works/${a.snapshot.work!.shareId}`)).json();
    for(const exposed of [a.snapshot.work,publicResponse,await exhibits(f.url),a.snapshot.marks]){
      assert.equal(JSON.stringify(exposed).includes(secret),false,'纸签文字不进入作品、公开接口或修理事件');
      assert.equal(JSON.stringify(exposed).includes('paperNotes'),false);
    }
    const relay=await f.player();await relay.create('real',a.snapshot.work!.shareId!);assert.deepEqual(relay.snapshot.paperNotes,[],'新工位不继承原参与者的私人话');
    const stored=JSON.parse(await readFile(path.join(f.dataDir,'state.json'),'utf8'));
    assert.equal(stored.rooms[a.snapshot.code].paperNotes.length,4,'仅房间私有状态持久化');
    assert.equal(JSON.stringify(stored.rooms[a.snapshot.code].events).includes(secret),false);
    await a.act({type:'leave'});
    assert.equal((await b2.command({type:'sendNote',text:'结束后不能偷偷发送'})).ok,false);
  }finally{await f.cleanup();}
});

test('未读纸签和已读时刻跨服务重启恢复，旧房间保持空纸签不补造消息',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'hepai-notes-restart-'));
  let server=createRepairServer({dataDir,performanceDurationMs:120,windingDurationMs:80});let port=await server.start(0);
  const players:Player[]=[];
  try{
    const a=await new Player(`http://127.0.0.1:${port}`,players).connect(),b=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a,b);
    await complete(a,b);await a.act({type:'sendNote',text:'这一张等你回来再看。'});await b.act({type:'sendNote',text:'谢谢你刚才的指认。'});
    await a.act({type:'readNote',noteId:a.snapshot.paperNotes!.find(note=>note.to==='A')!.id});
    const old=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(old);await old.create();
    const oldCredential={code:old.snapshot.code,token:old.token};
    const notes=structuredClone(a.snapshot.paperNotes!),credentials=[{code:a.snapshot.code,token:a.token},{code:b.snapshot.code,token:b.token}];
    players.forEach(player=>player.close());await server.stop();
    const statePath=path.join(dataDir,'state.json'),state=JSON.parse(await readFile(statePath,'utf8'));
    delete state.rooms[oldCredential.code].paperNotes;
    await writeFile(statePath,JSON.stringify(state),'utf8');
    server=createRepairServer({dataDir});port=await server.start(0);
    const a2=await new Player(`http://127.0.0.1:${port}`,players).connect(),b2=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(a2,b2);
    assert.equal((await a2.emit('resume',credentials[0])).ok,true);assert.equal((await b2.emit('resume',credentials[1])).ok,true);await b2.settle();
    assert.deepEqual(b2.snapshot.paperNotes,notes);
    assert.equal(b2.snapshot.paperNotes?.find(note=>note.to==='B')?.readAt,undefined);
    await b2.act({type:'readNote',noteId:b2.snapshot.paperNotes!.find(note=>note.to==='B')!.id});
    assert.ok(a2.snapshot.paperNotes?.find(note=>note.to==='B')?.readAt);
    const old2=await new Player(`http://127.0.0.1:${port}`,players).connect();players.push(old2);
    assert.equal((await old2.emit('resume',oldCredential)).ok,true);assert.deepEqual(old2.snapshot.paperNotes,[],'旧房间缺少纸签字段时仅恢复空数组');
  }finally{players.forEach(player=>player.close());await server.stop();assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(tmpdir()));assert.ok(path.basename(dataDir).startsWith('hepai-notes-restart-'));await rm(dataDir,{recursive:true,force:true});}
});
