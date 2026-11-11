import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const LAB='/lab/music-box-3d';
const proof=(name:string)=>path.resolve('output/playwright',`polish-3d-lab-${name}.png`);
const threeRequest=(url:string)=>/\/.vite\/deps\/(?:three|@react-three)/i.test(url)||(/\/src\/(?:lab3d|three)\//i.test(url)&&!/\/(?:capture|picking|types)\.tsx?(?:\?|$)/i.test(url));
const lab=(page:Page)=>page.locator('main[data-lab-mode]');
const stage=(page:Page)=>page.getByTestId('lab-canvas');
async function openLab(page:Page) {
  await page.goto(LAB);
  await expect(page.getByText(/本地\s*3D\s*试验.*不代表双人联机/)).toBeVisible();
  await expect(stage(page)).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect(stage(page).locator('canvas')).toHaveCount(1);
  await expect(lab(page)).toHaveAttribute('data-lab-mode','observe');
  await expect(lab(page)).toHaveAttribute('data-lab-installed','false');
}
async function projectedPoint(page:Page,target:string) {
  const canvas=stage(page).locator('canvas');
  const rect=await canvas.boundingBox();expect(rect).not.toBeNull();
  const rawX=await stage(page).getAttribute(`data-${target}-ndc-x`),rawY=await stage(page).getAttribute(`data-${target}-ndc-y`);
  expect(rawX).not.toBeNull();expect(rawY).not.toBeNull();const x=Number(rawX),y=Number(rawY);
  expect(Number.isFinite(x)&&Math.abs(x)<=1).toBe(true);
  expect(Number.isFinite(y)&&Math.abs(y)<=1).toBe(true);
  return {x:rect!.x+(x+1)*rect!.width/2,y:rect!.y+(1-y)*rect!.height/2};
}
async function modelClick(page:Page,target:string) {
  const point=await projectedPoint(page,target);await page.mouse.click(point.x,point.y);
}
async function turnCrankToFull(page:Page) {
  const path=JSON.parse((await stage(page).getAttribute('data-crank-path'))||'[]') as [number,number][];
  expect(path).toHaveLength(17);
  const handle=await projectedPoint(page,'crank-handle');
  const rect=(await stage(page).locator('canvas').boundingBox())!;
  const points=path.slice(0,16).map(([x,y])=>({x:rect.x+(x+1)*rect.width/2,y:rect.y+(1-y)*rect.height/2}));
  let closest=0;for(let index=1;index<points.length;index++)if(Math.hypot(points[index].x-handle.x,points[index].y-handle.y)<Math.hypot(points[closest].x-handle.x,points[closest].y-handle.y))closest=index;
  const before=await winding(page);
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();
  await expect(stage(page)).toHaveAttribute('data-crank-dragging','true');
  for(let step=1;step<=16&&(await winding(page))<1;step++){const point=points[(closest+step)%16];await page.mouse.move(point.x,point.y,{steps:4});await page.waitForTimeout(25);}
  await page.mouse.up();await expect(stage(page)).toHaveAttribute('data-crank-dragging','false');
  await expect.poll(()=>winding(page)).toBe(1);expect(1-before).toBeGreaterThan(.4);
}
async function camera(page:Page) {
  return Promise.all(['x','y','z'].map(async axis=>Number(await stage(page).getAttribute(`data-camera-${axis}`))));
}
async function orbit(page:Page,direction:number,installed=false) {
  const rect=await stage(page).locator('canvas').boundingBox();expect(rect).not.toBeNull();
  const previous=await camera(page);
  const x=rect!.x+rect!.width*.5,y=rect!.y+rect!.height*.45;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+rect!.width*.55*direction,y+5,{steps:16});await page.mouse.up();
  await expect.poll(()=>camera(page)).not.toEqual(previous);
  await expect(lab(page)).toHaveAttribute('data-lab-installed',String(installed));
}
async function winding(page:Page) { return Number(await lab(page).getAttribute('data-lab-winding')); }
async function windWithButtons(page:Page) {
  for(let turns=0;turns<4&&(await winding(page))<1;turns++) {
    const before=await winding(page);await page.getByTestId('lab-wind-step').click();
    await expect.poll(()=>winding(page)).toBeGreaterThan(before);
  }
  await expect.poll(()=>winding(page)).toBe(1);
}
async function installWithHtml(page:Page,keyboard=false) {
  await page.getByTestId('lab-mode-assemble').click();
  if((await lab(page).getAttribute('data-lab-lid-open'))==='false')await page.getByTestId('lab-lid').click();
  await expect(lab(page)).toHaveAttribute('data-lab-lid-moving','false');
  await page.getByTestId('lab-select-gear').click();
  await expect(lab(page)).toHaveAttribute('data-lab-selected','true');
  if(keyboard){await page.getByTestId('lab-install-gear').focus();await page.keyboard.press('Enter');}
  else await page.getByTestId('lab-install-gear').click();
  await expect(lab(page)).toHaveAttribute('data-lab-installed','true');
  await expect(lab(page)).toHaveAttribute('data-lab-installing','false');
}
async function installAudioProbe(page:Page) {
  await page.addInitScript(()=>{
    const probe={started:0,active:0};
    Object.defineProperty(window,'__labAudioProbe',{value:probe,configurable:true});
    const create=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){
      const oscillator=create.call(this),start=oscillator.start.bind(oscillator);let began=false;
      oscillator.start=(when?:number)=>{if(!began){began=true;probe.started++;probe.active++;}start(when);};
      oscillator.addEventListener('ended',()=>{if(began)probe.active--;},{once:true});
      return oscillator;
    };
  });
}
async function audioProbe(page:Page) {
  return page.evaluate(()=>(window as unknown as {__labAudioProbe:{started:number;active:number}}).__labAudioProbe);
}

test('独立3D试验：真实相机与raycast装配、有限演出和重置；关闭3D时懒加载与单Canvas隔离',async({page,context})=>{
  test.setTimeout(120000);
  await installAudioProbe(page);
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/?render=2d');await expect(page.getByRole('button',{name:/开一间工位/})).toBeVisible();
  await expect(page.locator('.production-object')).toHaveAttribute('data-render-mode','2d');
  expect(requests.filter(threeRequest)).toEqual([]);
  await page.getByTestId('production-retry-3d').click();await expect(page.getByTestId('production-canvas')).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(requests.some(threeRequest)).toBe(true);
  await page.getByRole('link',{name:/3D试验/}).click();
  await expect(page).toHaveURL(new RegExp(`${LAB}$`));
  await expect(stage(page)).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect(page.getByTestId('production-canvas')).toHaveCount(0);await expect(page.locator('canvas')).toHaveCount(1);
  const renderer=await stage(page).locator('canvas').evaluate(canvas=>{
    const gl=(canvas as HTMLCanvasElement).getContext('webgl2')||(canvas as HTMLCanvasElement).getContext('webgl');
    if(!gl)return 'unavailable';const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  });console.log(`3D lab actual renderer: ${renderer}`);
  await expect(lab(page)).toHaveAttribute('data-lab-mode','observe');
  await expect(lab(page)).toHaveAttribute('data-lab-installed','false');
  await expect(page.getByTestId('lab-play')).toBeDisabled();
  expect((await audioProbe(page)).started).toBe(0);
  await expect(stage(page)).toHaveAttribute('data-camera-x',/^-?\d/);
  await expect(stage(page)).toHaveAttribute('data-lid-angle',/^-?\d/);
  const initialCamera=await camera(page);expect(initialCamera.every(Number.isFinite)).toBe(true);
  const initialLidAngle=Number(await stage(page).getAttribute('data-lid-angle'));
  await page.screenshot({path:proof('default-1440x900'),fullPage:true});
  await orbit(page,1);await page.screenshot({path:proof('side-left-1440x900'),fullPage:true});
  await orbit(page,-1);await page.screenshot({path:proof('side-right-1440x900'),fullPage:true});
  await page.getByTestId('lab-reset-view').click();
  await expect.poll(async()=>{const current=await camera(page);return current.every((value,index)=>Math.abs(value-initialCamera[index])<.15);}).toBe(true);
  const beforeZoom=await camera(page);const canvasBounds=await stage(page).locator('canvas').boundingBox();
  await page.mouse.move(canvasBounds!.x+canvasBounds!.width*.5,canvasBounds!.y+canvasBounds!.height*.5);await page.mouse.wheel(0,-300);
  await expect.poll(()=>camera(page)).not.toEqual(beforeZoom);
  await page.screenshot({path:proof('close-1440x900'),fullPage:true});
  await page.getByTestId('lab-mode-assemble').click();
  await page.getByTestId('lab-select-gear').click();await expect(lab(page)).toHaveAttribute('data-lab-selected','true');
  await page.getByTestId('lab-cancel-selection').click();await expect(lab(page)).toHaveAttribute('data-lab-selected','false');
  await page.getByTestId('lab-select-gear').click();await page.getByTestId('lab-lid').click();
  await expect(lab(page)).toHaveAttribute('data-lab-lid-open','false');
  await expect(lab(page)).toHaveAttribute('data-lab-lid-moving','false');
  await expect(lab(page)).toHaveAttribute('data-lab-selected','false');
  await modelClick(page,'slot');await expect(lab(page)).toHaveAttribute('data-lab-installed','false');
  await page.screenshot({path:proof('closed-1440x900'),fullPage:true});
  await page.getByTestId('lab-lid').click();await expect(lab(page)).toHaveAttribute('data-lab-lid-open','true');
  await expect(lab(page)).toHaveAttribute('data-lab-lid-moving','false');
  await modelClick(page,'gear');await expect(lab(page)).toHaveAttribute('data-lab-selected','true');
  await modelClick(page,'slot');await expect(lab(page)).toHaveAttribute('data-lab-installed','true');
  await expect(lab(page)).toHaveAttribute('data-lab-installing','false');
  await page.screenshot({path:proof('installed-1440x900'),fullPage:true});
  const cancelHandle=await projectedPoint(page,'crank-handle');
  const touch=await context.newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancelHandle]});
  await expect(stage(page)).toHaveAttribute('data-crank-dragging','true');
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await expect(stage(page)).toHaveAttribute('data-crank-dragging','false');
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  expect(await winding(page)).toBe(0);
  await page.getByTestId('lab-mode-observe').click();await orbit(page,1,true);
  await page.getByTestId('lab-mode-assemble').click();
  const oldHandle=await stage(page).getAttribute('data-crank-handle-ndc-y');
  await page.getByTestId('lab-wind-step').click();await expect.poll(()=>winding(page)).toBe(.25);
  await expect(stage(page)).not.toHaveAttribute('data-crank-handle-ndc-y',oldHandle||'');
  const handle=await projectedPoint(page,'crank-handle');
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();
  await expect(stage(page)).toHaveAttribute('data-crank-dragging','true');
  await page.waitForTimeout(180);expect(await winding(page)).toBe(.25);
  for(let turn=0;turn<10;turn++){await page.mouse.move(handle.x+9,handle.y+3);await page.mouse.move(handle.x-9,handle.y-3);}
  await page.mouse.up();expect(await winding(page)).toBeLessThan(.6);
  await turnCrankToFull(page);
  await page.getByTestId('lab-mode-observe').click();await expect(lab(page)).toHaveAttribute('data-lab-installed','true');expect(await winding(page)).toBe(1);
  await page.getByTestId('lab-sound').click();
  const beforePlay=(await audioProbe(page)).started;await page.getByTestId('lab-play').click();
  await expect(lab(page)).toHaveAttribute('data-lab-playing','true');
  await expect.poll(async()=>(await audioProbe(page)).started).toBeGreaterThan(beforePlay);
  await expect(lab(page)).toHaveAttribute('data-lab-playing','false',{timeout:12000});
  await expect.poll(async()=>(await audioProbe(page)).active).toBe(0);
  for(let replay=0;replay<2;replay++){
    await page.getByTestId('lab-play').click();await expect.poll(async()=>(await audioProbe(page)).active).toBeGreaterThan(0);
    await page.getByTestId('lab-stop').click();await expect(lab(page)).toHaveAttribute('data-lab-playing','false');
    await expect.poll(async()=>(await audioProbe(page)).active).toBe(0);
  }
  await page.getByTestId('lab-play').click();await expect.poll(async()=>(await audioProbe(page)).active).toBeGreaterThan(0);
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await expect(lab(page)).toHaveAttribute('data-lab-playing','false');await expect.poll(async()=>(await audioProbe(page)).active).toBe(0);
  await page.bringToFront();await other.close();
  await page.getByTestId('lab-play').click();await page.getByTestId('lab-reset').click();
  await expect(lab(page)).toHaveAttribute('data-lab-installed','false');await expect.poll(()=>winding(page)).toBe(0);
  await expect.poll(async()=>(await audioProbe(page)).active).toBe(0);
  await page.getByTestId('lab-mode-assemble').click();await page.getByTestId('lab-select-gear').click();await page.getByTestId('lab-install-gear').click();
  await expect(lab(page)).toHaveAttribute('data-lab-installing','true');
  await expect(page.getByTestId('lab-mode-observe')).toBeDisabled();await expect(page.getByTestId('lab-mode-assemble')).toBeDisabled();
  await page.getByTestId('lab-reset').click();
  // The cancelled 700ms installation must not revive the previous experiment.
  await page.waitForTimeout(850);await expect(lab(page)).toHaveAttribute('data-lab-installed','false');
  await page.getByTestId('lab-lid').click();await expect(lab(page)).toHaveAttribute('data-lab-lid-moving','true');
  await expect.poll(async()=>Math.abs(Number(await stage(page).getAttribute('data-lid-angle'))-initialLidAngle)).toBeGreaterThan(.45);
  await page.getByTestId('lab-reset').click();
  await expect(lab(page)).toHaveAttribute('data-lab-lid-open','true');await expect(lab(page)).toHaveAttribute('data-lab-lid-moving','false');
  await expect(stage(page)).toHaveAttribute('data-webgl','ready');
  await expect.poll(async()=>Math.abs(Number(await stage(page).getAttribute('data-lid-angle'))-initialLidAngle),{intervals:[20,30,50],timeout:350}).toBeLessThan(.03);
  const lost=await stage(page).locator('canvas').evaluate(canvas=>{
    const context=(canvas as HTMLCanvasElement).getContext('webgl2')||(canvas as HTMLCanvasElement).getContext('webgl');
    const extension=context?.getExtension('WEBGL_lose_context');if(!extension)return false;
    extension.loseContext();return true;
  });
  if(lost){await expect(page.getByTestId('lab-webgl-error')).toBeVisible();await page.screenshot({path:proof('context-lost-1440x900'),fullPage:true});}
  else{test.info().annotations.push({type:'未验证',description:'浏览器没有WEBGL_lose_context扩展，未执行实际上下文丢失。'});console.log('WebGL context lost未验证：扩展不可用。');}
  await page.getByRole('link',{name:/返回原版/}).first().click();await expect(page.getByRole('button',{name:/开一间工位/})).toBeVisible();
});

test('390×844触屏、减少动态效果与静音下，HTML与Enter可完成独立3D试验',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();await installAudioProbe(page);
  try{
    await openLab(page);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:proof('default-390x844'),fullPage:true});
    await installWithHtml(page,true);await windWithButtons(page);
    await page.getByTestId('lab-play').tap();await expect(lab(page)).toHaveAttribute('data-lab-playing','true');
    expect((await audioProbe(page)).started).toBe(0);
    await page.screenshot({path:proof('playing-390x844'),fullPage:true});
    await page.getByTestId('lab-lid').tap();await expect(lab(page)).toHaveAttribute('data-lab-playing','false');
    await expect(lab(page)).toHaveAttribute('data-lab-lid-open','false');
    await page.getByTestId('lab-reset').tap();await expect(lab(page)).toHaveAttribute('data-lab-installed','false');
    await expect.poll(()=>winding(page)).toBe(0);
    expect(await page.evaluate(()=>sessionStorage.getItem('hepai-session-v1'))).toBeNull();
  }finally{await context.close();}
});

test('WebGL不可用时明确说明并返回原版，不把回退当成3D成功',async({page})=>{
  await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){
      if(/^(?:webgl2?|experimental-webgl)$/.test(type))return null;
      return get.apply(this,[type,...args] as Parameters<typeof get>);
    } as typeof get;
  });
  await page.goto(LAB);await expect(page.getByTestId('lab-webgl-error')).toBeVisible();
  await expect(page.getByTestId('lab-webgl-error')).toContainText('WebGL');
  await expect(page.getByRole('link',{name:/返回原版/}).first()).toBeVisible();
  await page.screenshot({path:proof('webgl-unavailable-1440x900'),fullPage:true});
  await page.getByRole('link',{name:/返回原版/}).first().click();await expect(page.getByRole('button',{name:/开一间工位/})).toBeVisible();
});
