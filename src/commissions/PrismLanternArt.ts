import { CanvasTexture, Shape, SRGBColorSpace } from 'three';

export const lanternColors = [
  { glass: '#ffc46c', halo: '#e69943', glow: '#ffdc91', ink: '#57422e' },
  { glass: '#86e1b1', halo: '#5ab58c', glow: '#c9f4bf', ink: '#294c3e' },
  { glass: '#c4a1f7', halo: '#ad80d3', glow: '#ebcaf8', ink: '#48405d' },
];

export function archedPanel(width: number, height: number, crown: number, base = 0) {
  const radius = width / 2;
  const shoulder = base + height - crown;
  const shape = new Shape();
  shape.moveTo(-radius, base);
  shape.lineTo(radius, base);
  shape.lineTo(radius, shoulder);
  shape.quadraticCurveTo(radius * .93, shoulder + crown * .61, radius * .61, shoulder + crown * .78);
  shape.quadraticCurveTo(radius * .23, base + height, 0, base + height);
  shape.quadraticCurveTo(-radius * .23, base + height, -radius * .61, shoulder + crown * .78);
  shape.quadraticCurveTo(-radius * .93, shoulder + crown * .61, -radius, shoulder);
  shape.closePath();
  return shape;
}

function polygon(ctx: CanvasRenderingContext2D, coordinates: number[]) {
  ctx.beginPath();
  ctx.moveTo(coordinates[0], coordinates[1]);
  for (let i=2; i<coordinates.length; i+=2) ctx.lineTo(coordinates[i], coordinates[i+1]);
  ctx.closePath();
  ctx.fill();
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, spread: number) {
  const w = height * spread;
  polygon(ctx,[x,y-height,x+w*.53,y-height*.55,x+w*.26,y-height*.60,x+w*.86,y-height*.28,
    x+w*.48,y-height*.32,x+w,y-height*.08,x+w*.13,y-height*.11,x+w*.13,y,
    x-w*.13,y,x-w*.13,y-height*.11,x-w,y-height*.08,x-w*.48,y-height*.32,
    x-w*.86,y-height*.28,x-w*.26,y-height*.60,x-w*.53,y-height*.55]);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  polygon(ctx,[x,y-width,x+width*.2,y-width*.2,x+width*.72,y,x+width*.2,y+width*.2,
    x,y+width,x-width*.2,y+width*.2,x-width*.72,y,x-width*.2,y-width*.2]);
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, crescent: boolean) {
  if (!crescent) {
    ctx.beginPath();
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fill();
    return;
  }
  // Two arcs give the mask an actual open crescent rather than painting over a disc.
  ctx.fill(new Path2D(`M${x+radius*.53} ${y-radius*.84} A${radius} ${radius} 0 1 0 ${x+radius*.53} ${y+radius*.84} A${radius*.92} ${radius*.92} 0 0 1 ${x+radius*.53} ${y-radius*.84}Z`));
}

// Sourced in this model as vector outlines. The same curves are reproduced on
// the physical pattern card and in the projection so the relationship reads.
const deerBody='M23 111 Q41 88 76 92 Q97 94 105 84 L112 61 Q109 51 117 48 L127 52 L140 48 L151 53 L147 59 L135 63 L125 78 Q122 96 108 104 L118 127 L114 145 L108 146 L109 128 L97 110 L82 110 L72 129 L54 135 L48 151 L42 151 L46 132 L62 121 L66 107 L49 108 Q34 116 24 115 L17 119 L13 116 Z';
const deerAntlers='M118 53 Q112 35 95 22 M108 36 Q98 39 89 31 M108 35 Q107 23 110 17 M99 27 Q96 18 89 14 M123 52 Q129 32 143 23 M130 36 Q138 39 149 32 M135 29 Q135 22 131 16 M141 25 L149 17';

function deer(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.fill(new Path2D(deerBody));
  ctx.strokeStyle=ctx.fillStyle;
  ctx.lineCap='round';
  ctx.lineWidth=2.4;
  ctx.stroke(new Path2D(deerAntlers));
  ctx.restore();
}

function scenery(ctx: CanvasRenderingContext2D, pattern: number, silhouette: string, far: string, light: string) {
  // All pattern coordinates are in a 600 by 360 space, including the miniature.
  ctx.fillStyle=light;
  moon(ctx,pattern===1?376:417,92,pattern===2?49:37,pattern!==2);
  for (const [x,y,r] of [[118,115,5],[195,55,5],[273,93,7],[513,133,5],[321,47,4],[463,42,3],[149,156,4]]) star(ctx,x,y,r);

  if (pattern===2) {
    ctx.fillStyle=far;
    polygon(ctx,[0,280,84,206,128,234,231,108,292,184,320,160,424,242,463,184,600,277,600,360,0,360]);
    ctx.fillStyle=light;
    polygon(ctx,[198,151,231,108,267,153,247,146,239,161,225,146,212,156]);
    ctx.fillStyle=silhouette;
    polygon(ctx,[0,322,97,294,170,311,260,275,352,302,431,276,600,315,600,360,0,360]);
    for (const [x,h] of [[46,71],[78,52],[110,41],[488,47],[525,60],[563,83]]) tree(ctx,x,330,h,.27);
    return;
  }

  ctx.fillStyle=far;
  polygon(ctx,[0,275,85,241,156,268,230,226,323,265,406,238,486,268,600,230,600,360,0,360]);
  if (pattern===0) {
    for (const [x,h] of [[42,145],[83,102],[127,125],[167,87],[208,116],[259,80],[324,121],[366,94],[451,110],[518,102],[558,152]]) tree(ctx,x,302,h,.23);
  } else {
    for (const [x,h] of [[63,121],[115,88],[449,96],[492,120],[550,143]]) tree(ctx,x,302,h,.22);
  }
  ctx.fillStyle=silhouette;
  polygon(ctx,[0,311,88,299,176,324,270,294,327,301,416,331,505,303,600,317,600,360,0,360]);
  if (pattern===1) deer(ctx,204,96,1.42);
  for (const [x,h] of [[21,169],[81,108],[145,81],[457,79],[515,102],[579,154]]) tree(ctx,x,335,h,.25);
}

export function patternTexture(pattern: number, colorIndex: number, miniature=false) {
  const canvas=document.createElement('canvas');
  canvas.width=miniature?256:768;
  canvas.height=miniature?192:480;
  const ctx=canvas.getContext('2d');
  if (!ctx) return null;
  const palette=lanternColors[colorIndex]??lanternColors[0];
  ctx.scale(canvas.width/600,canvas.height/360);
  if (miniature) {
    ctx.fillStyle='#e9d8ac';
    ctx.fillRect(0,0,600,360);
    scenery(ctx,pattern,'#35483d','#89937a','#946837');
  } else {
    const gradient=ctx.createRadialGradient(272,171,25,295,173,345);
    gradient.addColorStop(0,palette.glow);
    gradient.addColorStop(.45,palette.halo);
    gradient.addColorStop(.83,'#34463a');
    gradient.addColorStop(1,'#182f2b');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,600,360);
    scenery(ctx,pattern,'#152e29',palette.ink,'#fff0c6');
  }
  const texture=new CanvasTexture(canvas);
  texture.colorSpace=SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

export function haloTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=128;
  canvas.height=128;
  const ctx=canvas.getContext('2d');
  if (!ctx) return null;
  const gradient=ctx.createRadialGradient(64,64,2,64,64,62);
  gradient.addColorStop(0,'#ffffff');
  gradient.addColorStop(.22,'#ffffff8a');
  gradient.addColorStop(.57,'#ffffff24');
  gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,128,128);
  return new CanvasTexture(canvas);
}
