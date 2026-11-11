import type { Work } from '../shared/types';
import { captureProductionWork } from './three/capture';
const noteLabels={leaf:'叶',star:'星',moon:'月'};
async function currentSvgBoxImage():Promise<HTMLImageElement|null>{
  const source=document.querySelector<SVGSVGElement>('.musicbox-svg');
  if(!source)return null;
  const svg=source.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width','1000');svg.setAttribute('height','670');
  // Export the physical SVG at its neutral pose, independent of mouse/keyboard hover.
  svg.setAttribute('data-parallax','neutral');
  svg.style.setProperty('--scene-x','0px');svg.style.setProperty('--scene-y','0px');
  svg.style.setProperty('--tilt-x','0deg');svg.style.setProperty('--tilt-y','0deg');
  svg.style.transform='none';
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');
  style.textContent=`text{font-family:'Microsoft YaHei','PingFang SC',sans-serif}.box-brand{font-size:15px;letter-spacing:3px;fill:#344136;font-weight:650}.box-serial{font-family:Georgia,serif;font-size:7px;letter-spacing:1.5px;fill:#586047}.box-work-title{font-size:9px;letter-spacing:.3px;fill:#4f5d3f;font-weight:500}.stamp-identity{font-family:Georgia,serif;font-size:6px;letter-spacing:1px;fill:#6c6945}.engraved-stamp{filter:drop-shadow(0 .5px .25px #5d4f2a22)}.preview-engraving text{font-size:12px;letter-spacing:4px;fill:#aab6a3}.note-drawing{color:#354b3c;--note-vein:#d6c38e}.note-number{fill:#9baf95;font-size:15px}.partner-marker,.note-partner-marker,.install-flash,.slot-hover-ring,.note-hover-ring,.sound-traces{display:none}[data-depth-layer],.gear-lift{transform:none!important}*{animation:none!important;transition:none!important}`;
  svg.prepend(style);
  const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{return await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('音乐盒图片生成失败，请重试。'));img.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
export async function saveCard(work:Work) {
  let boxImage=await captureProductionWork(work);
  const source=boxImage?'3d':'svg-fallback';
  if(!boxImage)boxImage=await currentSvgBoxImage();
  if(!boxImage)throw new Error('作品画面尚未准备好，请等三维或二维备用画面出现后，再保存图片。');
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此浏览器暂时不能生成图片');
  ctx.fillStyle='#1b3033';ctx.fillRect(0,0,1200,1500);
  ctx.strokeStyle='#c9ad76';ctx.lineWidth=2;ctx.strokeRect(46,46,1108,1408);
  ctx.fillStyle='#c9ad76';ctx.font='24px sans-serif';ctx.fillText('HEPAI REPAIR  /  合拍修理铺',90,128);
  ctx.fillStyle='#f1e8d3';ctx.font='58px sans-serif';ctx.fillText(work.title,90,262,1020);
  const scale=Math.min(1050/boxImage.naturalWidth,674/boxImage.naturalHeight);
  const width=boxImage.naturalWidth*scale,height=boxImage.naturalHeight*scale;
  ctx.drawImage(boxImage,600-width/2,310+(674-height)/2,width,height);
  ctx.fillStyle='#aeb9a4';ctx.font='18px sans-serif';ctx.textAlign='center';
  ctx.fillText(source==='3d'?'共同修复 · 留下这一刻':'二维备用图 · 当前作品',600,1012);
  ctx.fillStyle='#eadfc8';ctx.font='32px sans-serif';ctx.textAlign='center';
  if(work.arrangement){
    const {tracks,tempo}=work.arrangement;
    const sequence=(notes:(keyof typeof noteLabels|null)[])=>notes.map(n=>n?noteLabels[n]:'留白').join(' — ');
    ctx.font='26px sans-serif';ctx.fillText(`A 主旋律  ${sequence(tracks.A.notes)}`,600,1045);
    ctx.fillText(`B 伴奏  ${sequence(tracks.B.notes)}`,600,1100);
    ctx.font='22px sans-serif';ctx.fillStyle='#bcb9a8';
    const sounds={bell:'玻璃铃',wood:'木琴',soft:'柔和钢片'};
    ctx.fillText(`${tempo==='slow'?'慢一点':'轻快一点'} · A ${sounds[tracks.A.timbre]} / B ${sounds[tracks.B.timbre]} · ${work.finish==='walnut'?'胡桃木':'樱桃木'}`,600,1160);
  }else{
    ctx.fillText(work.notes.map(n=>noteLabels[n]).join('  —  '),600,1055);
    ctx.font='24px sans-serif';ctx.fillStyle='#bcb9a8';
    ctx.fillText(`${work.melody==='bright'?'轻快':'舒缓'}旋律 · ${ {bell:'玻璃铃',wood:'木琴',soft:'柔和钢片'}[work.timbre]} · ${work.finish==='walnut'?'胡桃木':'樱桃木'}`,600,1120);
  }
  const stampLabels={sprout:'嫩芽',crescent:'弯月',spark:'微星',wave:'水纹'};
  ctx.font='22px sans-serif';ctx.fillStyle='#c9bd99';
  ctx.fillText(`共同刻印  A · ${stampLabels[work.stamps?.A??'sprout']}    B · ${stampLabels[work.stamps?.B??'spark']}`,600,1202);
  ctx.font='28px sans-serif';ctx.fillStyle='#eadfc8';ctx.fillText('不用急着找话题，先一起修好一段旋律。',600,1250);
  ctx.font='20px sans-serif';ctx.fillStyle='#bcb9a8';ctx.fillText(`${work.demo?'单人演示作品 · ':''}${new Date(work.completedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`,600,1360);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败')),'image/png'));
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`合拍修理铺-${work.title}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
