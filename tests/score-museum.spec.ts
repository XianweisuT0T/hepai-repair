import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Action, PublicWork, Result, Snapshot } from '../shared/types';
import type { ScoreWorldRenderedState } from '../shared/scoreWorld';

const BACKEND='http://127.0.0.1:3011';
const evidence=(name:string)=>path.resolve('output/playwright',`museum-score-${name}`);
const model=(page:Page)=>page.getByTestId('production-canvas');
async function world(page:Page):Promise<ScoreWorldRenderedState>{return JSON.parse((await model(page).getAttribute('data-score-world'))||'null');}
async function readyModel(page:Page){await expect(model(page)).toHaveAttribute('data-webgl','ready',{timeout:30000});await expect(model(page)).toHaveAttribute('data-camera-moving','false');await expect(page.locator('canvas')).toHaveCount(1);await expect.poll(async()=>!!await world(page)).toBe(true);}
async function exhibits(request:APIRequestContext):Promise<PublicWork[]>{const response=await request.get('/api/exhibits');expect(response.ok()).toBe(true);expect(response.headers()['cache-control']).toContain('no-store');return(await response.json()).works;}
async function openMuseum(page:Page){await page.goto('/?museum=1');await expect(page.getByTestId('museum')).toBeVisible();}
async function visibleHit(page:Page,testId:string){
  await expect.poll(()=>page.getByTestId(testId).evaluate(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.height>=44&&r.top>=0&&r.bottom<=innerHeight&&!!hit&&(element===hit||element.contains(hit));})).toBe(true);
}
async function consent(page:Page,testId:string,checked:boolean){const input=page.getByTestId(testId);await expect(input).toBeEnabled();if(await input.isChecked()!==checked)await input.click();if(checked)await expect(input).toBeChecked();else await expect(input).not.toBeChecked();}

class Peer {
  socket:Socket;snapshot!:Snapshot;token='';
  constructor(readonly peers:Peer[]){this.socket=io(BACKEND,{transports:['websocket'],autoConnect:false,forceNew:true,reconnection:false});this.socket.on('snapshot',(value:Snapshot)=>{this.snapshot=value;});}
  async connect(){await new Promise<void>((resolve,reject)=>{this.socket.once('connect',resolve);this.socket.once('connect_error',reject);this.socket.connect();});return this;}
  async emit(event:string,input:unknown){const result=await new Promise<Result>((resolve,reject)=>this.socket.timeout(5000).emit(event,input,(error:Error|null,value:Result)=>error?reject(error):resolve(value)));expect(result.ok,result.error).toBe(true);if(result.snapshot)this.snapshot=result.snapshot;if(result.token)this.token=result.token;return result;}
  async settle(){const version=this.snapshot.version;for(const peer of this.peers)if(peer.socket.connected&&peer.snapshot?.code===this.snapshot.code)await expect.poll(()=>peer.snapshot.version).toBeGreaterThanOrEqual(version);}
  async act(action:Action){const result=await this.emit('command',{id:crypto.randomUUID(),code:this.snapshot.code,stage:this.snapshot.stage,version:this.snapshot.version,action});await this.settle();return result;}
  close(){this.socket.disconnect();}
}

/** Real protocol setup in the isolated service. No work, consent, or gallery record is fabricated. */
async function arrangedPair(){
  const peers:Peer[]=[];
  const a=await new Peer(peers).connect();peers.push(a);const b=await new Peer(peers).connect();peers.push(b);
  await a.emit('create',{mode:'real'});await b.emit('join',{code:a.snapshot.code});await a.settle();
  await a.act({type:'ready'});await b.act({type:'ready'});
  for(const target of a.snapshot.blueprint!.gears!){const gear=b.snapshot.gears.find(part=>part.size===target.size&&part.notches===target.notches)!;await b.act({type:'placeGear',gearId:gear.id,slotId:target.slot});}
  await a.act({type:'swapReady'});await b.act({type:'swapReady'});await b.act({type:'selectMelody',melody:'bright'});await a.act({type:'setTimbre',timbre:'wood'});
  for(const[index,symbol]of b.snapshot.blueprint!.notes!.entries())await a.act({type:'placeNote',index,symbol});
  await a.act({type:'checkMelody'});await a.act({type:'setTrackPreset',preset:'bright'});await b.act({type:'setTrackPreset',preset:'pulse'});await a.act({type:'setTempo',tempo:'gentle'});
  return{a,b,peers,sessionA:{code:a.snapshot.code,token:a.token},sessionB:{code:b.snapshot.code,token:b.token}};
}

async function launchedPair(){const setup=await arrangedPair();await setup.a.act({type:'approveTrack'});await setup.b.act({type:'approveTrack'});return setup;}
function intentLog(page:Page){
  const commands=new Map<string,string>();
  const collect=(wire:string)=>{for(const packet of wire.split('\x1e')){const start=packet.indexOf('[');if(start<0)continue;try{const event=JSON.parse(packet.slice(start));if(event[0]==='command'&&typeof event[1]?.id==='string'&&typeof event[1]?.action?.type==='string')commands.set(event[1].id,event[1].action.type);}catch{/* Engine.IO transport/ack packets are not commands. */}}};
  page.on('websocket',socket=>socket.on('framesent',frame=>collect(String(frame.payload))));
  page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/socket.io/'))collect(request.postData()||'');});
  return{commands,count:(type:string)=>[...commands.values()].filter(value=>value===type).length};
}
async function geometryPath(page:Page,key:'arm'|'crank'){
  const path=JSON.parse((await model(page).getAttribute(`data-${key}-path`))||'[]')as[number,number][];expect(path).toHaveLength(17);
  const rect=(await model(page).locator('canvas').boundingBox())!;
  return path.map(([x,y])=>({x:rect.x+(x+1)*rect.width/2,y:rect.y+(1-y)*rect.height/2}));
}
async function mouseArm(page:Page,end:number,reverse=false){
  const path=await geometryPath(page,'arm');await page.mouse.move(path[0].x,path[0].y);await page.mouse.down();await expect(model(page)).toHaveAttribute('data-arm-dragging','true');
  if(reverse)await page.mouse.move(path[0].x*2-path[end].x,path[0].y*2-path[end].y,{steps:6});
  else for(let index=1;index<=end;index++)await page.mouse.move(path[index].x,path[index].y,{steps:2});
  return path;
}
async function browserSession(context:BrowserContext,session:{code:string;token:string}){await context.addInitScript(value=>sessionStorage.setItem('hepai-session-v1',JSON.stringify(value)),session);return context.newPage();}
async function restArm(page:Page){await expect(model(page)).toHaveAttribute('data-arm-dragging','false');await expect.poll(async()=>Number(await model(page).getAttribute('data-arm-progress'))).toBeLessThan(.01);await expect(model(page)).toHaveAttribute('data-guide-ready','false');}

test('滑拨片与演奏观察：真实双端短拖反向不准备，有效滑动仅一次，演奏360不停声',async({browser})=>{
  const setup=await launchedPair(),ca=await browser.newContext({viewport:{width:1440,height:900}}),cb=await browser.newContext({viewport:{width:1440,height:900}});
  await ca.addInitScript(()=>{const starts:number[]=[];Object.defineProperty(window,'__performanceToneStarts',{value:starts});const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const oscillator=create.call(this),start=oscillator.start.bind(oscillator);oscillator.start=(at?:number)=>{if(document.querySelector('main.stage-performance'))starts.push(oscillator.frequency.value);start(at);};return oscillator;};});
  const a=await browserSession(ca,setup.sessionA),b=await browserSession(cb,setup.sessionB),aLog=intentLog(a),bLog=intentLog(b);setup.peers.forEach(peer=>peer.close());
  try{
    await Promise.all([a.goto('/'),b.goto('/')]);await readyModel(a);await readyModel(b);await expect(b.getByTestId('launch-ready')).toBeEnabled();
    await expect(model(b)).toHaveAttribute('data-arm-threshold','0.65');await expect(a.getByTestId('launch-ready')).toHaveCount(0);
    const forbidden=await geometryPath(a,'arm');await a.mouse.click(forbidden[0].x,forbidden[0].y);expect(aLog.count('launchReady')).toBe(0);await expect(model(b)).toHaveAttribute('data-guide-ready','false');
    await mouseArm(b,6);const mid=Number(await model(b).getAttribute('data-arm-progress'));expect(mid).toBeGreaterThan(.2);expect(mid).toBeLessThan(.65);
    await b.screenshot({path:evidence('arm-following-1440.png'),fullPage:true});await b.mouse.up();await restArm(b);expect(bLog.count('launchReady')).toBe(0);
    await mouseArm(b,5,true);await b.mouse.up();await restArm(b);expect(bLog.count('launchReady')).toBe(0);
    await mouseArm(b,14);await b.mouse.up();await expect(model(b)).toHaveAttribute('data-guide-ready','true');expect(bLog.count('launchReady')).toBe(1);
    const disabled=await geometryPath(b,'arm');await b.mouse.click(disabled[16].x,disabled[16].y);expect(bLog.count('launchReady')).toBe(1);await expect(model(a)).toHaveAttribute('data-winding-started','false');
    await a.getByRole('button',{name:'点击开启声音',exact:true}).click();const crank=await geometryPath(a,'crank');
    await a.mouse.move(crank[0].x,crank[0].y);await a.mouse.down();await expect(model(a)).toHaveAttribute('data-crank-dragging','true');await a.mouse.move(crank[1].x,crank[1].y,{steps:4});await a.mouse.up();
    await a.locator('main.stage-performance').waitFor();await readyModel(a);await expect(model(a)).toHaveAttribute('data-camera-mode','observe');await expect(a.getByTestId('production-toggle-lid')).toBeDisabled();
    const started=await model(a).getAttribute('data-playback-started-at'),clock=await world(a),tones=await a.evaluate(()=>(window as unknown as{__performanceToneStarts:number[]}).__performanceToneStarts.length),beforeIntents=[aLog.commands.size,bLog.commands.size];
    expect(Number(started)).toBeGreaterThan(0);expect(clock.active).toBe(true);expect(tones).toBeGreaterThan(0);
    let previous=await model(a).evaluate(e=>Math.atan2(Number(e.dataset.cameraX),Number(e.dataset.cameraZ))),travel=0;
    for(let index=0;index<9;index++){
      const rect=(await model(a).locator('canvas').boundingBox())!,distance=rect.height*.27;
      await a.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.5);await a.mouse.down();await a.mouse.move(rect.x+rect.width*.7-distance,rect.y+rect.height*.5,{steps:6});await a.mouse.up();await a.waitForTimeout(80);
      const next=await model(a).evaluate(e=>Math.atan2(Number(e.dataset.cameraX),Number(e.dataset.cameraZ)));let delta=next-previous;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;travel+=Math.abs(delta);previous=next;
    }
    expect(travel).toBeGreaterThan(Math.PI*2);await expect(a.locator('main.stage-performance')).toBeVisible();await expect(model(a)).toHaveAttribute('data-playback-started-at',started!);await expect(model(a)).toHaveAttribute('data-playing','true');
    const after=await world(a);expect(after.elapsedBeats).toBeGreaterThan(clock.elapsedBeats+.2);expect(after.starBaseHeights).toEqual(clock.starBaseHeights);expect(after.beatMs).toBe(clock.beatMs);
    expect(await a.evaluate(()=>(window as unknown as{__performanceToneStarts:number[]}).__performanceToneStarts.length)).toBeGreaterThan(tones);expect([aLog.commands.size,bLog.commands.size]).toEqual(beforeIntents);expect(aLog.count('wind')).toBe(1);expect(bLog.count('launchReady')).toBe(1);
    await a.screenshot({path:evidence('performance-orbit-live-1440.png'),fullPage:true});
  }finally{setup.peers.forEach(peer=>peer.close());await ca.close();await cb.close();}
});

test('滑拨片手机：原生触摸取消不确认，点击与HTML替代保留，演奏触摸观察不中断',async({browser})=>{
  const setup=await launchedPair(),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  setup.b.close();const page=await browserSession(context,setup.sessionB),log=intentLog(page);
  try{
    await page.goto('/');await readyModel(page);await expect(page.getByTestId('launch-ready')).toBeEnabled();const points=await geometryPath(page,'arm'),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});await expect(model(page)).toHaveAttribute('data-arm-dragging','true');
    for(let index=1;index<=14;index++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[points[index]]});
    await expect.poll(async()=>Number(await model(page).getAttribute('data-arm-progress'))).toBeGreaterThan(.65);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await restArm(page);expect(log.count('launchReady')).toBe(0);expect(setup.a.snapshot.members.find(member=>member.id==='B')!.launchReady).toBe(false);
    const tap=(await geometryPath(page,'arm'))[0];await page.touchscreen.tap(tap.x,tap.y);await expect(model(page)).toHaveAttribute('data-guide-ready','true');expect(log.count('launchReady')).toBe(1);
    await expect.poll(()=>setup.a.snapshot.members.find(member=>member.id==='B')!.launchReady).toBe(true);await setup.a.act({type:'reopenArrangement'});await expect(page.getByTestId('arrangement-board')).toBeVisible();
    await setup.a.act({type:'approveTrack'});await page.getByTestId('arrangement-approve').tap();await expect(page.getByTestId('launch-ready')).toBeEnabled();await page.getByTestId('launch-ready').tap();await expect(model(page)).toHaveAttribute('data-guide-ready','true');expect(log.count('launchReady')).toBe(2);
    const readyPath=await geometryPath(page,'arm');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[readyPath[16]]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[readyPath[0]]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(log.count('launchReady')).toBe(2);
    await expect.poll(()=>setup.a.snapshot.members.find(member=>member.id==='B')!.launchReady).toBe(true);await setup.a.act({type:'wind'});await page.locator('main.stage-performance').waitFor();await readyModel(page);await expect(model(page)).toHaveAttribute('data-camera-mode','observe');
    const started=await model(page).getAttribute('data-playback-started-at'),clock=await world(page),rect=(await model(page).locator('canvas').boundingBox())!,before=await model(page).getAttribute('data-camera-x');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.8,y:rect.y+rect.height*.55}]});
    for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*(.8-step*.09),y:rect.y+rect.height*.55}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>model(page).getAttribute('data-camera-x')).not.toBe(before);await expect(model(page)).toHaveAttribute('data-playback-started-at',started!);await expect(model(page)).toHaveAttribute('data-playing','true');expect((await world(page)).elapsedBeats).toBeGreaterThanOrEqual(clock.elapsedBeats);expect(log.count('launchReady')).toBe(2);
    await expect(page.getByRole('button',{name:'点击开启声音',exact:true})).toBeVisible();await page.screenshot({path:evidence('arm-performance-touch-390.png'),fullPage:true});await cdp.detach();
  }finally{setup.peers.forEach(peer=>peer.close());await context.close();}
});

test.beforeEach(async({request,baseURL})=>{
  // Abort before any create/consent command if this spec is accidentally run against the main shop.
  expect(new URL(baseURL!).port).toBe('5183');
  const boundary=await request.get(`${BACKEND}/__museum-test-boundary`);expect(boundary.ok()).toBe(true);expect(await boundary.json()).toEqual({kind:'isolated-museum-e2e',port:3011});
  const proxy=await request.get('/api/config');expect(proxy.ok()).toBe(true);expect((await proxy.json()).port).toBe(3011);
  await mkdir(path.dirname(evidence('placeholder')),{recursive:true});
});

test('隔离真双人：改编驱动模型、独立展出授权、360欣赏和新工位接力，再由一方撤展',async({browser,request})=>{
  const setup=await arrangedPair(),contexts=[];
  const ca=await browser.newContext({viewport:{width:1440,height:900}}),cb=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(ca,cb);
  const visitorContext=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(visitorContext);
  await ca.addInitScript(session=>sessionStorage.setItem('hepai-session-v1',JSON.stringify(session)),setup.sessionA);
  await cb.addInitScript(session=>sessionStorage.setItem('hepai-session-v1',JSON.stringify(session)),setup.sessionB);
  await visitorContext.addInitScript(()=>{const tones:number[]=[];Object.defineProperty(window,'__museumTones',{value:tones});const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const oscillator=create.call(this),start=oscillator.start.bind(oscillator);oscillator.start=(at?:number)=>{tones.push(oscillator.frequency.value);start(at);};return oscillator;};});
  const a=await ca.newPage(),b=await cb.newPage(),visitor=await visitorContext.newPage();
  try{
    expect(await exhibits(request)).toEqual([]);setup.peers.forEach(peer=>peer.close());
    await Promise.all([a.goto('/'),b.goto('/')]);await expect(a.getByTestId('arrangement-board')).toBeVisible();await readyModel(a);await readyModel(b);
    await expect(model(a)).toHaveAttribute('data-stage','arrange');await expect(model(a)).toHaveAttribute('data-view','box');await expect(model(a)).toHaveAttribute('data-camera-mode','fixed');
    const initial=await world(a);expect(initial.starBaseHeights).toEqual([.67,.44,.67,.9]);expect(initial.lampOn).toEqual([true,true,false,true]);
    await a.getByTestId('track-step-A-0').click();await expect(a.getByTestId('track-step-A-0')).toHaveAttribute('data-symbol','moon');
    await expect.poll(async()=>(await world(a)).starHeights[0]).toBeGreaterThan(initial.starHeights[0]+.1);
    for(const symbol of ['star','moon','rest']){await b.getByTestId('track-step-B-0').click();await expect(b.getByTestId('track-step-B-0')).toHaveAttribute('data-symbol',symbol);}
    await expect.poll(async()=>(await world(a)).lampOn[0]).toBe(false);
    await a.getByTestId('arrangement-more').click();await a.getByTestId('tempo-slow').click();await expect.poll(async()=>(await world(a)).beatMs).toBe(850);
    await a.screenshot({path:evidence('arrangement-1440.png'),fullPage:true});
    await a.getByTestId('arrangement-approve').click();await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');await b.getByTestId('arrangement-approve').click();
    await b.getByTestId('launch-ready').click();await a.getByTestId('wind-step').click();await expect(a.getByTestId('save-card')).toBeVisible({timeout:16000});await readyModel(a);
    await a.getByLabel('各留一个词，合成它的名字').fill('隔离验收');await a.getByRole('button',{name:'留下',exact:true}).click();
    await b.getByLabel('各留一个词，合成它的名字').fill('自动样例');await b.getByRole('button',{name:'留下',exact:true}).click();await expect(a.locator('.work-title')).toHaveText('隔离验收 · 自动样例');
    const final=await world(a);expect(final.starBaseHeights).toEqual([.9,.44,.67,.9]);expect(final.lampOn).toEqual([false,true,false,true]);
    await a.getByTestId('replay').click();await expect.poll(async()=>(await world(a)).active).toBe(true);
    const beforeCapture=await world(a),beforeCamera=await model(a).evaluate(e=>['x','y','z'].map(axis=>e.getAttribute(`data-camera-${axis}`)));
    const pending=a.waitForEvent('download');await a.getByTestId('save-card').click();const download=await pending;await download.saveAs(evidence('actual-work-card.png'));
    const image=await readFile(evidence('actual-work-card.png'));expect(image.readUInt32BE(16)).toBe(1200);expect(image.readUInt32BE(20)).toBe(1500);
    await expect(model(a).locator('canvas')).toHaveAttribute('data-work-capture-source','3d');
    const afterCapture=await world(a);expect(afterCapture.playing).toBe(true);expect(afterCapture.elapsedBeats).toBeGreaterThanOrEqual(beforeCapture.elapsedBeats);expect(afterCapture.starBaseHeights).toEqual(final.starBaseHeights);
    expect(await model(a).evaluate(e=>['x','y','z'].map(axis=>e.getAttribute(`data-camera-${axis}`)))).toEqual(beforeCamera);
    await consent(a,'share-consent',true);await consent(b,'share-consent',true);await expect(a.getByTestId('share-link')).toBeVisible();
    const shareId=new URL(await a.getByTestId('share-link').inputValue()).searchParams.get('work')!;
    expect(await exhibits(request)).toEqual([]);await openMuseum(visitor);await expect(visitor.getByTestId('museum-empty')).toBeVisible();
    await consent(a,'exhibit-consent',true);await expect(a.getByTestId('exhibit-status')).toContainText('等待伙伴');expect(await exhibits(request)).toEqual([]);
    await consent(b,'exhibit-consent',true);await expect.poll(async()=>(await exhibits(request)).length).toBe(1);
    const published=(await exhibits(request))[0];expect(published.shareId).toBe(shareId);expect(published.demo).toBe(false);expect(published.notes).toEqual(['moon','leaf','star','moon']);
    await openMuseum(visitor);await expect(visitor.getByTestId(`museum-card-${published.id}`)).toBeVisible();await expect(visitor.locator('canvas')).toHaveCount(0);
    await visitor.screenshot({path:evidence('gallery-1440.png'),fullPage:true});
    for(const viewport of [{width:360,height:800},{width:390,height:844}]){
      const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(context);const mobile=await context.newPage();await openMuseum(mobile);
      await expect(mobile.getByTestId(`museum-open-${shareId}`)).toBeVisible();expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await mobile.screenshot({path:evidence(`gallery-${viewport.width}.png`),fullPage:true});await mobile.getByTestId(`museum-open-${shareId}`).tap();await readyModel(mobile);
      expect((await world(mobile)).starBaseHeights).toEqual(final.starBaseHeights);expect((await world(mobile)).lampOn).toEqual(final.lampOn);
      await mobile.screenshot({path:evidence(`readonly-${viewport.width}.png`),fullPage:true});await context.close();
    }
    await visitor.getByTestId(`museum-open-${shareId}`).click();await readyModel(visitor);
    await visitor.getByRole('button',{name:'点击开启声音',exact:true}).click();await visitor.evaluate(()=>{(window as unknown as {__museumTones:number[]}).__museumTones.length=0;});await visitor.getByTestId('replay').click();
    await expect.poll(()=>visitor.evaluate(()=>(window as unknown as {__museumTones:number[]}).__museumTones.length)).toBeGreaterThan(0);await expect.poll(async()=>(await world(visitor)).beatMs).toBe(850);
    let previous=await model(visitor).evaluate(e=>Math.atan2(Number(e.dataset.cameraX),Number(e.dataset.cameraZ))),travel=0;
    for(let step=0;step<9;step++){
      const rect=(await model(visitor).locator('canvas').boundingBox())!,distance=rect.height*.27;
      await visitor.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.5);await visitor.mouse.down();await visitor.mouse.move(rect.x+rect.width*.7-distance,rect.y+rect.height*.5,{steps:8});await visitor.mouse.up();await visitor.waitForTimeout(90);
      const next=await model(visitor).evaluate(e=>Math.atan2(Number(e.dataset.cameraX),Number(e.dataset.cameraZ)));let delta=next-previous;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;travel+=Math.abs(delta);previous=next;
    }
    expect(travel).toBeGreaterThan(Math.PI*2);await visitor.screenshot({path:evidence('readonly-orbit-360.png'),fullPage:true});
    await visitor.getByRole('button',{name:/沿用这份风格/}).click();await expect(visitor.getByTestId('room-code')).toBeVisible();
    const relaySession=await visitor.evaluate(()=>JSON.parse(sessionStorage.getItem('hepai-session-v1')!));expect(relaySession.code).not.toBe(setup.sessionA.code);
    const relay=await new Peer([]).connect();try{await relay.emit('resume',relaySession);expect(relay.snapshot.stage).toBe('waiting');expect(relay.snapshot.installed).toEqual({});expect(relay.snapshot.notes).toEqual([null,null,null,null]);expect(relay.snapshot.work).toBeUndefined();}finally{relay.close();}
    await consent(b,'exhibit-consent',false);await expect.poll(async()=>(await exhibits(request)).length).toBe(0);
    expect((await request.get(`/api/works/${shareId}`)).ok()).toBe(true);
    await visitorContext.clearCookies();await visitor.goto('/?museum=1');await expect(visitor.getByTestId('museum-empty')).toBeVisible();
  }finally{setup.peers.forEach(peer=>peer.close());for(const context of contexts)await context.close();}
});

test('360手机展柜加载、失败重试与诚实空展柜，按钮可操作且没有虚构展品',async({browser})=>{
  const context=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
  let empty=false,release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/exhibits',async route=>{await pending;if(!empty)await route.fulfill({status:503,json:{error:'isolated test service error'}});else await route.fulfill({json:{works:[]}});});
  try{
    await page.goto('/?museum=1');await expect(page.getByTestId('museum-loading')).toBeVisible();release();await expect(page.getByTestId('museum-error')).toBeVisible();
    empty=true;await page.getByTestId('museum-retry').tap();await expect(page.getByTestId('museum-empty')).toBeVisible();await expect(page.locator('[data-work-id]')).toHaveCount(0);await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await visibleHit(page,'museum-create-first');
    await page.screenshot({path:evidence('empty-360x640.png'),fullPage:true});await page.getByTestId('museum-create-first').tap();await expect(page.getByTestId('room-code')).toBeVisible();
  }finally{release();await context.close();}
});

test('作品正常结束后，当前标签页的留存抽屉仍能单方撤展并保留只读链接',async({browser,request})=>{
  const setup=await arrangedPair();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
    await setup.a.act({type:'approveTrack'});await setup.b.act({type:'approveTrack'});await setup.b.act({type:'launchReady'});await setup.a.act({type:'wind'});
    await expect.poll(()=>setup.a.snapshot.stage,{timeout:14000}).toBe('complete');
    await setup.a.act({type:'setWord',word:'隔离撤展'});await setup.b.act({type:'setWord',word:'验收样例'});
    await setup.a.act({type:'shareConsent',consent:true});await setup.b.act({type:'shareConsent',consent:true});await setup.a.act({type:'exhibitConsent',consent:true});await setup.b.act({type:'exhibitConsent',consent:true});
    const work=setup.a.snapshot.work!;expect((await exhibits(request)).some(item=>item.id===work.id)).toBe(true);setup.peers.forEach(peer=>peer.close());
    await context.addInitScript(session=>sessionStorage.setItem('hepai-session-v1',JSON.stringify(session)),setup.sessionA);
    const page=await context.newPage();await page.goto('/');await expect(page.getByTestId('save-card')).toBeVisible();
    await expect.poll(()=>page.evaluate(id=>!!JSON.parse(sessionStorage.getItem('hepai-exhibit-management-v1')||'{}')[id],work.id)).toBe(true);
    await page.getByTestId('museum-from-complete').tap();await expect(page.getByTestId(`museum-card-${work.id}`)).toBeVisible();
    await page.locator('.brand-emblem').evaluate((image:HTMLImageElement)=>image.decode());
    await page.screenshot({path:evidence('gallery-reconnect-390.png'),fullPage:true});await page.setViewportSize({width:360,height:800});
    await page.screenshot({path:evidence('gallery-reconnect-360.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
    await context.setOffline(true);await expect(page.locator('.network-banner')).toContainText('连接暂时中断',{timeout:18000});
    await context.setOffline(false);await expect(page.locator('.network-banner')).toHaveCount(0,{timeout:18000});
    await page.getByTestId('museum-back').tap();await expect(page.getByTestId('save-card')).toBeVisible();
    await page.getByRole('button',{name:'离开工位',exact:true}).tap();await page.getByRole('dialog').getByRole('button',{name:'今天就到这里',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'今天就到这里。'})).toBeVisible();expect((await exhibits(request)).some(item=>item.id===work.id)).toBe(true);
    await page.getByRole('button',{name:'看看留存的作品',exact:true}).tap();const withdraw=page.getByTestId(`exhibit-withdraw-${work.id}`);await expect(withdraw).toBeVisible();
    await withdraw.tap();await expect.poll(async()=>(await exhibits(request)).some(item=>item.id===work.id)).toBe(false);await expect(withdraw).toHaveCount(0);
    expect((await request.get(`/api/works/${work.shareId}`)).ok()).toBe(true);await page.screenshot({path:evidence('ended-archive-withdraw-390.png'),fullPage:true});
  }finally{setup.peers.forEach(peer=>peer.close());await context.close();}
});

test('集成纸雕取景夹具：仅显式启用，不分享或展出',async({browser})=>{
  test.skip(process.env.MUSEUM_VIEW_FIXTURE!=='1','Set MUSEUM_VIEW_FIXTURE=1 for a scoped visual capture only.');
  const setup=await arrangedPair();setup.a.close();
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:360,height:800}]){
      const context=await browser.newContext({viewport,...(viewport.width<600?{isMobile:true,hasTouch:true,reducedMotion:'reduce' as const}:{})});
      try{
        await context.addInitScript(session=>sessionStorage.setItem('hepai-session-v1',JSON.stringify(session)),setup.sessionA);
        const page=await context.newPage();await page.goto('/');await expect(page.getByTestId('arrangement-board')).toBeVisible();await readyModel(page);
        await page.locator('.brand-emblem').evaluate((image:HTMLImageElement)=>image.decode());
        await page.screenshot({path:evidence(`arrange-frame-${viewport.width}x${viewport.height}.png`),fullPage:true});
      }finally{await context.close();}
    }
  }finally{setup.peers.forEach(peer=>peer.close());}
});
