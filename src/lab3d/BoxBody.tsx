import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace, MeshBasicMaterial, Shape, DoubleSide, ExtrudeGeometry, Path } from 'three';
import { BeveledBox, flatExtrusion, hole, roundShape, useGeometry } from './Geometry';
import { BOX, GEARS, PAD_POSITION } from './config';
import type { LabMaterials } from './materials';
import type { Stamp } from '../../shared/types';

export interface BoxSocket {id:string;radius:number;x:number;z:number}

function inlayFrame(width:number,height:number,stroke=.016){
  const shape=roundShape(width,height,.055);
  shape.holes.push(new Path(roundShape(width-stroke*2,height-stroke*2,.04).getPoints(16)));
  return new ExtrudeGeometry(shape,{depth:.004,bevelEnabled:false,curveSegments:12});
}

const stampPaths:Record<Stamp,string[]>={
  sprout:['M0 13V-2M0 3C-13 2-15-9-13-13C-4-13 2-8 0 3ZM0-1C1-11 8-15 15-13C16-4 10 2 0-1Z','M-9-8L0 3L10-8'],
  crescent:['M7-15A17 17 0 1 0 15 10A15 15 0 0 1 7-15Z'],
  spark:['M0-17L5-5L17 0L5 5L0 17L-5 5L-17 0L-5-5Z','M13-13L16-16M-13 13L-16 16'],
  wave:['M-17-8Q-8-16 0-8T17-8M-17 1Q-8-7 0 1T17 1M-17 10Q-8 2 0 10T17 10'],
};

function SlotMark({index,x,materials,wellZ}:{index:number;x:number;materials:LabMaterials;wellZ?:number}){
  const geometry=useGeometry(()=>{
    let shape:Shape;
    if(index===0){shape=new Shape();shape.moveTo(0,.10);shape.lineTo(-.095,-.075);shape.lineTo(.095,-.075);shape.closePath();}
    else if(index===1){shape=new Shape();shape.absarc(0,0,.083,0,Math.PI*2,false);}
    else shape=roundShape(.15,.15,.01);
    return flatExtrusion(shape,.008,.001);
  },[index]);
  const onSeat=wellZ!==undefined;
  return <group name={onSeat?`slot-top-mark-${index}`:undefined} position={onSeat?[x,1.151,wellZ+.43]:[x,1.365,1.997]} rotation={onSeat?[0,0,0]:[Math.PI/2,0,0]}>
    <BeveledBox size={onSeat?[.40,.012,.31]:[.38,.028,.24]} radius={.022} material={materials.brass}/>
    <mesh geometry={geometry} position={[0,onSeat?.009:.017,0]} scale={onSeat?[1.45,1,1.45]:1} material={materials.brassDark} castShadow/>
  </group>;
}

function NamePlate({ materials,title,stamps,production }: { materials: LabMaterials;title?:string;stamps?:Record<'A'|'B',Stamp>;production?:boolean }) {
  const border=useGeometry(()=>inlayFrame(2.72,.558,.012),[]);
  const lettering = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=256;
    const context=canvas.getContext('2d');
    if(context){
      context.clearRect(0,0,1024,256);context.fillStyle='#293b2e';context.textAlign='center';context.shadowColor='rgba(255,235,178,.38)';context.shadowOffsetY=1.2;context.font='600 82px "Noto Serif SC", "Microsoft YaHei", serif';context.fillText('合 拍 修 理 铺',512,112);
      context.font=title?'36px "Microsoft YaHei", serif':'25px Georgia, serif';context.fillText(title|| (production?'MADE TOGETHER · NO. 001':'MADE TOGETHER · LOCAL STUDY'),512,187,690);
      const marks=stamps||(production&&title?{A:'sprout' as const,B:'spark' as const}:undefined);
      if(marks){
        (['A','B']as const).forEach((identity,index)=>{
          const x=index===0?91:933;context.save();context.translate(x,124);context.scale(2,2);context.strokeStyle='#334331';context.lineWidth=1.8;context.lineCap='round';context.lineJoin='round';stampPaths[marks[identity]].forEach(path=>context.stroke(new Path2D(path)));context.restore();context.font='20px Georgia, serif';context.fillText(identity,x,202);
        });
      }
    }
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    return {texture,material:new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false})};
  },[title,stamps?.A,stamps?.B,production]);
  useEffect(()=>()=>{lettering.texture.dispose();lettering.material.dispose();},[lettering]);
  return <group position={[0,.91,2.003]}>
    <BeveledBox size={[2.85,.68,.085]} radius={.06} material={materials.brassDark}/>
    <BeveledBox size={[2.75,.59,.012]} position={[0,0,.047]} radius={.045} material={materials.brass}/>
    <mesh geometry={border} position={[0,0,.055]} material={materials.brassDark}/>
    <mesh position={[0,0,.061]} material={lettering.material}><planeGeometry args={[2.51,.58]}/></mesh>
    {[-1.29,1.29].map(x=><group key={x} position={[x,0,.066]}>
      <mesh rotation={[Math.PI/2,0,0]} material={materials.brassDark}><cylinderGeometry args={[.037,.037,.012,16]}/></mesh>
      <mesh position={[0,0,.007]} rotation={[0,0,-.35]} material={materials.woodEdge}><boxGeometry args={[.044,.006,.002]}/></mesh>
    </group>)}
  </group>;
}

export default function BoxBody({ materials,gearLayout=GEARS,showPad=true,title,stamps,production=false,paperWellRadius=.84,deepPaperWell=false }: { materials: LabMaterials;gearLayout?:readonly BoxSocket[];showPad?:boolean;title?:string;stamps?:Record<'A'|'B',Stamp>;production?:boolean;paperWellRadius?:number;deepPaperWell?:boolean }) {
  const frontFrame=useGeometry(()=>inlayFrame(5.95,.94,.013),[]);
  const sideFrame=useGeometry(()=>inlayFrame(3.31,.94,.013),[]);
  const deck=useGeometry(()=>{
    const shape=roundShape(5.94,3.43,.08);
    gearLayout.forEach(gear=>hole(shape,gear.x,-gear.z,gear.radius+.09));
    hole(shape,0,.94,paperWellRadius);
    return flatExtrusion(shape,.12,.012);
  },[gearLayout,paperWellRadius]);
  return <group name="box-body">
    <BeveledBox size={[6.4,.24,3.9]} position={[0,.24,0]} radius={.06} material={materials.woodEdge}/>
    <BeveledBox size={[6.4,1.23,.22]} position={[0,.925,1.84]} material={materials.wood}/>
    <BeveledBox size={[6.4,1.23,.22]} position={[0,.925,-1.84]} material={materials.wood}/>
    {[-3.09,3.09].map(x=><BeveledBox key={x} size={[.22,1.23,3.48]} position={[x,.925,0]} material={materials.wood}/>)}
    {/* Hairline inlays remain on the outer wooden faces. No added trim crosses
        the wells, front note rail, or right-hand crank/ready mechanisms. */}
    <mesh geometry={frontFrame} position={[0,.91,1.951]} material={materials.brassDark}/>
    {[-1,1].map(side=><mesh key={side} geometry={sideFrame} position={[side*3.201,.91,0]} rotation={[0,side*Math.PI/2,0]} material={materials.brassDark}/>)}
    <BeveledBox size={[6.08,.012,.012]} position={[0,.354,1.952]} radius={.003} material={materials.brassDark}/>
    <mesh geometry={deck} position={[0,BOX.deckY,0]} material={materials.steel} castShadow receiveShadow/>
    {[-1.82,1.82].map(z=><BeveledBox key={z} size={[6.28,.045,.065]} position={[0,1.57,z]} radius={.012} material={materials.brass}/>)}
    {[-3.07,3.07].map(x=><BeveledBox key={x} size={[.065,.045,3.57]} position={[x,1.57,0]} radius={.012} material={materials.brass}/>)}
    {[-1.785,1.785].map(z=><BeveledBox key={z} size={[6.04,.009,.010]} position={[0,1.572,z]} radius={.003} material={materials.brassDark}/>)}
    {[-3.033,3.033].map(x=><BeveledBox key={x} size={[.010,.009,3.57]} position={[x,1.572,0]} radius={.003} material={materials.brassDark}/>)}
    {gearLayout.map(gear=><group key={gear.id} position={[gear.x,0,gear.z]}>
      <mesh position={[0,1.09,0]} material={materials.brassDark} castShadow receiveShadow><cylinderGeometry args={[gear.radius+.08,gear.radius+.08,.11,48]}/></mesh>
      <mesh position={[0,1.235,0]} material={materials.brassDark} receiveShadow><cylinderGeometry args={[gear.radius+.074,gear.radius+.074,.26,48,1,true]}/></mesh>
      <mesh position={[0,1.36,0]} rotation={[Math.PI/2,0,0]} material={materials.brass}><torusGeometry args={[gear.radius+.08,.024,8,48]}/></mesh>
      <mesh position={[0,1.29,0]} material={materials.brass} castShadow><cylinderGeometry args={[.066,.066,.35,20]}/></mesh>
    </group>)}
    <mesh position={[0,deepPaperWell?.34:1.09,-.94]} material={materials.velvet}><cylinderGeometry args={[paperWellRadius-.01,paperWellRadius-.01,deepPaperWell?.04:.09,48]}/></mesh>
    {deepPaperWell&&<mesh position={[0,.865,-.94]} receiveShadow><cylinderGeometry args={[paperWellRadius-.008,paperWellRadius-.008,1.0,48,1,true]}/><meshStandardMaterial color="#1a3027" roughness={.96} side={DoubleSide}/></mesh>}
    <mesh position={[0,1.38,-.94]} rotation={[Math.PI/2,0,0]} material={materials.brassDark}><torusGeometry args={[paperWellRadius,.023,8,48]}/></mesh>
    {[-2.72,2.72].flatMap(x=>[-1.48,1.48].map(z=><group key={`${x}-${z}`} position={[x,0,z]}>
      <BeveledBox size={[.46,.21,.42]} position={[0,.12,0]} radius={.05} material={materials.woodEdge}/>
      <BeveledBox size={[.51,.06,.47]} position={[0,.22,0]} radius={.02} material={materials.brassDark}/>
      <BeveledBox size={[.38,.28,.07]} position={[0,.47,z>0?.38:-.38]} radius={.015} material={materials.brass}/>
    </group>))}
    <NamePlate materials={materials} title={title} stamps={stamps} production={production}/>
    {showPad&&<group name="inspection-pad" position={[...PAD_POSITION]}>
      <BeveledBox size={[1.62,.10,1.62]} radius={.06} material={materials.woodEdge}/>
      <BeveledBox size={[1.48,.025,1.48]} position={[0,.064,0]} radius={.05} material={materials.velvet}/>
    </group>}
    <mesh position={[0,1.405,gearLayout[0].z]} rotation={[0,0,Math.PI/2]} material={materials.brassDark}><cylinderGeometry args={[.032,.032,3.1,12]}/></mesh>
    {gearLayout.map((gear,index)=><SlotMark key={gear.id} index={index} x={gear.x} materials={materials}/>)}
    {production&&gearLayout.map((gear,index)=><SlotMark key={`top-${gear.id}`} index={index} x={gear.x} wellZ={gear.z} materials={materials}/>)}
  </group>;
}
