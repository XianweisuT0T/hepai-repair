export type DeskColor={h:number;s:number;v:number};
export const DESK_COLOR_KEY='hepai.desk-color.v2';
export const deskPresets=[
  {id:'night',name:'松绿夜色',hex:'#182b2f'},
  {id:'linen',name:'暖纸白',hex:'#faf9f5'},
  {id:'ink',name:'雾蓝织布',hex:'#a9c4cc'},
  {id:'claret',name:'陶土暖橘',hex:'#cf9579'},
] as const;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=(values:number[])=>'#'+values.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
const mix=(a:string,b:string,t:number)=>hex(rgb(a).map((v,i)=>v+(rgb(b)[i]-v)*t));
function luminance(color:string){const values=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
export function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function readable(candidate:string,bg:string,fallback:string,minimum=4.5){
  for(let i=0;i<=20;i++){const result=mix(candidate,fallback,i/20);if(contrast(result,bg)>=minimum)return result;}
  return fallback;
}
export function colorHex({h,s,v}:DeskColor){
  const hue=((h%360)+360)%360/60,c=v/100*s/100,x=c*(1-Math.abs(hue%2-1)),m=v/100-c;
  const channels=hue<1?[c,x,0]:hue<2?[x,c,0]:hue<3?[0,c,x]:hue<4?[0,x,c]:hue<5?[x,0,c]:[c,0,x];
  return hex(channels.map(n=>(n+m)*255));
}
export function colorFromHex(color:string,previousHue=0):DeskColor{
  const [r,g,b]=rgb(color).map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  const hue=d===0?previousHue:max===r?60*((g-b)/d%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
  return {h:(hue+360)%360,s:max===0?0:d/max*100,v:max*100};
}
/** The selected cloth is exact. Readable ink and neutral workshop controls are derived separately. */
export function deskTokens(bg:string){
  let ink=contrast('#24342c',bg)>contrast('#f6efdf',bg)?'#24342c':'#f6efdf';
  if(contrast(ink,bg)<4.6)ink=contrast('#000000',bg)>contrast('#ffffff',bg)?'#000000':'#ffffff';
  const lightInk=luminance(ink)>.5,primary=lightInk?'#d4ad79':'#40564a',primaryText=lightInk?'#252c24':'#fff8e8';
  const chip=mix(bg,ink,.07),chipInk=contrast('#000000',chip)>contrast('#ffffff',chip)?'#000000':'#ffffff';
  return {
    bg,light:bg,text:ink,muted:readable(mix(bg,ink,.68),bg,ink),
    accent:readable(lightInk?'#d9b985':'#775735',bg,ink),line:readable(mix(bg,ink,.4),bg,ink,3),
    chip,'chip-text':readable(ink,chip,chipInk),
    primary,'primary-text':primaryText,'primary-hover':mix(primary,lightInk?'#ffffff':'#000000',.1),
    focus:ink,selected:primary,'selected-text':primaryText,
  };
}
function valid(value:unknown):value is DeskColor{
  if(!value||typeof value!=='object')return false;
  const c=value as DeskColor;
  return [c.h,c.s,c.v].every(n=>typeof n==='number'&&Number.isFinite(n))&&c.h>=0&&c.h<360&&c.s>=0&&c.s<=100&&c.v>=0&&c.v<=100;
}
export function readDeskColor():DeskColor{
  try{const value:unknown=JSON.parse(localStorage.getItem(DESK_COLOR_KEY)??'null');if(valid(value))return value;}catch{/* Ignore invalid or unavailable saved preferences. */}
  try{
    const old=localStorage.getItem('hepai.desk-palette.v1');
    const index=old==='apricot'?1:old==='lilac'?2:old==='mint'?3:0;
    return colorFromHex(deskPresets[index].hex);
  }catch{return colorFromHex(deskPresets[0].hex);}
}
export function applyDeskColor(color:DeskColor){
  const root=document.documentElement,bg=colorHex(color);
  root.dataset.deskTheme=deskPresets.find(p=>p.hex===bg)?.id??'custom';root.dataset.deskHex=bg;
  Object.entries(deskTokens(bg)).forEach(([key,value])=>root.style.setProperty(`--desk-${key}`,value));
}
export function restoreDeskPalette(){const color=readDeskColor();applyDeskColor(color);return color;}
