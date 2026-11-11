import { useEffect, useMemo } from 'react';
import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry,
  ExtrudeGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial,
  Path, Quaternion, Shape, SRGBColorSpace, TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BeveledBox, roundShape } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';

type Constellation = 0 | 1 | 2;
type Point = readonly [number, number];
export interface StarInstrumentDetailsProps { materials: LabMaterials; constellation?: Constellation }

/** Local decorative asterisms, not a claim to reproduce measured astronomy. */
export const INSTRUMENT_CONSTELLATIONS: readonly { points: readonly Point[]; links: readonly (readonly [number,number])[] }[] = [
  {points:[[-1.0,3.60],[-.59,3.87],[-.36,4.23],[.02,3.88],[.38,4.29]],links:[[0,1],[1,2],[2,3],[3,1],[2,4]]},
  {points:[[-1.02,4.04],[-.65,3.72],[-.28,4.11],[.08,3.78],[.45,4.20]],links:[[0,1],[1,2],[2,3],[3,4]]},
  {points:[[-1.08,3.83],[-.66,4.20],[-.34,3.69],[.04,4.12],[.48,3.86]],links:[[0,1],[1,2],[2,3],[3,4],[0,2]]},
];

function extrusion(shape: Shape, depth=.025) {
  return new ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,bevelSize:.004,bevelThickness:.003,curveSegments:12,steps:1});
}
function merged(parts: BufferGeometry[]) {
  if(!parts.length)return new BufferGeometry();
  const prepared=parts.map(part=>part.index?part.toNonIndexed():part);
  const result=mergeGeometries(prepared,false)!;
  for(const part of new Set([...parts,...prepared]))part.dispose();
  return result;
}
function placed(geometry:BufferGeometry,position:[number,number,number],rotationY=0,scale=1){
  return geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rotationY),new Vector3(scale,scale,scale)));
}
function rod(from:Vector3,to:Vector3,radius=.007){
  const delta=to.clone().sub(from),geometry=new CylinderGeometry(radius,radius,delta.length(),6);
  const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize());
  return geometry.applyMatrix4(new Matrix4().compose(from.clone().add(to).multiplyScalar(.5),rotation,new Vector3(1,1,1)));
}
function starShape(radius=.055,points=4,inner=.23){
  const shape=new Shape();for(let i=0;i<points*2;i++){
    const angle=Math.PI/2+i*Math.PI/points,r=i%2?radius*inner:radius;
    const x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);
  }shape.closePath();return shape;
}
function cloudShape(width:number,height:number){
  const s=new Shape(),w=width/2;s.moveTo(-w,0);s.lineTo(w,0);s.lineTo(w,height*.20);
  s.bezierCurveTo(w*.99,height*.56,w*.71,height*.59,w*.60,height*.46);
  s.bezierCurveTo(w*.49,height*1.04,w*.09,height*1.04,-w*.03,height*.64);
  s.bezierCurveTo(-w*.24,height*.86,-w*.57,height*.77,-w*.62,height*.41);
  s.bezierCurveTo(-w*.80,height*.59,-w*1.03,height*.44,-w,height*.17);s.closePath();return s;
}
function firHalf(left:boolean){
  const side=left?-1:1,s=new Shape();s.moveTo(0,0);s.lineTo(side*.045,0);s.lineTo(side*.045,.11);
  for(const[x,y]of [[.28,.11],[.15,.31],[.23,.31],[.095,.52],[.17,.52],[0,.85]])s.lineTo(side*x,y);
  s.closePath();return s;
}
function windowShape(width:number,height:number){
  const s=new Shape(),r=width/2;s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,height-r);
  s.absarc(0,height-r,r,0,Math.PI,false);s.closePath();return s;
}

function useDetailsGeometry(){
  const geometry=useMemo(()=>{
    // Two real paper contours, each merged into one draw call. The right front
    // stays open for the separate observation slider at x .45..2.65, z 1.28.
    const front:BufferGeometry[]=[],back:BufferGeometry[]=[];
    [-1.12,-.77,-.43,-.08,.20].forEach((angle,i)=>{
      const radius=1.75,x=Math.sin(angle)*radius,z=-.25+Math.cos(angle)*radius;
      front.push(placed(extrusion(cloudShape(.80,.22+(i%2)*.07),.035),[x,1.065,z],angle));
    });
    [-1.18,-.84,-.50,-.18,.13].forEach((angle,i)=>{
      const radius=1.57;back.push(placed(extrusion(cloudShape(.69,.31+(i%2)*.06),.03),[Math.sin(angle)*radius,1.085,-.25+Math.cos(angle)*radius],angle));
    });
    // A short cloud bank beside the far right rim never enters the lens rail.
    front.push(placed(extrusion(cloudShape(.70,.24),.035),[1.63,1.06,.12],1.38));
    const treesLight:BufferGeometry[]=[],treesShade:BufferGeometry[]=[];
    for(const[x,z,scale,turn]of [[-1.58,-.72,.72,-.06],[-1.35,-.95,.82,.1],[1.48,-.66,.75,-.1],[1.70,-.42,.62,.08]]){
      treesLight.push(placed(extrusion(firHalf(false),.028),[x,1.035,z],turn+.11,scale));
      treesShade.push(placed(extrusion(firHalf(true),.028),[x,1.035,z],turn-.11,scale));
    }
    const tickParts:BufferGeometry[]=[];
    for(let i=0;i<=60;i++){
      const angle=i*Math.PI/60,inner=i%5===0?1.69:1.755,outer=1.80;
      tickParts.push(rod(new Vector3(Math.cos(angle)*inner,2.75+Math.sin(angle)*inner,-.815),new Vector3(Math.cos(angle)*outer,2.75+Math.sin(angle)*outer,-.815),i%5===0?.006:.0038));
    }
    const arcPoints=Array.from({length:65},(_,i)=>new Vector3(Math.cos(i*Math.PI/64)*1.80,2.75+Math.sin(i*Math.PI/64)*1.80,-.82));
    tickParts.push(new TubeGeometry(new CatmullRomCurve3(arcPoints),64,.004,5,false));
    const skyParts:BufferGeometry[]=[];let seed=0x57a91e;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
    for(let i=0;i<80&&skyParts.length<33;i++){
      const x=(random()-.5)*3.48,y=2.05+random()*2.37;
      if((y>2.75&&x*x+(y-2.75)**2>1.68**2)||(y>3.5&&x> -1.19&&x<.65)||(x>.93&&y>3.4))continue;
      const size=i%7===0?.041:.011+random()*.008;
      skyParts.push(placed(extrusion(starShape(size),.010),[x,y,-.80]));
    }
    const moon=new Shape();moon.absarc(0,0,.28,Math.PI*.28,Math.PI*1.72,false);moon.bezierCurveTo(-.10,-.18,-.10,.18,.28*Math.cos(Math.PI*.28),.28*Math.sin(Math.PI*.28));moon.closePath();
    const north=extrusion(starShape(.205,8,.25),.035);
    const border=roundShape(3.38,.50,.055);border.holes.push(new Path(roundShape(3.34,.46,.045).getPoints(12)));
    const rivets:BufferGeometry[]=[];
    for(const x of[-1.57,1.57])for(const y of[-.17,.17]){
      const r=new CylinderGeometry(.020,.020,.018,12);r.rotateX(Math.PI/2);r.translate(x,y,.075);rivets.push(r);
    }
    // Observatory ribs and six arched windows are real shallow relief meshes.
    const ribs:BufferGeometry[]=[];
    for(let i=0;i<12;i++){
      const phi=i*Math.PI/6,points=Array.from({length:15},(_,n)=>{const t=n*Math.PI/28;return new Vector3(.346*Math.sin(t)*Math.cos(phi),.346*Math.cos(t),.346*Math.sin(t)*Math.sin(phi));});
      ribs.push(new TubeGeometry(new CatmullRomCurve3(points),16,.007,5,false));
    }
    const frames:BufferGeometry[]=[],windows:BufferGeometry[]=[];
    for(let i=0;i<7;i++){
      const angle=i*Math.PI*2/7,frame=windowShape(.102,.187);frame.holes.push(new Path(windowShape(.071,.154).getPoints(12).map(p=>p.add(new Vector2(0,.013)))));
      frames.push(placed(extrusion(frame,.012),[Math.sin(angle)*.324,.074,Math.cos(angle)*.324],angle));
      windows.push(placed(extrusion(windowShape(.073,.157),.008),[Math.sin(angle)*.326,.087,Math.cos(angle)*.326],angle));
    }
    return{cloudFront:merged(front),cloudBack:merged(back),treesLight:merged(treesLight),treesShade:merged(treesShade),ticks:merged(tickParts),sky:merged(skyParts),moon:extrusion(moon,.025),north,border:extrusion(border,.004),rivets:merged(rivets),ribs:merged(ribs),windowFrames:merged(frames),windows:merged(windows)};
  },[]);
  useEffect(()=>()=>Object.values(geometry).forEach(part=>part.dispose()),[geometry]);
  return geometry;
}

function useConstellationGeometry(constellation:Constellation){
  const geometry=useMemo(()=>{
    const pattern=INSTRUMENT_CONSTELLATIONS[constellation],parts:BufferGeometry[]=[];
    pattern.links.forEach(([a,b])=>{const p=pattern.points[a],q=pattern.points[b];parts.push(rod(new Vector3(p[0],p[1],-.784),new Vector3(q[0],q[1],-.784),.006));});
    pattern.points.forEach(([x,y],i)=>parts.push(placed(extrusion(starShape(i===0?.076:.049,5,.40),.018),[x,y,-.77])));
    return merged(parts);
  },[constellation]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);return geometry;
}

function useInscription(){
  const resources=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');
    if(c){c.clearRect(0,0,1024,256);c.textAlign='center';c.fillStyle='#2c392c';c.font='600 104px "Noto Serif SC", "Microsoft YaHei", serif';c.fillText('合 拍 星 仪',512,129);c.font='27px Georgia,serif';c.fillText('COLLABORATIVE STAR INSTRUMENT',512,198);}
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    return{texture,lettering:new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),paperFold:new MeshStandardMaterial({color:'#d5ceb5',roughness:.97,metalness:0,envMapIntensity:.4}),windowGlow:new MeshStandardMaterial({color:'#f3ce88',emissive:'#e8a047',emissiveIntensity:.65,roughness:.72,metalness:.05})};
  },[]);
  useEffect(()=>()=>{resources.texture.dispose();resources.lettering.dispose();resources.windowGlow.dispose();resources.paperFold.dispose();},[resources]);return resources;
}

/** Decorative reference layer for the local Star Instrument concept. No room,
    progress, consent, audio or saved-work state is read or mutated here. */
export default function StarInstrumentDetails({materials,constellation=0}:StarInstrumentDetailsProps){
  const g=useDetailsGeometry(),chart=useConstellationGeometry(constellation),own=useInscription();
  return <group name="star-instrument-details">
    <mesh name="cream-paper-clouds" geometry={g.cloudFront} material={materials.paper} castShadow/>
    <mesh name="rear-paper-clouds" geometry={g.cloudBack} material={own.paperFold} castShadow/>
    <mesh name="folded-paper-trees-light" geometry={g.treesLight} material={materials.paper} castShadow/>
    <mesh name="folded-paper-trees-shade" geometry={g.treesShade} material={own.paperFold} castShadow/>
    {/* Inward clearance keeps the full dome outside the rotating track sweep
        and separates its cylindrical walls from the rear paper cloud bank. */}
    <group name="miniature-observatory" position={[-1.0,1.04,.10]}>
      <mesh position={[0,.035,0]} material={materials.brassDark}><cylinderGeometry args={[.372,.372,.07,32]}/></mesh>
      <mesh position={[0,.205,0]} material={materials.paper} castShadow><cylinderGeometry args={[.322,.322,.34,32]}/></mesh>
      <mesh geometry={g.windowFrames} material={materials.brass}/><mesh geometry={g.windows} material={own.windowGlow}/>
      <mesh position={[0,.36,0]} material={materials.brass}><cylinderGeometry args={[.355,.355,.048,32]}/></mesh>
      <group position={[0,.39,0]} rotation={[0,-Math.PI/3,0]}>
        <mesh material={materials.brassDark}><sphereGeometry args={[.333,28,14,0,Math.PI*2,0,Math.PI/2]}/></mesh>
        <mesh material={materials.paper} castShadow><sphereGeometry args={[.34,32,16,.17,Math.PI*2-.34,0,Math.PI/2]}/></mesh>
        <mesh geometry={g.ribs} material={materials.brass}/>
      </group>
    </group>
    {/* The rear board and these reliefs move together behind the complete
        glass shell; their real separation does not rely on render order. */}
    <group name="rear-star-screen-decoration" position={[0,0,-1.51]}>
    <mesh name="backdrop-degree-ticks" geometry={g.ticks} material={materials.brassDark}/>
    <mesh name="backdrop-small-stars" geometry={g.sky} material={materials.brass}/>
    <mesh name={`backdrop-constellation-${constellation}`} geometry={chart} material={materials.brass}/>
    <mesh name="paper-crescent" geometry={g.moon} position={[1.20,3.78,-.79]} rotation={[0,0,.17]} material={materials.paper}/>
    <group name="north-star-finial" position={[0,4.89,-.95]}>
      <mesh geometry={g.north} material={materials.brass} castShadow/>
      <mesh position={[0,-.12,0]} material={materials.brassDark}><cylinderGeometry args={[.19,.21,.04,24]}/></mesh>
    </group>
    </group>
    <group name="star-instrument-nameplate" position={[0,.43,2.515]}>
      <BeveledBox size={[3.49,.61,.074]} radius={.06} material={materials.brassDark}/>
      <BeveledBox size={[3.40,.52,.014]} position={[0,0,.045]} radius={.046} material={materials.brass}/>
      <mesh geometry={g.border} position={[0,0,.055]} material={materials.brassDark}/>
      <mesh position={[0,0,.066]} material={own.lettering}><planeGeometry args={[2.88,.49]}/></mesh>
      <mesh geometry={g.rivets} material={materials.brassDark}/>
    </group>
  </group>;
}
