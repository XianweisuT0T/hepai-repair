import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const proof = (name: string) => path.resolve('output/playwright', `polish-3d-${name.replace(/^(?:arrange-v3-|continuous-v4-|depth-v5-|lab-v6-2d-|workshop-v7-|production-3d-|round2-3d-|axis-3d-|polish-3d-)/,'')}`);
const entrySentence = '一人看图纸，一人装零件，中途交换，一起让音乐盒重新响起来。';
const production=(page:Page)=>page.getByTestId('production-canvas');
const object=(page:Page)=>page.locator('.production-object');
async function ready3D(page:Page) {
  await expect(object(page)).toHaveAttribute('data-render-mode','3d',{timeout:30000});
  await expect(production(page)).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect(production(page)).toHaveAttribute('data-inspection-pad-present','false');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.workbench-object .musicbox-svg,.hero-scene .musicbox-svg,.shared-box .musicbox-svg')).toHaveCount(0);
}
async function modelJson<T>(page:Page,name:string):Promise<T> {
  const value=await production(page).getAttribute(`data-${name}`);expect(value).not.toBeNull();return JSON.parse(value!);
}
async function waitCamera(page:Page) {
  await expect(object(page)).toHaveAttribute('data-camera-moving','false');
  await expect(production(page)).toHaveAttribute('data-camera-moving','false');
}
async function productionPoint(page:Page,target:string) {
  await waitCamera(page);
  await expect(production(page)).toHaveAttribute(`data-${target}-ndc-x`,/^-?\d/);
  const x=Number(await production(page).getAttribute(`data-${target}-ndc-x`)),y=Number(await production(page).getAttribute(`data-${target}-ndc-y`));
  expect(Number.isFinite(x)&&Math.abs(x)<=1).toBe(true);expect(Number.isFinite(y)&&Math.abs(y)<=1).toBe(true);
  const rect=(await production(page).locator('canvas').boundingBox())!;
  return{x:rect.x+(x+1)*rect.width/2,y:rect.y+(1-y)*rect.height/2};
}
async function raycast(page:Page,target:string) {const point=await productionPoint(page,target);await page.mouse.click(point.x,point.y);}
async function dropGear(page:Page,id:string,target:string) {
  const point=await productionPoint(page,target),canvas=production(page).locator('canvas'),rect=(await canvas.boundingBox())!;
  await page.getByTestId(`gear-${id}`).dragTo(canvas,{targetPosition:{x:point.x-rect.x,y:point.y-rect.y}});
}
async function crankPath(page:Page) {
  const path=JSON.parse((await production(page).getAttribute('data-crank-path'))||'[]') as [number,number][];
  expect(path).toHaveLength(17);const rect=(await production(page).locator('canvas').boundingBox())!;
  return path.slice(0,16).map(([x,y])=>({x:rect.x+(x+1)*rect.width/2,y:rect.y+(1-y)*rect.height/2}));
}
async function start3DWinding(page:Page) {
  await waitCamera(page);await expect.poll(async()=>Number(await production(page).getAttribute('data-crank-angle'))).toBeCloseTo(0,3);
  const points=await crankPath(page),handle=points[0];
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await expect(production(page)).toHaveAttribute('data-crank-dragging','true');
  await page.mouse.move(points[1].x,points[1].y,{steps:4});
  await page.mouse.up();await expect(production(page)).toHaveAttribute('data-crank-dragging','false');
}
async function shortCrankDoesNotStart(page:Page) {
  const handle=await productionPoint(page,'crank-handle'),points=await crankPath(page);
  let closest=0;for(let index=1;index<points.length;index++)if(Math.hypot(points[index].x-handle.x,points[index].y-handle.y)<Math.hypot(points[closest].x-handle.x,points[closest].y-handle.y))closest=index;
  const next=points[(closest+1)%16];
  await expect(production(page)).toHaveAttribute('data-crank-min-degrees','20');
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await expect(production(page)).toHaveAttribute('data-crank-dragging','true');
  await page.mouse.move((handle.x+next.x)/2,(handle.y+next.y)/2,{steps:4});await page.mouse.up();
  await expect(production(page)).toHaveAttribute('data-crank-dragging','false');
  await expect(page.getByTestId('winding-gesture-hint')).toContainText('再转一点');
  await expect(page.getByTestId('winding-progress')).toHaveAttribute('data-state','idle');
  expect(Number(await page.getByTestId('winding-progress').getAttribute('data-winding-at'))).toBe(0);
}
async function camera(page:Page) {return Promise.all(['x','y','z'].map(async axis=>Number(await production(page).getAttribute(`data-camera-${axis}`))));}
async function displayOptions(page:Page) {
  const summary=page.getByTestId('production-view-options');
  if(!(await summary.evaluate(element=>(element.parentElement as HTMLDetailsElement).open)))await summary.click();
}
async function resetView(page:Page) {
  await displayOptions(page);await page.getByTestId('production-reset-view').click();
  const summary=page.getByTestId('production-view-options');
  if(await summary.evaluate(element=>(element.parentElement as HTMLDetailsElement).open))await summary.click();
  await waitCamera(page);
}
async function completeFront(page:Page) {
  await waitCamera(page);await expect(production(page)).toHaveAttribute('data-camera-preset','complete-front');
  for(const axis of ['x','y'])expect(Math.abs(Number(await production(page).getAttribute(`data-plaque-ndc-${axis}`)))).toBeLessThan(.95);
  expect(Number(await production(page).getAttribute('data-plaque-facing-dot'))).toBeGreaterThan(.7);
  return camera(page);
}
async function fixedAssemblyCamera(page:Page) {
  await ready3D(page);await waitCamera(page);await expect(production(page)).toHaveAttribute('data-camera-mode','fixed');
  await expect(page.getByTestId('production-toggle-view')).toHaveCount(0);
  const before=await camera(page),rect=(await production(page).locator('canvas').boundingBox())!;
  expect(before[0]).toBeCloseTo(0,4);
  await page.mouse.move(rect.x+rect.width*.10,rect.y+rect.height*.9);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.32,rect.y+rect.height*.85,{steps:8});await page.mouse.up();
  // Give a mistakenly enabled Orbit controller time to produce a visible movement.
  await page.waitForTimeout(120);expect((await camera(page)).every((value,index)=>Math.abs(value-before[index])<.005)).toBe(true);
}
type GearPose={gearId:string;x:number;y:number;z:number;axisX:number;axisZ:number;installing:boolean};
type LandingProbe=HTMLElement&{landingSamples?:GearPose[];landingObserver?:MutationObserver};
async function recordLanding(page:Page) {
  // Capture actual frame telemetry in the page: a 160ms seating motion can finish between tool calls.
  await production(page).evaluate(element=>{
    const host=element as LandingProbe;host.landingObserver?.disconnect();host.landingSamples=[];
    host.landingObserver=new MutationObserver(()=>host.landingSamples!.push(...JSON.parse(host.dataset.gearPoses||'[]')));
    host.landingObserver.observe(host,{attributes:true,attributeFilter:['data-gear-poses']});
  });
}
async function directLanding(page:Page,gearId:string) {
  await expect.poll(async()=>{
    const pose=(await modelJson<GearPose[]>(page,'gear-poses')).find(item=>item.gearId===gearId);
    return !!pose&&!pose.installing&&Math.abs(pose.y-1.41)<.0001;
  },{intervals:[20,30,50]}).toBe(true);
  const samples=await production(page).evaluate((element,id)=>{
    const host=element as LandingProbe;host.landingObserver?.disconnect();
    return [...host.landingSamples!,...JSON.parse(host.dataset.gearPoses||'[]')].filter((pose:GearPose)=>pose.gearId===id) as GearPose[];
  },gearId);
  expect(samples.length).toBeGreaterThan(0);
  for(const pose of samples){
    expect(pose.x).toBeCloseTo(pose.axisX,4);expect(pose.z).toBeCloseTo(pose.axisZ,4);
    expect(pose.y).toBeGreaterThanOrEqual(1.4099);expect(pose.y).toBeLessThanOrEqual(1.5301);
  }
  expect(samples.at(-1)!.y).toBeCloseTo(1.41,4);
}
async function observeSide(page:Page) {
  await waitCamera(page);await expect(production(page)).toHaveAttribute('data-camera-mode','observe');
  const before=await camera(page),rect=(await production(page).locator('canvas').boundingBox())!;
  await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.45);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.88,rect.y+rect.height*.45,{steps:15});await page.mouse.up();
  await expect.poll(()=>camera(page)).not.toEqual(before);
}
async function compareCards(page:Page,first:Buffer,second:Buffer) {
  for(const buffer of [first,second]){expect(buffer.readUInt32BE(16)).toBe(1200);expect(buffer.readUInt32BE(20)).toBe(1500);}
  const difference=await page.evaluate(async([left,right])=>{
    const pixels=async(value:string)=>{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法解码作品PNG'));image.src=`data:image/png;base64,${value}`;});const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const [a,b]=await Promise.all([pixels(left),pixels(right)]);let sum=0,changed=0;
    for(let index=0;index<a.length;index+=4){let max=0;for(let channel=0;channel<3;channel++){const d=Math.abs(a[index+channel]-b[index+channel]);sum+=d;max=Math.max(max,d);}if(max>12)changed++;}
    return {mean:sum/(a.length/4*3),changed:changed/(a.length/4)};
  },[first.toString('base64'),second.toString('base64')]);
  expect(difference.mean).toBeLessThan(1.5);expect(difference.changed).toBeLessThan(.03);
}
async function verifyEntry(page: Page) {
  const explanation = page.getByText(entrySentence, { exact: true });
  await expect(explanation).toBeVisible();
  await ready3D(page);
  expect(Object.keys(await modelJson<Record<string,string>>(page,'installed-gears'))).toHaveLength(2);
  expect((await modelJson<(string|null)[]>(page,'notes')).filter(Boolean)).toHaveLength(2);
  expect(await explanation.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
}
async function create(page: Page, demo = false) {
  await page.goto('/');
  await page.getByRole('button', { name: demo ? /先一个人试试/ : /开一间工位/ }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  return (await page.getByTestId('room-code').innerText()).trim();
}
async function join(page: Page, code: string) {
  await page.goto(`/?room=${code}`);
  await page.getByRole('button', { name: /加入这间工位/ }).click();
  await expect(page.getByTestId('room-code')).toHaveText(code);
}
async function note(page: Page, symbol: string, index: number,realRaycast=false) {
  await page.getByTestId(`note-${symbol}`).click();
  if(realRaycast)await raycast(page,`note-${index}`);else await page.getByTestId(`note-slot-${index}`).click();
  await expect.poll(async()=>(await modelJson<(string|null)[]>(page,'notes'))[index]).toBe(symbol);
}
async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function partOrder(page: Page) {
  return page.locator('.parts-tray .part').evaluateAll(parts => parts.map(part => part.getAttribute('data-testid')));
}
async function completeContinuousWinding(page:Page,dimensions:string,partner?:Page) {
  const progress=page.getByTestId('winding-progress');
  await expect(progress).toHaveAttribute('data-state','winding');
  await expect(page.getByTestId('wind-step')).toBeDisabled();
  await expect(progress).not.toContainText(/\d+\s*\/\s*4/);
  expect(await page.locator('.winding-meter > span').count()).not.toBe(4);
  const startedAt=Number(await progress.getAttribute('data-winding-at'));
  const duration=Number(await progress.getAttribute('data-winding-duration'));
  expect(startedAt).toBeGreaterThan(0);expect(duration).toBeGreaterThanOrEqual(1000);
  if(partner){
    await expect(partner.getByTestId('winding-progress')).toHaveAttribute('data-state','winding');
    await expect(partner.getByTestId('winding-progress')).toHaveAttribute('data-winding-at',String(startedAt));
    await expect(partner.getByTestId('winding-progress')).toHaveAttribute('data-winding-duration',String(duration));
  }
  const firstProgress=Number(await progress.getAttribute('data-progress'));
  expect(firstProgress).toBeGreaterThanOrEqual(0);expect(firstProgress).toBeLessThan(1);
  if(partner){
    const crank=production(page);
    const firstAngle=await crank.getAttribute('data-crank-angle');
    expect(firstAngle).not.toBeNull();
    await expect.poll(()=>crank.getAttribute('data-crank-angle'),{intervals:[30,60],timeout:500}).not.toBe(firstAngle);
    const secondAngle=await crank.getAttribute('data-crank-angle');
    await expect.poll(()=>crank.getAttribute('data-crank-angle'),{intervals:[30,60],timeout:500}).not.toBe(secondAngle);
  }
  // Real repeated input on the disabled native button must neither restart nor shorten the clock.
  const button=await page.getByTestId('wind-step').boundingBox();
  expect(button).not.toBeNull();
  if(button)await page.mouse.click(button.x+button.width/2,button.y+button.height/2,{clickCount:3,delay:20});
  await expect(progress).toHaveAttribute('data-winding-at',String(startedAt));
  await expect.poll(async()=>Number(await progress.getAttribute('data-progress')),{intervals:[30,60,100],timeout:800}).toBeGreaterThan(firstProgress);
  await page.screenshot({path:proof(`continuous-v4-winding-${dimensions}.png`),fullPage:true});
  if(partner)await partner.screenshot({path:proof(`continuous-v4-winding-partner-${dimensions}.png`),fullPage:true});
  await expect(page.locator('main.stage-performance')).toBeVisible();
  expect(await page.evaluate(()=>Date.now())).toBeGreaterThanOrEqual(startedAt+duration-25);
  if(partner)await expect(partner.locator('main.stage-performance')).toBeVisible();
}
async function visibleInsideTray(page: Page, testId: string, minimumHeight = 0) {
  await expect.poll(() => page.evaluate(({testId,minimumHeight}) => {
    const tray = document.querySelector('.tool-panel')!.getBoundingClientRect();
    const element = document.querySelector(`[data-testid="${testId}"]`);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return window.scrollY === 0 && rect.top >= tray.top && rect.bottom <= tray.bottom && rect.left >= tray.left && rect.right <= tray.right && rect.height >= minimumHeight;
  }, {testId,minimumHeight})).toBe(true);
}
async function trackSymbols(page:Page,identity:'A'|'B') {
  return page.locator(`[data-track="${identity}"] [data-testid^="track-step-${identity}-"]`).evaluateAll(steps=>steps.map(step=>step.getAttribute('data-symbol')));
}
async function changeStepTo(page:Page,identity:'A'|'B',index:number,symbol:string) {
  const step=page.getByTestId(`track-step-${identity}-${index}`);
  for(let tries=0;tries<5;tries++) {
    const current=await step.getAttribute('data-symbol');
    if(current===symbol)return;
    await step.click();
    await expect(step).not.toHaveAttribute('data-symbol',current||'');
  }
  await expect(step).toHaveAttribute('data-symbol',symbol);
}
async function assertMechanism(page:Page) {
  await ready3D(page);await expect(object(page)).toHaveAttribute('data-view','mechanism');
  await expect(page.getByTestId('inspect-gear')).toHaveCount(0);
  await expect(page.getByTestId('mechanic-closeup-toggle')).toHaveCount(0);
}
async function approveArrangement(a:Page,b:Page) {
  await a.getByTestId('arrangement-approve').click();
  await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');
  await b.getByTestId('arrangement-approve').click();
  await expect(a.locator('main.stage-launch')).toBeVisible();
  await expect(b.locator('main.stage-launch')).toBeVisible();
  await expect(b.getByTestId('launch-ready')).toBeEnabled();
  await expect(production(a)).toHaveAttribute('data-camera-preset','launch-crank');
  await expect(production(b)).toHaveAttribute('data-camera-preset','launch-arm');
}
async function openArrangementOptions(page:Page) {
  const more=page.getByTestId('arrangement-more');
  if(!(await more.evaluate(element=>(element.parentElement as HTMLDetailsElement).open)))await more.click();
}
async function audibleFirstPair(page:Page,performanceOnly=false) {
  return page.evaluate(only=>{
    const probe=window as unknown as {__hepaiPlayedTones:number[];__hepaiPerformanceTones:number[]};
    return (only?probe.__hepaiPerformanceTones:probe.__hepaiPlayedTones).filter(hz=>hz<900).slice(0,2);
  },performanceOnly);
}
async function visibleOnPage(page:Page,testId:string,minimumHeight=44){
  await expect.poll(()=>page.evaluate(({testId,minimumHeight})=>{
    const element=document.querySelector(`[data-testid="${testId}"]`);if(!element)return false;
    const rect=element.getBoundingClientRect();
    const tray=element.closest('.tool-panel')?.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth&&rect.height>=minimumHeight&&(!tray||rect.top>=tray.top&&rect.bottom<=tray.bottom)&&!!hit&&(element===hit||element.contains(hit));
  },{testId,minimumHeight})).toBe(true);
}
async function visibleHit(locator:Locator,minimumHeight=44) {
  await expect.poll(()=>locator.evaluate((element,height)=>{
    const rect=element.getBoundingClientRect(),tray=element.closest('.tool-panel')?.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return window.scrollY===0&&rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth&&rect.height>=height&&(!tray||rect.top>=tray.top&&rect.bottom<=tray.bottom)&&!!hit&&(element===hit||element.contains(hit));
  },minimumHeight)).toBe(true);
}
async function initialGearTools(page:Page) {
  await noOverflow(page);
  for(let index=1;index<=3;index++)await visibleOnPage(page,`slot-slot-${index}`);
  const first=page.getByTestId(/^gear-gear-/).first();await visibleHit(first);await first.click();
  await visibleHit(page.getByRole('button',{name:/把选中零件递给伙伴看/}));
}

test('两个独立浏览器真实完成合作，并保存图片、只读欣赏和接力；包含错误、刷新和掉线', async ({ browser }) => {
  test.setTimeout(100000);
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextC = await browser.newContext();
  const a = await contextA.newPage(), b = await contextB.newPage(), c = await contextC.newPage();
  const errors: string[] = []; [a,b,c].forEach(page => page.on('pageerror', error => errors.push(error.message)));
  for(const page of [a,c])await page.addInitScript(()=>{
    const tones:number[]=[],performanceTones:number[]=[];
    Object.defineProperty(window,'__hepaiPlayedTones',{value:tones,configurable:true});
    Object.defineProperty(window,'__hepaiPerformanceTones',{value:performanceTones,configurable:true});
    const create=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){
      const oscillator=create.call(this),start=oscillator.start.bind(oscillator);
      oscillator.start=(when?:number)=>{tones.push(oscillator.frequency.value);if(document.querySelector('main.stage-performance'))performanceTones.push(oscillator.frequency.value);start(when);};
      return oscillator;
    };
  });
  try {
    await a.goto('/'); await verifyEntry(a); await noOverflow(a);
    await a.screenshot({ path: proof('desktop-home-1440x900.png'), fullPage: true });
    await a.screenshot({ path: proof('intake-home-1440x900.png'), fullPage: true });
    const code = await create(a); await join(b, code);
    await expect(a.locator('.role-badge')).toContainText('A · 图纸师');
    await expect(b.locator('.role-badge')).toContainText('B · 装配师');
    const tokenA = await a.evaluate(() => JSON.parse(sessionStorage.getItem('hepai-session-v1')!).token);
    const tokenB = await b.evaluate(() => JSON.parse(sessionStorage.getItem('hepai-session-v1')!).token);
    expect(tokenA).not.toEqual(tokenB);
    await c.goto(`/?room=${code}`); await c.getByRole('button', { name: /加入这间工位/ }).click();
    await expect(c.locator('.toast')).toContainText(/已满|两人/);
    await expect(a.locator('.invite-panel .role-pair')).toBeVisible();await expect(a.locator('.role-pair')).toHaveCount(1);
    for(const page of [a,b]){await ready3D(page);await waitCamera(page);await expect(production(page)).toHaveAttribute('data-camera-preset','waiting-front');}
    await a.screenshot({path:proof('lobby-1440x900.png'),fullPage:true});
    await a.getByTestId('ready').click();await expect(production(a)).toHaveAttribute('data-camera-preset','waiting-front');await expect(b.getByTestId('ready')).toBeVisible();
    await b.getByTestId('ready').click();await expect(production(b)).toHaveAttribute('data-camera-moving','true');
    await expect(a.locator('.blueprint-list')).toBeVisible();
    await expect(b.locator('.parts-tray')).toBeVisible(); await expect(b.locator('.blueprint-list')).toHaveCount(0);
    await fixedAssemblyCamera(b);
    const order = await partOrder(b);
    expect(order).toHaveLength(5);
    expect(new Set(order).size).toBe(5);
    expect(order.slice(0,3)).not.toEqual(['gear-gear-1','gear-gear-2','gear-gear-3']);
    for (const text of await b.locator('.parts-tray .part').allInnerTexts()) expect((text.match(/刻痕/g) || []).length).toBe(1);
    await a.getByRole('button', { name: '点击开启声音', exact: true }).click();
    await expect(a.getByRole('button', { name: '静音', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: '点击开启声音', exact: true })).toBeVisible();
    await b.getByTestId('gear-gear-4').click(); await ready3D(b);await raycast(b,'slot-1');
    await expect(b.locator('.toast')).toContainText(/不匹配|不合|对不上/);
    await expect(a.locator('.bench-count')).toContainText('0 / 3');
    expect(Object.keys(await modelJson<Record<string,string>>(b,'installed-gears'))).toHaveLength(0);
    await expect(a.getByTestId('gear-preview')).toHaveCount(0);
    await assertMechanism(a); await assertMechanism(b);
    await b.screenshot({path:proof('arrange-v3-gears-1440x900.png'),fullPage:true});
    await b.getByRole('button', { name: /把选中零件递给伙伴看/ }).click();
    for (const page of [a,b]) {
      await expect(page.getByTestId('gear-preview')).toBeVisible();
      await expect(production(page)).toHaveAttribute('data-preview-gear','');
      await expect(page.getByTestId('preview-gear-name')).toContainText('三道刻痕');
      await expect(page.getByTestId('preview-gear-size')).toContainText('小');
      await expect(page.getByTestId('preview-gear-notches')).toContainText('3');
      await expect(page.getByTestId('gear-preview').getByRole('img', { name: /小齿轮，3道刻痕/ })).toBeVisible();
    }
    // Pointing is a partner response, never an automatic answer check or installation.
    await a.locator('.blueprint-list button').nth(1).click();
    await a.getByTestId('confirm-placement').click();
    await expect(b.getByTestId('placement-receipt')).toContainText('圆形槽');
    await expect(production(b)).toHaveAttribute('data-partner-arrow-target','slot-2');await expect(production(b)).toHaveAttribute('data-partner-arrow-by','A');
    await expect(a.locator('.bench-count')).toContainText('0 / 3');
    await b.getByTestId('slot-slot-2').click();
    await expect(b.locator('.toast')).toContainText(/不匹配|不合|对不上/);
    await a.getByTestId('gear-preview').getByRole('button', { name: '换一块', exact: true }).click();
    await expect(b.getByTestId('preview-feedback')).toContainText('换一块');
    await expect(production(b)).toHaveAttribute('data-partner-arrow-target','');
    await a.waitForTimeout(320);
    for (const page of [a,b]) {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 30)).toBe(true);
    }
    await a.screenshot({ path: proof('refinement-preview-guide-1440x900.png'), fullPage: true });
    await b.screenshot({ path: proof('refinement-preview-maker-1440x900.png'), fullPage: true });
    await b.getByTestId('gear-gear-1').click();
    // Selecting a replacement is local; the partner sees it only after an explicit handoff.
    await expect(a.getByTestId('preview-gear-name')).toContainText('三道刻痕');
    await b.getByRole('button', { name: /把选中零件递给伙伴看/ }).click();
    for (const page of [a,b]) {
      await expect(page.getByTestId('preview-gear-name')).toContainText('一道刻痕');
      await expect(page.getByTestId('preview-gear-notches')).toContainText('1');
    }
    await expect(b.getByTestId('placement-receipt')).toHaveCount(0);
    await a.getByTestId('gear-preview').getByRole('button', { name: '可以试试', exact: true }).click();
    await expect(b.getByTestId('preview-feedback')).toContainText('可以试试');
    await expect(a.locator('.shared-messages')).toContainText('这块吗');
    await a.locator('.blueprint-list button').first().click();
    await expect(b.locator('.shared-messages')).toContainText('这里');
    await a.getByTestId('confirm-placement').click();
    await expect(b.getByTestId('placement-receipt')).toContainText('三角槽');
    await expect(production(b)).toHaveAttribute('data-partner-arrow-target','slot-1');await expect(production(b)).toHaveAttribute('data-partner-arrow-by','A');
    await a.screenshot({ path: proof('cooperation-point-guide-1440x900.png'), fullPage: true });
    await b.screenshot({ path: proof('cooperation-point-maker-1440x900.png'), fullPage: true });
    await b.getByTestId('gear-gear-1').click();await recordLanding(b);await raycast(b,'slot-1');await directLanding(b,'gear-1');
    await expect(a.locator('.bench-count')).toContainText('1 / 3');
    await expect(b.locator('.bench-count')).toContainText('1 / 3');
    await expect.poll(async()=>(await modelJson<Record<string,string>>(a,'installed-gears'))['slot-1']).toBe('gear-1');
    await b.screenshot({ path: proof('desktop-maker-gears.png'), fullPage: true });
    await b.reload(); await expect(b.locator('.role-badge')).toContainText('B · 装配师');
    await expect(b.locator('.bench-count')).toContainText('1 / 3');
    await ready3D(b);expect((await modelJson<Record<string,string>>(b,'installed-gears'))['slot-1']).toBe('gear-1');
    await displayOptions(b);await b.getByTestId('production-use-2d').click();await expect(object(b)).toHaveAttribute('data-render-mode','2d');
    await expect(b.locator('.bench-count')).toContainText('1 / 3');
    expect(await b.evaluate(()=>JSON.parse(sessionStorage.getItem('hepai-session-v1')!).token)).toBe(tokenB);
    await b.getByTestId('production-retry-3d').click();await ready3D(b);
    expect((await modelJson<Record<string,string>>(b,'installed-gears'))['slot-1']).toBe('gear-1');
    expect(await partOrder(b)).toEqual(order);
    await contextB.setOffline(true);
    await expect(a.locator('.pause-banner')).toContainText(/掉线|暂停/, { timeout: 18000 });
    await contextB.setOffline(false);
    await expect(a.locator('.pause-banner')).toHaveCount(0, { timeout: 18000 });
    await expect(b.getByTestId('gear-gear-2')).toBeEnabled();
    for (let i = 2; i <= 3; i++) {
      if(i===2){await recordLanding(b);await dropGear(b,'gear-2','slot-2');await directLanding(b,'gear-2');}
      else{await b.getByTestId(`gear-gear-${i}`).click();await b.getByTestId(`slot-slot-${i}`).click();}
      if (i === 2) await expect(a.locator('.bench-count')).toContainText('2 / 3');
    }
    await expect(a.getByTestId('swap-ready')).toBeVisible();
    await expect(a.getByTestId('gear-preview')).toHaveCount(0);
    await expect(b.getByTestId('gear-preview')).toHaveCount(0);
    await a.getByTestId('swap-ready').click(); await b.getByTestId('swap-ready').click();
    await expect(production(a)).toHaveAttribute('data-camera-moving','true');const duringMelody=await camera(a);
    await waitCamera(a);expect((await camera(a)).some((value,index)=>Math.abs(value-duringMelody[index])>.001)).toBe(true);
    expect((await camera(a))[0]).toBeCloseTo(0,4);
    await expect(a.locator('.role-badge')).toContainText('A · 装配师');
    await expect(b.locator('.role-badge')).toContainText('B · 图纸师');
    await b.getByTestId('melody-bright').click();
    await expect(b.locator('.melody-blueprint')).toBeVisible();
    await expect(a.locator('.melody-blueprint')).toHaveCount(0);
    await a.getByRole('button', { name: '试听叶', exact: true }).click();
    await a.getByRole('button', { name: '静音', exact: true }).click();
    await expect(a.getByRole('button', { name: '点击开启声音', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: '点击开启声音', exact: true })).toBeVisible();
    await a.getByTestId('timbre-wood').click();
    await a.getByRole('button', { name: '樱桃木外观' }).click();
    for (const [index, symbol] of ['leaf','star','moon','star'].entries()) await note(a, symbol, index,index===0);
    await a.screenshot({ path: proof('desktop-maker-melody.png'), fullPage: true });
    await a.getByRole('button', { name: /一起试奏/ }).click();
    await expect(b.locator('.shared-messages')).toContainText('试奏这段');
    await a.getByTestId('check-melody').click();
    await expect(a.getByTestId('arrangement-board')).toBeVisible();
    await expect(b.getByTestId('arrangement-board')).toBeVisible();
    await expect(a.getByTestId('track-step-A-0')).toHaveJSProperty('tagName','BUTTON');
    await expect(a.getByTestId('track-step-B-0')).not.toHaveJSProperty('tagName','BUTTON');
    await expect(b.getByTestId('track-step-A-0')).not.toHaveJSProperty('tagName','BUTTON');
    await a.getByTestId('track-preset-bright').click();
    await expect(a.getByTestId('track-preset-bright')).toHaveAttribute('aria-pressed','true');
    await expect(b.getByTestId('track-step-A-0')).toHaveAttribute('data-symbol','star');
    await b.getByTestId('track-preset-pulse').click();
    await expect(b.getByTestId('track-preset-pulse')).toHaveAttribute('aria-pressed','true');
    await expect(a.getByTestId('track-step-B-1')).toHaveAttribute('data-symbol','star');
    await a.getByTestId('arrangement-approve').click();
    await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');
    await a.getByTestId('track-preset-bright').click();
    await expect(a.getByTestId('track-preset-bright')).toHaveAttribute('aria-pressed','true');
    await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');
    const beforeA=await trackSymbols(a,'A'), beforeB=await trackSymbols(a,'B');
    await a.getByTestId('track-step-A-0').click();
    await expect(b.getByTestId('track-step-A-0')).not.toHaveAttribute('data-symbol','star');
    await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','false');
    await a.getByRole('button',{name:'点击开启声音',exact:true}).click();
    await a.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await a.getByTestId('arrangement-listen-current').click();
    await expect(b.getByTestId('arrangement-board')).toHaveAttribute('data-audition-version','current');
    await expect.poll(()=>b.locator('[data-track][data-playing-step]:not([data-playing-step="-1"])').count()).toBeGreaterThan(0);
    await expect.poll(()=>a.evaluate(()=>{
      const tones=(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones;
      return tones.some(hz=>hz>200&&hz<500)&&tones.some(hz=>hz>500&&hz<900);
    })).toBe(true);
    expect(await a.evaluate(()=>(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones[0])).toBeCloseTo(783.99,1);
    await expect(b.getByRole('button',{name:'点击开启声音',exact:true})).toBeVisible();
    await a.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await a.getByTestId('arrangement-listen-previous').click();
    await expect(b.getByTestId('arrangement-board')).toHaveAttribute('data-audition-version','previous');
    await expect.poll(()=>b.locator('[data-track][data-playing-step]:not([data-playing-step="-1"])').count()).toBeGreaterThan(0);
    await expect.poll(()=>a.evaluate(()=>(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length)).toBeGreaterThan(0);
    expect(await a.evaluate(()=>(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones[0])).toBeCloseTo(659.25,1);
    await openArrangementOptions(a);await a.getByTestId('arrangement-undo').click();
    await expect.poll(()=>trackSymbols(a,'A')).toEqual(beforeA);
    expect(await trackSymbols(a,'B')).toEqual(beforeB);
    await changeStepTo(b,'B',1,'rest');
    await expect(a.getByTestId('track-step-B-1')).toHaveAttribute('data-symbol','rest');
    await b.getByTestId('arrangement-approve').click();
    await expect(b.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');
    await a.getByTestId('track-step-A-1').click();
    await expect(b.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','false');
    await openArrangementOptions(a);await a.getByTestId('arrangement-undo').click();
    await expect.poll(()=>trackSymbols(a,'A')).toEqual(beforeA);
    await openArrangementOptions(a);await a.getByTestId('tempo-gentle').click();
    const finalTrackA=await trackSymbols(a,'A'),finalTrackB=await trackSymbols(a,'B');
    await a.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await a.getByTestId('arrangement-listen-current').click();
    await expect.poll(async()=>(await audibleFirstPair(a)).length).toBe(2);
    const finalFirstPair=await audibleFirstPair(a);
    expect(finalFirstPair[0]).toBeCloseTo(659.25,1);expect(finalFirstPair[1]).toBeCloseTo(261.625,1);
    await a.screenshot({path:proof('arrange-v3-composing-A-1440x900.png'),fullPage:true});
    await b.screenshot({path:proof('arrange-v3-composing-B-1440x900.png'),fullPage:true});
    await approveArrangement(a,b);
    await expect(object(a)).toHaveAttribute('data-view','winding');
    await ready3D(b);await raycast(b,'arm');
    await expect(b.getByTestId('launch-ready-state')).toBeVisible();
    await a.getByTestId('arrangement-reopen').click();
    await expect(a.getByTestId('arrangement-board')).toBeVisible();
    await expect(a.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','false');
    await expect(b.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','false');
    expect(await trackSymbols(a,'A')).toEqual(finalTrackA);expect(await trackSymbols(a,'B')).toEqual(finalTrackB);
    await approveArrangement(a,b);
    await expect(a.getByTestId('launch-ready')).toHaveCount(0);
    await b.getByTestId('launch-ready').click();
    await expect(b.getByTestId('launch-ready-state')).toBeVisible();
    await a.screenshot({ path: proof('arrange-v3-winding-1440x900.png'), fullPage: true });
    await ready3D(a);
    await shortCrankDoesNotStart(a);
    await a.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await start3DWinding(a);
    await completeContinuousWinding(a,'1440x900',b);
    await expect.poll(()=>audibleFirstPair(a,true)).toEqual(finalFirstPair);
    await expect(a.getByTestId('save-card')).toBeVisible({ timeout: 14000 });
    await expect(b.getByTestId('save-card')).toBeVisible();
    await ready3D(a);await expect(object(a)).toHaveAttribute('data-view','box');
    const defaultCompleteCamera=await completeFront(a);
    expect(Object.keys(await modelJson<Record<string,string>>(a,'installed-gears'))).toHaveLength(3);
    expect(await modelJson<string[]>(a,'notes')).toEqual(finalTrackA);
    await a.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await a.getByTestId('replay').click();
    await expect.poll(()=>audibleFirstPair(a)).toEqual(finalFirstPair);
    await a.getByTestId('stamp-wave').click();
    await expect(b.locator('.stamp-contributors')).toContainText('水纹');
    await b.getByTestId('stamp-crescent').click();
    await expect(a.getByTestId('stamp-wave')).toHaveAttribute('aria-pressed','true');
    await expect(b.getByTestId('stamp-crescent')).toHaveAttribute('aria-pressed','true');
    await expect(a.getByTestId('repair-recap').locator('[data-milestone]')).toHaveCount(4);
    expect(await a.getByTestId('repair-recap').locator('[data-milestone]').evaluateAll(items => items.map(item => item.getAttribute('data-milestone')))).toEqual(['first_point','first_install','tools_swapped','started']);
    await a.getByLabel('各留一个词，合成它的名字').fill('晚风');
    await a.getByRole('button', { name: '留下', exact: true }).click();
    await b.getByLabel('各留一个词，合成它的名字').fill('星光');
    await b.getByRole('button', { name: '留下', exact: true }).click();
    await expect(a.locator('.work-title')).toHaveText('晚风 · 星光');
    await a.getByRole('button', { name: /留一点体验反馈/ }).click();
    const feedback = a.getByRole('dialog');
    await expect(feedback.getByRole('button', { name: '私密保存反馈' })).toBeDisabled();
    await feedback.getByLabel('配合时是否舒适？').selectOption('舒适');
    await feedback.getByLabel('哪里顺手，哪里卡住了？').fill('PRIVATE-BROWSER-FEEDBACK');
    await feedback.getByRole('checkbox', { name: /我自愿保存本次匿名反馈/ }).check();
    await feedback.getByRole('button', { name: '私密保存反馈' }).click();
    await expect(feedback).toHaveCount(0);
    await expect(a.getByRole('button', { name: '反馈已私密保存' })).toBeVisible();
    await expect(b.locator('body')).not.toContainText('PRIVATE-BROWSER-FEEDBACK');
    await resetView(a);
    expect((await camera(a)).every((value,index)=>Math.abs(value-defaultCompleteCamera[index])<.01)).toBe(true);
    const downloadEvent = a.waitForEvent('download'); await a.getByTestId('save-card').click();
    const download = await downloadEvent; expect(download.suggestedFilename()).toMatch(/\.png$/);
    await download.saveAs(proof('completed-work-card.png'));
    await download.saveAs(proof('arrange-v3-work-card.png'));
    await expect(production(a).locator('canvas')).toHaveAttribute('data-work-capture-source','3d');
    const capturedWorkId=await production(a).locator('canvas').getAttribute('data-work-capture-work-id');expect(capturedWorkId).toBeTruthy();
    await observeSide(a);await a.screenshot({path:proof('work-orbit-before-export-1440x900.png'),fullPage:true});
    await a.getByTestId('save-card').focus();
    const neutralDownloadEvent=a.waitForEvent('download');await a.keyboard.press('Enter');
    const neutralDownload=await neutralDownloadEvent;await neutralDownload.saveAs(proof('work-card-after-orbit.png'));
    await expect(production(a).locator('canvas')).toHaveAttribute('data-work-capture-source','3d');
    await compareCards(a,await readFile(proof('arrange-v3-work-card.png')),await readFile(proof('work-card-after-orbit.png')));
    await a.getByTestId('share-consent').check(); await expect(a.getByTestId('share-link')).toHaveCount(0);
    await b.getByTestId('share-consent').check();
    await expect(a.getByTestId('share-link')).toBeVisible();
    const shareLink = await a.getByTestId('share-link').inputValue();
    expect(shareLink).not.toContain(tokenA); expect(shareLink).not.toContain(tokenB); expect(shareLink).not.toContain('room=');
    await a.screenshot({ path: proof('desktop-complete.png'), fullPage: true });
    await a.screenshot({ path: proof('cooperation-complete-1440x900.png'), fullPage: true });
    await a.screenshot({ path: proof('arrange-v3-complete-1440x900.png'), fullPage: true });
    await expect(a.getByTestId('stamp-wave')).toBeDisabled();
    const sharedId = new URL(shareLink).searchParams.get('work')!;
    const sharedRecord = await (await c.request.get(`/api/works/${sharedId}`)).json();
    expect(sharedRecord.id).toBe(capturedWorkId);
    expect(sharedRecord.stamps).toEqual({ A:'wave', B:'crescent' });
    expect(sharedRecord.arrangement.tracks.A.notes).toEqual(finalTrackA);
    expect(sharedRecord.arrangement.tracks.B.notes.map((symbol:string|null)=>symbol||'rest')).toEqual(finalTrackB);
    expect(sharedRecord.arrangement.tempo).toBe('gentle');
    expect(sharedRecord.notes).toEqual(finalTrackA);
    expect(sharedRecord.notes).not.toEqual(['leaf','star','moon','star']);
    expect(sharedRecord.milestones.map((event: {type:string}) => event.type)).toEqual(['first_point','first_install','tools_swapped','started']);
    expect(sharedRecord).not.toHaveProperty('feedback');
    await c.goto(shareLink); await expect(c.getByRole('heading', { name: '晚风 · 星光' })).toBeVisible();
    await expect(c.getByTestId('ready')).toHaveCount(0); await expect(c.getByTestId('share-consent')).toHaveCount(0);
    await ready3D(c);expect(Object.keys(await modelJson<Record<string,string>>(c,'installed-gears'))).toHaveLength(3);
    expect(await modelJson<string[]>(c,'notes')).toEqual(finalTrackA);
    await expect(c.getByTestId('repair-recap').locator('[data-milestone]')).toHaveCount(4);
    await expect(production(c)).toHaveAttribute('data-title','晚风 · 星光');
    expect(await modelJson(c,'stamps')).toEqual({A:'wave',B:'crescent'});
    await c.getByRole('button',{name:'点击开启声音',exact:true}).click();
    await c.evaluate(()=>{(window as unknown as {__hepaiPlayedTones:number[]}).__hepaiPlayedTones.length=0;});
    await c.getByTestId('replay').click();
    await expect.poll(()=>audibleFirstPair(c)).toEqual(finalFirstPair);
    await c.screenshot({ path: proof('readonly-work.png'), fullPage: true });
    await c.screenshot({ path: proof('arrange-v3-readonly-1440x900.png'), fullPage: true });
    await c.getByRole('button', { name: /沿用这份风格，和朋友修一只/ }).click();
    await expect(c.getByTestId('room-code')).toBeVisible(); expect(await c.getByTestId('room-code').innerText()).not.toBe(code);
    await ready3D(c);await expect(production(c)).toHaveAttribute('data-finish','cherry');
    await expect(a.locator('.work-title')).toHaveText('晚风 · 星光');
    expect(errors).toEqual([]);
  } finally { await contextA.close(); await contextB.close(); await contextC.close(); }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
test(`${viewport.width}×${viewport.height} 减少动态效果与静音下，单人演示用点选/键盘完成且明确隔离`, async ({ browser }) => {
  const dimensions = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await create(page, true); await expect(page.locator('.demo-toolbar')).toContainText('单人演示');
    await page.getByTestId('ready').tap(); await page.getByTestId('demo-switch').tap(); await page.getByTestId('ready').tap();
    await expect(page.getByRole('button', { name: '点击开启声音', exact: true })).toBeVisible();
    await noOverflow(page);
    await assertMechanism(page);
    expect((await camera(page))[0]).toBeCloseTo(0,4);
    if(viewport.width===360){
      await page.setViewportSize({width:360,height:640});await initialGearTools(page);
      await page.screenshot({path:proof('short-mobile-tools-360x640.png'),fullPage:true});
      await page.setViewportSize(viewport);
    }
    await page.screenshot({ path: proof(`mobile-gears-${dimensions}.png`), fullPage: true });
    await page.screenshot({path:proof(`arrange-v3-gears-${dimensions}.png`),fullPage:true});
    await page.getByTestId('gear-gear-4').tap();
    await page.getByRole('button', { name: /把选中零件递给伙伴看/ }).tap();
    await page.getByTestId('demo-switch').tap();
    await expect(page.getByTestId('preview-gear-name')).toContainText('三道刻痕');
    await expect(page.getByTestId('preview-gear-size')).toContainText('小');
    await expect(page.getByTestId('preview-gear-notches')).toContainText('3');
    await expect(production(page)).toHaveAttribute('data-preview-gear','');
    // The incoming part reveals itself within the tray without scrolling the whole page.
    await expect.poll(() => page.evaluate(() => {
      const tray = document.querySelector('.tool-panel')!.getBoundingClientRect();
      const box = document.querySelector('.production-object')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('[data-testid="gear-preview"] .preview-reply-buttons button')];
      return window.scrollY === 0 && box.top >= 0 && box.bottom <= tray.top && buttons.length === 2 && buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.top >= tray.top && rect.bottom <= tray.bottom;
      });
    })).toBe(true);
    await page.waitForTimeout(320);
    const previewLayout = await page.evaluate(() => {
      const tray = document.querySelector('.tool-panel')!.getBoundingClientRect();
      const box = document.querySelector('.production-object')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('[data-testid="gear-preview"] .preview-reply-buttons button')].map(button => {
        const rect = button.getBoundingClientRect();
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
      });
      return { trayTop: Math.round(tray.top), trayBottom: Math.round(tray.bottom), boxTop: Math.round(box.top), boxBottom: Math.round(box.bottom), scrollY: window.scrollY, buttons };
    });
    console.log(`${dimensions} incoming preview layout: ${JSON.stringify(previewLayout)}`);
    await page.screenshot({ path: proof(`refinement-preview-guide-${dimensions}.png`), fullPage: true });
    await noOverflow(page);
    await page.locator('.blueprint-list button').first().tap();
    await page.getByTestId('confirm-placement').tap();
    await page.getByTestId('demo-switch').tap();
    await expect(page.getByTestId('placement-receipt')).toContainText('三角槽');
    await expect(production(page)).toHaveAttribute('data-partner-arrow-target','slot-1');await expect(production(page)).toHaveAttribute('data-partner-arrow-by','A');
    await page.screenshot({ path: proof(`cooperation-point-${dimensions}.png`), fullPage: true });
    await page.getByTestId('demo-switch').tap();
    await page.getByTestId('gear-preview').getByRole('button', { name: '换一块', exact: true }).tap();
    await page.getByTestId('demo-switch').tap();
    await expect(page.getByTestId('preview-feedback')).toContainText('换一块');
    await expect(page.getByTestId('placement-receipt')).toHaveCount(0);
    for (let i = 1; i <= 3; i++) {
      await page.getByTestId(`gear-gear-${i}`).focus(); await page.keyboard.press('Enter');
      await page.getByTestId(`slot-slot-${i}`).focus(); await page.keyboard.press('Enter');
      if (i < 3) await expect(page.locator('.bench-count')).toContainText(`${i} / 3`);
    }
    await page.getByTestId('swap-ready').tap(); await page.getByTestId('demo-switch').tap(); await page.getByTestId('swap-ready').tap();
    await expect(page.locator('main.stage-melody')).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(null)))));
    await expect(production(page)).toHaveAttribute('data-camera-moving','false',{timeout:150});
    await expect(object(page)).toHaveAttribute('data-camera-moving','false',{timeout:150});
    expect((await camera(page))[0]).toBeCloseTo(0,4);
    await page.getByTestId('demo-switch').tap(); await page.getByTestId('melody-calm').tap();
    await page.getByTestId('demo-switch').tap(); await page.getByTestId('timbre-soft').tap();
    for (const [index, symbol] of ['moon','leaf','star','leaf'].entries()) {
      await page.getByTestId(`note-${symbol}`).tap(); await page.getByTestId(`note-slot-${index}`).tap();
    }
    await expect.poll(()=>modelJson(page,'notes')).toEqual(['moon','leaf','star','leaf']);
    await noOverflow(page); await page.screenshot({ path: proof(`mobile-melody-${dimensions}.png`), fullPage: true });
    await assertMechanism(page);
    await page.getByTestId('check-melody').tap();
    await expect(page.getByTestId('arrangement-board')).toBeVisible();
    await noOverflow(page);
    await visibleOnPage(page,'arrangement-listen-current');
    await visibleOnPage(page,'arrangement-approve');
    await page.getByTestId('track-preset-gentle').tap();
    await expect(page.getByTestId('track-preset-gentle')).toHaveAttribute('aria-pressed','true');
    await changeStepTo(page,'A',0,'moon');
    const finalMobileNotes=await trackSymbols(page,'A');
    await page.screenshot({path:proof(`arrange-v3-composing-A-${dimensions}.png`),fullPage:true});
    await page.getByTestId('demo-switch').tap();
    await page.getByTestId('track-preset-pulse').tap();
    await expect(page.getByTestId('track-preset-pulse')).toHaveAttribute('aria-pressed','true');
    await changeStepTo(page,'B',1,'rest');
    await page.getByTestId('arrangement-listen-current').tap();
    await expect(page.getByTestId('arrangement-board')).toHaveAttribute('data-audition-version','current');
    await expect.poll(()=>page.locator('[data-track][data-playing-step]:not([data-playing-step="-1"])').count()).toBeGreaterThan(0);
    await page.getByTestId('arrangement-listen-previous').tap();
    await expect(page.getByTestId('arrangement-board')).toHaveAttribute('data-audition-version','previous');
    await expect.poll(()=>page.locator('[data-track][data-playing-step]:not([data-playing-step="-1"])').count()).toBeGreaterThan(0);
    await page.screenshot({path:proof(`arrange-v3-composing-B-${dimensions}.png`),fullPage:true});
    await page.getByTestId('arrangement-approve').tap();
    await expect(page.getByTestId('arrangement-approve')).toHaveAttribute('aria-pressed','true');
    await page.getByTestId('demo-switch').tap();
    await page.getByTestId('arrangement-approve').tap();
    await expect(page.getByTestId('winding-progress')).toHaveAttribute('data-state','idle');
    await expect(object(page)).toHaveAttribute('data-view','winding');
    await page.getByTestId('demo-switch').tap();
    await visibleInsideTray(page,'launch-ready',44);
    await expect(page.getByTestId('launch-ready')).toBeEnabled();
    await page.getByTestId('launch-ready').tap();
    await expect(page.getByTestId('launch-ready-state')).toBeVisible();
    await page.getByTestId('demo-switch').tap();
    // These checks run before any launch click or scroll, so automatic locator scrolling cannot hide clipping.
    await visibleInsideTray(page,'wind-step',44);
    await visibleInsideTray(page,'winding-progress');
    await expect(page.getByTestId('winding-progress')).toBeVisible();
    await ready3D(page);const handle=await productionPoint(page,'crank-handle'),points=await crankPath(page);
    const cancelAngle=await production(page).getAttribute('data-crank-angle');
    let closest=0;for(let index=1;index<points.length;index++)if(Math.hypot(points[index].x-handle.x,points[index].y-handle.y)<Math.hypot(points[closest].x-handle.x,points[closest].y-handle.y))closest=index;
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[handle]});
    await expect(production(page)).toHaveAttribute('data-crank-dragging','true');
    for(let step=1;step<=2;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[points[(closest+step)%16]]});
    await expect(production(page)).not.toHaveAttribute('data-crank-angle',cancelAngle||'');
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await expect(production(page)).toHaveAttribute('data-crank-dragging','false');await session.detach();
    await expect(production(page)).toHaveAttribute('data-crank-hint','');
    await expect(page.getByTestId('winding-progress')).toHaveAttribute('data-state','idle');
    expect(Number(await page.getByTestId('winding-progress').getAttribute('data-winding-at'))).toBe(0);
    await page.screenshot({ path: proof(`cooperation-winding-${dimensions}.png`), fullPage: true });
    await expect(page.getByTestId('wind-step')).toBeEnabled();
    if(viewport.width===360){await page.getByTestId('wind-step').focus();await page.keyboard.press('Enter');}
    else await page.getByTestId('wind-step').tap();
    await completeContinuousWinding(page,dimensions);
    await expect(page.getByTestId('save-card')).toBeVisible({ timeout: 14000 });
    await expect(page.getByTestId('completion-summary')).toContainText('单人演示');
    await expect(page.getByTestId('share-consent')).toHaveCount(0); await noOverflow(page);
    await ready3D(page);await expect(object(page)).toHaveAttribute('data-view','box');
    await completeFront(page);await visibleOnPage(page,'save-card');await visibleOnPage(page,'replay');
    expect(Object.keys(await modelJson<Record<string,string>>(page,'installed-gears'))).toHaveLength(3);
    expect(await modelJson<string[]>(page,'notes')).toEqual(finalMobileNotes);
    await page.getByTestId('stamp-wave').tap();
    await expect(page.getByTestId('stamp-wave')).toHaveAttribute('aria-pressed','true');
    await page.getByTestId('demo-switch').tap();
    await page.getByTestId('stamp-crescent').tap();
    await expect(page.getByTestId('stamp-crescent')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('repair-recap').locator('[data-milestone]')).toHaveCount(4);
    await page.screenshot({ path: proof(`cooperation-complete-${dimensions}.png`), fullPage: true });
    await page.screenshot({path:proof(`arrange-v3-complete-${dimensions}.png`),fullPage:true});
    await page.screenshot({ path: proof(`mobile-complete-${dimensions}.png`), fullPage: true });
    await page.getByRole('button', { name: /今天就到这里/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '今天就到这里' }).click();
    await expect(page.getByRole('heading', { name: '今天就到这里。' })).toBeVisible();
  } finally { await context.close(); }
});
}

test('完成留词刷新与身份切换不误清，已结束工位恢复失败可本地回门口', async ({ browser }) => {
  test.setTimeout(65000);
  const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const page=await context.newPage();const leaves:string[]=[];
  page.on('websocket',socket=>socket.on('framesent',frame=>{if(typeof frame.payload==='string'&&frame.payload.includes('"type":"leave"'))leaves.push(frame.payload);}));
  try {
    await create(page,true);await page.getByTestId('ready').click();await page.getByTestId('demo-switch').click();await page.getByTestId('ready').click();
    await ready3D(page);await waitCamera(page);await initialGearTools(page);
    await page.screenshot({path:proof('short-desktop-tools-1280x720.png'),fullPage:true});
    for(let index=1;index<=3;index++){await page.getByTestId(`gear-gear-${index}`).click();await page.getByTestId(`slot-slot-${index}`).click();}
    await page.getByTestId('swap-ready').click();await page.getByTestId('demo-switch').click();await page.getByTestId('swap-ready').click();
    await page.getByTestId('demo-switch').click();await page.getByTestId('melody-calm').click();await page.getByTestId('demo-switch').click();
    await page.getByTestId('timbre-soft').click();
    for(const [index,symbol] of ['moon','leaf','star','leaf'].entries())await note(page,symbol,index);
    await page.getByTestId('check-melody').click();await page.getByTestId('arrangement-approve').click();await page.getByTestId('demo-switch').click();await page.getByTestId('arrangement-approve').click();
    await page.getByTestId('launch-ready').click();await page.getByTestId('demo-switch').click();await page.getByTestId('wind-step').click();
    await expect(page.getByTestId('save-card')).toBeVisible({timeout:14000});
    const word=page.getByLabel('各留一个词，合成它的名字');
    await word.fill('晚风');await page.getByRole('button',{name:'留下',exact:true}).click();await expect(page.locator('.work-title')).toContainText('晚风');
    await page.getByTestId('demo-switch').click();await word.fill('星光');await page.getByRole('button',{name:'留下',exact:true}).click();await expect(page.locator('.work-title')).toHaveText('晚风 · 星光');
    await page.getByTestId('demo-switch').click();await page.reload();await expect(page.getByTestId('save-card')).toBeVisible();
    await expect.soft(word).toHaveValue('晚风',{timeout:2000});
    await page.getByTestId('demo-switch').click();await expect.soft(word).toHaveValue('星光',{timeout:2000});
    await page.getByTestId('demo-switch').click();await expect.soft(word).toHaveValue('晚风',{timeout:2000});
    await expect(page.getByRole('button',{name:'已留下',exact:true})).toBeDisabled();
    await word.fill('');await expect(page.getByRole('button',{name:'留下',exact:true})).toBeDisabled();
    await expect(page.locator('.work-title')).toHaveText('晚风 · 星光');
    await page.getByTestId('work-word-clear').click();await expect(word).toHaveValue('');
    await expect(page.locator('.word-picker')).toContainText('你的词：未填写 · 伙伴的词：星光');
    await word.fill('晚风');await page.getByRole('button',{name:'留下',exact:true}).click();await expect(page.locator('.work-title')).toHaveText('晚风 · 星光');
    await word.fill('未提交草稿');await page.getByTestId('demo-switch').click();await expect(word).toHaveValue('星光');
    await page.getByTestId('demo-switch').click();await expect(word).toHaveValue('晚风');
    await page.screenshot({path:proof('name-refresh-identity.png'),fullPage:true});
    const staleSession=await page.evaluate(()=>sessionStorage.getItem('hepai-session-v1'));
    await page.getByRole('button',{name:'离开工位',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'今天就到这里',exact:true}).click();
    await expect(page.getByRole('heading',{name:'今天就到这里。'})).toBeVisible();
    expect(leaves).toHaveLength(1);
    await page.evaluate(value=>sessionStorage.setItem('hepai-session-v1',value!),staleSession);await page.reload();
    await expect(page.getByTestId('session-unavailable')).toBeVisible({timeout:2500});
    const sentBefore=leaves.length;
    await page.getByTestId('session-unavailable-home').click();await expect(page.getByRole('button',{name:'开一间工位',exact:true})).toBeVisible();
    expect(leaves).toHaveLength(sentBefore);
    expect(await page.evaluate(()=>sessionStorage.getItem('hepai-session-v1'))).toBeNull();
    await page.getByRole('button',{name:'开一间工位',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();
  } finally {await context.close();}
});

test('缺少历史记录和共同改编的旧作品不补造内容', async ({ page }) => {
  await page.route('**/api/works/legacy-ui-test', route => route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
      id:'legacy-ui-test',shareId:'legacy-ui-test',title:'历史留存作品',melody:'calm',
      notes:['moon','leaf','star','leaf'],timbre:'soft',finish:'walnut',
      completedAt:'2026-11-09T08:00:00.000Z',demo:false
    })
  }));
  await page.goto('/?work=legacy-ui-test');
  await expect(page.getByRole('heading',{name:'历史留存作品',exact:true})).toBeVisible();
  await expect(page.locator('[data-milestone]')).toHaveCount(0);
  await expect(page.getByTestId('arrangement-board')).toHaveCount(0);
  await ready3D(page);expect(Object.keys(await modelJson<Record<string,string>>(page,'installed-gears'))).toHaveLength(3);
  expect(await modelJson<string[]>(page,'notes')).toEqual(['moon','leaf','star','leaf']);
  await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(/^(?:webgl2?|experimental-webgl)$/.test(type))return null;return get.apply(this,[type,...args] as Parameters<typeof get>);} as typeof get;
  });
  await page.reload();await expect(page.getByTestId('production-fallback')).toContainText('二维');
  await expect(object(page)).toHaveAttribute('data-render-mode','2d');await expect(page.locator('.shared-box .installed-gear')).toHaveCount(3);
});

test('首页与加入失败在360×800、390×844无横向溢出；localhost不展示手机可扫二维码', async ({ page }) => {
  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size); await page.goto('/');
    await expect(page.getByRole('button', { name: /开一间工位/ })).toBeEnabled();
    await verifyEntry(page);
    await noOverflow(page);
    await page.screenshot({ path: proof(`mobile-home-${size.width}x${size.height}.png`), fullPage: true });
    await page.screenshot({ path: proof(`intake-home-${size.width}x${size.height}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: /加入工位/, exact: false }).click();
  await page.getByRole('textbox', { name: '输入工位码' }).fill('XXXXXX');
  await page.getByRole('button', { name: /加入这间工位/ }).click();
  await expect(page.locator('.toast')).toContainText(/不存在|没有|无效/);
  await page.getByRole('button', { name: '关闭加入窗口' }).click();
  await page.getByRole('button', { name: /开一间工位/ }).click();
  await expect(page.locator('.local-warning')).toContainText('本机地址');
  await expect(page.getByRole('img', { name: '加入工位的二维码' })).toHaveCount(0);
  await noOverflow(page);
});

test('同机经实际局域网HTTP地址能发命令和生成邀请二维码；开发服务器拒绝私有文件', async ({ browser, request }) => {
  for (const privatePath of ['/server/puzzle.ts', '/server/puzzle.ts?raw', '/data/state.json']) {
    const response = await request.get(privatePath);
    expect([403, 404], `${privatePath}不得通过开发静态服务读取`).toContain(response.status());
  }
  const config = await (await request.get('/api/config')).json();
  const address = config.lanAddresses.find((ip: string) => /^10\./.test(ip)) || config.lanAddresses.find((ip: string) => /^192\.168\./.test(ip)) || config.lanAddresses.find((ip: string) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip));
  test.skip(!address, '当前电脑没有可识别的私有IPv4，不能把localhost冒充局域网验证');
  const origin = `http://${address}:5173`;
  test.info().annotations.push({ type: '同机局域网HTTP地址', description: origin });
  const response = await request.get(origin); expect(response.status()).toBe(200);
  const context = await browser.newContext();
  const invitation = await context.newPage(), demo = await context.newPage();
  try {
    await invitation.goto(origin);
    expect(await invitation.evaluate(() => window.isSecureContext)).toBe(false);
    await invitation.getByRole('button', { name: /开一间工位/ }).click();
    await expect(invitation.getByTestId('room-code')).toBeVisible();
    await expect(invitation.getByRole('img', { name: '加入工位的二维码' })).toBeVisible();
    await expect(invitation.getByRole('textbox', { name: '邀请链接' })).toHaveValue(new RegExp(`^${origin.replaceAll('.', '\\.')}/\\?room=`));
    await invitation.screenshot({ path: proof('lan-http-invitation.png'), fullPage: true });
    await demo.goto(origin);
    await demo.getByRole('button', { name: /先一个人试试/ }).click();
    await demo.getByTestId('ready').click(); await demo.getByTestId('demo-switch').click(); await demo.getByTestId('ready').click();
    await demo.getByTestId('gear-gear-1').click(); await demo.getByTestId('slot-slot-1').click();
    await expect(demo.locator('.bench-count')).toContainText('1 / 3');
    await demo.screenshot({ path: proof('lan-http-demo-command.png'), fullPage: true });
  } finally { await context.close(); }
});
