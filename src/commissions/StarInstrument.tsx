import { useEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { CanvasTexture, CatmullRomCurve3, DoubleSide, ExtrudeGeometry, Group, LatheGeometry, MathUtils, MeshPhysicalMaterial, MeshStandardMaterial, Path, Plane, Shape, SRGBColorSpace, TubeGeometry, Vector2, Vector3 } from 'three';
import { BeveledBox, useGeometry } from '../lab3d/Geometry';
import { useLabMaterials, type LabMaterials } from '../lab3d/materials';
import StarInstrumentDetails, { INSTRUMENT_CONSTELLATIONS } from './StarInstrumentDetails';

export interface StarInstrumentProps {
  orbitAngle:number;
  constellation:0|1|2;
  aim:number;
  onOrbitChange:(angle:number)=>void;
  onConstellationChange:(index:0|1|2)=>void;
  onAimChange:(fraction:number)=>void;
  onManipulating?:(active:boolean)=>void;
}

// Keep the complete wheel housing and rotating grip inside the top timber,
// with a separate gap in front of the glass dome. All shaft parts share it.
const WHEEL=new Vector3(-2.4,1.82,1.62);
const AIM_MIN=.55,AIM_MAX=2.55;
type CaptureTarget={hasPointerCapture:(id:number)=>boolean;releasePointerCapture:(id:number)=>void;setPointerCapture:(id:number)=>void};
type Part='wheel'|'aim'|'card';
interface Gesture {id:number;kind:Part;last:number;value:number;grab:number;x:number;y:number;moved:boolean;target:CaptureTarget}

function arch(width:number,bottom:number,shoulder:number){
  const radius=width/2,shape=new Shape();shape.moveTo(-radius,bottom);shape.lineTo(radius,bottom);shape.lineTo(radius,shoulder);
  shape.absarc(0,shoulder,radius,0,Math.PI,false);shape.lineTo(-radius,bottom);shape.closePath();return shape;
}
function curve(points:Vector3[],radius:number){return new TubeGeometry(new CatmullRomCurve3(points),Math.max(24,points.length*2),radius,8,false);}
function warmSphereTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#f0dba4';ctx.fillRect(0,0,256,128);
  for(let i=0;i<38;i++){
    const x=(i*73.17)%256,y=10+(i*31.27)%108,r=2+(i%5)*1.6;
    ctx.strokeStyle=i%2?'#bc9c6659':'#fff0cb66';ctx.lineWidth=.6;
    ctx.beginPath();ctx.ellipse(x,y,r,r*.73,Math.sin(i),.3,Math.PI*1.8);ctx.stroke();
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}

/** A local mechanical commission study. Values are controlled by the preview
 * page; it deliberately has no room, task, consent, or saved-work semantics. */
export default function StarInstrument(props:StarInstrumentProps){
  const {gl,invalidate}=useThree();
  const materials=useLabMaterials('walnut');
  const live=useRef(props);live.current=props;
  const gesture=useRef<Gesture|null>(null),press=useRef<{kind:Part;card:number}|null>(null),suppressClick=useRef(false);
  const aimHandle=useRef<Group>(null);
  const wheelPlane=useRef(new Plane(new Vector3(0,0,1),-(WHEEL.z+.33)));
  const aimPlane=useRef(new Plane(new Vector3(0,0,1),-1.36)),hit=useRef(new Vector3());
  const back=useGeometry(()=>new ExtrudeGeometry(arch(4,1.02,2.75),{depth:.095,bevelEnabled:true,bevelSegments:3,bevelSize:.025,bevelThickness:.018,curveSegments:64}),[]);
  const housing=useGeometry(()=>new ExtrudeGeometry(arch(1.84,.81,1.77),{depth:.19,bevelEnabled:true,bevelSegments:3,bevelSize:.045,bevelThickness:.025,curveSegments:48}),[]);
  const card=useGeometry(()=>new ExtrudeGeometry(arch(1.23,-.69,.13),{depth:.055,bevelEnabled:true,bevelSegments:2,bevelSize:.018,bevelThickness:.01,curveSegments:48}),[]);
  const wheelRim=useGeometry(()=>{
    const shape=new Shape();shape.absarc(0,0,.79,0,Math.PI*2,false);
    const hole=new Path();hole.absarc(0,0,.59,0,Math.PI*2,true);shape.holes.push(hole);
    return new ExtrudeGeometry(shape,{depth:.19,bevelEnabled:true,bevelSegments:3,bevelSize:.018,bevelThickness:.018,curveSegments:64});
  },[]);
  const archRim=useGeometry(()=>curve([
    new Vector3(-2,1.03,0),new Vector3(-2,2.70,0),
    ...Array.from({length:41},(_,i)=>{const a=Math.PI-i/40*Math.PI;return new Vector3(Math.cos(a)*2,2.75+Math.sin(a)*2,0);}),
    new Vector3(2,1.03,0),
  ],.035),[]);
  const glass=useGeometry(()=>{
    const profile=new CatmullRomCurve3([
      new Vector3(1.96,1.02,0),new Vector3(1.98,1.09,0),new Vector3(2.0,2.58,0),new Vector3(1.95,3.08,0),
      new Vector3(1.68,3.64,0),new Vector3(1.34,4.13,0),new Vector3(.82,4.49,0),new Vector3(.05,4.67,0),
    ]);
    return new LatheGeometry(profile.getPoints(72).map(p=>new Vector2(Math.max(.01,p.x),p.y)),96,0,Math.PI*2);
  },[]);
  const cardRim=useGeometry(()=>curve([
    new Vector3(-.60,-.67,0),new Vector3(.60,-.67,0),new Vector3(.60,.13,0),
    ...Array.from({length:31},(_,index)=>{const angle=index/30*Math.PI;return new Vector3(Math.cos(angle)*.60,.13+Math.sin(angle)*.60,0);}),
    new Vector3(-.60,-.67,0),
  ],.008),[]);
  const extra=useMemo(()=>{
    const texture=warmSphereTexture();
    const orbit=materials.brass.clone();orbit.roughness=.36;orbit.metalness=.82;
    const planet=orbit.clone();planet.color.set('#bd9656');planet.roughness=.39;
    const backdrop=materials.velvet.clone();backdrop.color.set('#173d30');backdrop.roughness=.91;
    const chart=materials.velvet.clone();chart.color.set('#243d2e');chart.roughness=.82;
    const sun=new MeshStandardMaterial({color:'#f5dfab',map:texture,emissive:'#e7bd6c',emissiveIntensity:.38,roughness:.81,metalness:0});
    const glassMaterial=new MeshPhysicalMaterial({color:'#bdd0b9',transparent:true,opacity:.032,roughness:.15,metalness:0,clearcoat:.65,clearcoatRoughness:.20,side:DoubleSide,depthWrite:false,envMapIntensity:.7});
    const lens=glassMaterial.clone();lens.opacity=.25;lens.color.set('#b5c7b1');
    return{orbit,planet,backdrop,chart,sun,glassMaterial,lens,texture};
  },[materials]);
  useEffect(()=>()=>{for(const item of[extra.orbit,extra.planet,extra.backdrop,extra.chart,extra.sun,extra.glassMaterial,extra.lens])item.dispose();extra.texture?.dispose();},[extra]);
  useEffect(()=>{invalidate();},[props.orbitAngle,props.constellation,props.aim,invalidate]);

  const stop=(event:ThreeEvent<PointerEvent|MouseEvent>)=>{event.stopPropagation();event.nativeEvent.stopImmediatePropagation();};
  const end=()=>{
    const current=gesture.current;gesture.current=null;
    if(current){try{if(current.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);}catch{/* Browser cancellation may release it first. */}live.current.onManipulating?.(false);}
    gl.domElement.style.cursor='grab';invalidate();
  };
  const cancel=()=>{if(gesture.current){suppressClick.current=true;press.current=null;end();}};
  useEffect(()=>{
    const canvas=gl.domElement;canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);
    return()=>{canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',cancel);end();canvas.style.cursor='';};
  },[gl]);
  const wheelAt=(event:ThreeEvent<PointerEvent>)=>{const point=event.ray.intersectPlane(wheelPlane.current,hit.current);if(!point)return null;const x=point.x-WHEEL.x,y=point.y-WHEEL.y;return Math.hypot(x,y)<.16?null:Math.atan2(y,x);};
  const aimAt=(event:ThreeEvent<PointerEvent>)=>{const point=event.ray.intersectPlane(aimPlane.current,hit.current);return point?(point.x-AIM_MIN)/(AIM_MAX-AIM_MIN):null;};
  const begin=(kind:Part,event:ThreeEvent<PointerEvent>,cardIndex=0)=>{
    if(event.button!==0||gesture.current)return;
    let angle=0,grab=0;
    if(kind==='wheel'){const value=wheelAt(event);if(value===null)return;angle=value;}
    if(kind==='aim'){
      if(aimHandle.current)aimPlane.current.constant=-aimHandle.current.getWorldPosition(new Vector3()).z;
      const value=aimAt(event);if(value===null)return;grab=live.current.aim-value;
    }
    stop(event);suppressClick.current=false;press.current={kind,card:cardIndex};
    const target=event.target as unknown as CaptureTarget;
    gesture.current={id:event.pointerId,kind,last:angle,value:kind==='wheel'?live.current.orbitAngle:live.current.aim,grab,x:event.clientX,y:event.clientY,moved:false,target};
    live.current.onManipulating?.(true);target.setPointerCapture(event.pointerId);gl.domElement.style.cursor='grabbing';invalidate();
  };
  const move=(event:ThreeEvent<PointerEvent>)=>{
    const current=gesture.current;if(!current||current.id!==event.pointerId)return;stop(event);
    if(Math.hypot(event.clientX-current.x,event.clientY-current.y)>4)current.moved=true;
    if(current.kind==='wheel'){
      const angle=wheelAt(event);if(angle===null)return;let delta=angle-current.last;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;current.last=angle;
      if(Math.abs(delta)<.8){current.value+=delta;live.current.onOrbitChange(current.value);if(Math.abs(delta)>.012)current.moved=true;}
    }else if(current.kind==='aim'){
      const value=aimAt(event);if(value!==null){current.value=MathUtils.clamp(value+current.grab,0,1);live.current.onAimChange(current.value);}
    }
    invalidate();
  };
  const release=(event:ThreeEvent<PointerEvent>)=>{const current=gesture.current;if(!current||current.id!==event.pointerId)return;stop(event);if(current.moved){suppressClick.current=true;press.current=null;}end();};
  const wheelClick=(event:ThreeEvent<MouseEvent>)=>{stop(event);if(suppressClick.current||press.current?.kind!=='wheel')return;press.current=null;live.current.onOrbitChange(live.current.orbitAngle+Math.PI/12);};
  const cardClick=(index:0|1|2,event:ThreeEvent<MouseEvent>)=>{stop(event);if(suppressClick.current||press.current?.kind!=='card'||press.current.card!==index)return;press.current=null;live.current.onConstellationChange(index);};
  const cursor=()=>{if(!gesture.current)gl.domElement.style.cursor='grab';};
  return <group name="star-instrument" userData={{orbitAngle:props.orbitAngle,constellation:props.constellation,aim:props.aim}} onPointerMove={move} onPointerUp={release}>
    {/* Solid warm timber, recessed top and separate plinth; no image planes. */}
    <BeveledBox name="star-instrument-base" size={[7.35,.75,5.15]} position={[.075,.47,-.075]} radius={.12} material={materials.wood}/>
    <BeveledBox size={[7.39,.11,5.19]} position={[.075,.15,-.075]} radius={.075} material={materials.woodEdge}/>
    <BeveledBox size={[7.27,.08,5.09]} position={[.075,.85,-.075]} radius={.055} material={materials.wood}/>
    <BeveledBox size={[7.17,.022,4.99]} position={[.075,.902,-.075]} radius={.02} material={materials.brassDark}/>
    <BeveledBox size={[7.07,.035,4.89]} position={[.075,.926,-.075]} radius={.02} material={materials.wood}/>
    {[-3.08,3.23].flatMap(x=>[-2.18,2.03].map(z=><group key={`${x}:${z}`} position={[x,.12,z]}>
      <mesh material={materials.brassDark} castShadow><cylinderGeometry args={[.18,.19,.20,32]}/></mesh>
      <mesh position={[0,-.074,0]} material={materials.brass}><cylinderGeometry args={[.19,.18,.035,32]}/></mesh>
    </group>))}
    <BeveledBox size={[7.10,.018,.018]} position={[.075,.24,2.51]} radius={.006} material={materials.brass}/>
    <BeveledBox size={[.018,.018,4.88]} position={[-3.52,.24,-.075]} radius={.006} material={materials.brassDark}/>
    <BeveledBox size={[.018,.018,4.88]} position={[3.67,.24,-.075]} radius={.006} material={materials.brass}/>

    {/* The arch is a thick real backboard; the cover is a distinct curved shell. */}
    {/* The rear face includes clearance for the tilted Saturn ring and bevel,
        even when the common shaft is turned through a complete revolution. */}
    <mesh name="star-instrument-backboard" geometry={back} position={[0,0,-2.49]} material={extra.backdrop} castShadow receiveShadow/>
    <mesh geometry={archRim} position={[0,0,-2.38]} material={extra.orbit} castShadow/>
    <mesh geometry={archRim} position={[0,0,-2.525]} material={materials.brassDark}/>
    <mesh name="star-instrument-glass" geometry={glass} position={[0,0,-.25]} material={extra.glassMaterial} renderOrder={8}/>
    <mesh position={[0,.99,-.25]} material={materials.brassDark} castShadow><cylinderGeometry args={[1.98,2.0,.15,96]}/></mesh>
    <mesh position={[0,1.074,-.25]} material={extra.orbit} castShadow><cylinderGeometry args={[1.95,1.98,.042,96]}/></mesh>
    <mesh position={[0,1.104,-.25]} material={extra.backdrop} receiveShadow><cylinderGeometry args={[1.90,1.91,.022,96]}/></mesh>
    <mesh position={[0,1.129,-.25]} rotation={[Math.PI/2,0,0]} material={materials.brass}><torusGeometry args={[1.88,.012,8,128]}/></mesh>

    {/* Three differently inclined, physically round tracks with spherical planets. */}
    <group name="star-instrument-orbits" position={[0,2.30,-.25]} rotation={[0,props.orbitAngle,0]}>
      <OrbitRing radius={1.64} tilt={[.30,0,-.15]} planets={[[.25,.185],[3.7,.12]]} materials={materials} ringMaterial={extra.orbit} planetMaterial={extra.planet} saturn/>
      <OrbitRing radius={1.30} tilt={[-.24,0,.18]} planets={[[1.8,.13],[4.6,.105]]} materials={materials} ringMaterial={extra.orbit} planetMaterial={extra.planet}/>
      <OrbitRing radius={.93} tilt={[.18,0,.32]} planets={[[3.7,.11]]} materials={materials} ringMaterial={extra.orbit} planetMaterial={extra.planet}/>
    </group>
    <mesh name="star-instrument-main-shaft" position={[0,1.69,-.25]} material={materials.brassDark} castShadow><cylinderGeometry args={[.061,.075,1.14,32]}/></mesh>
    {[1.17,1.34,2.24].map((y,i)=><mesh key={y} position={[0,y,-.25]} material={extra.orbit} castShadow><cylinderGeometry args={[i===0?.30:.13,i===0?.33:.14,i===0?.08:.075,48]}/></mesh>)}
    <mesh position={[0,2.36,-.25]} material={materials.brassDark} castShadow><cylinderGeometry args={[.20,.11,.12,48]}/></mesh>
    <mesh name="star-instrument-sun" position={[0,2.66,-.25]} material={extra.sun} castShadow><sphereGeometry args={[.32,48,32]}/></mesh>
    <pointLight position={[0,2.67,-.20]} color="#f0c679" intensity={.6} distance={3.7} decay={2}/>

    {/* Front-facing wooden hand wheel: its spokes and handle really rotate. */}
    <group name="star-instrument-wheel-assembly">
    <mesh name="star-instrument-wheel-housing" geometry={housing} position={[WHEEL.x,0,WHEEL.z-.35]} material={materials.woodEdge} castShadow/>
    <mesh name="star-instrument-wheel-axle" position={[WHEEL.x,WHEEL.y,WHEEL.z-.10]} rotation={[Math.PI/2,0,0]} material={materials.brassDark} castShadow><cylinderGeometry args={[.19,.19,.30,40]}/></mesh>
    <group name="star-instrument-wheel" position={WHEEL} rotation={[0,0,props.orbitAngle]} onPointerDown={event=>begin('wheel',event)} onClick={wheelClick} onPointerOver={cursor}>
      <mesh geometry={wheelRim} position={[0,0,-.095]} material={materials.woodEdge} castShadow/>
      <mesh position={[0,0,.118]} material={extra.orbit} castShadow><torusGeometry args={[.715,.055,12,96]}/></mesh>
      <mesh position={[0,0,.127]} material={materials.brassDark}><torusGeometry args={[.62,.012,8,96]}/></mesh>
      {Array.from({length:6},(_,i)=><group key={i} rotation={[0,0,i*Math.PI/3]}><BeveledBox size={[.056,.59,.045]} position={[0,.342,.13]} radius={.018} material={extra.orbit}/></group>)}
      <mesh position={[0,0,.15]} rotation={[Math.PI/2,0,0]} material={materials.brass} castShadow><cylinderGeometry args={[.19,.23,.13,40]}/></mesh>
      <mesh position={[0,0,.223]} material={materials.brassDark}><torusGeometry args={[.135,.011,8,48]}/></mesh>
      <group name="star-instrument-wheel-handle" position={[-.345,-.428,.33]}>
        <mesh rotation={[Math.PI/2,0,0]} material={materials.wood} castShadow><cylinderGeometry args={[.088,.105,.39,32]}/></mesh>
        <mesh position={[0,0,.201]} rotation={[Math.PI/2,0,0]} material={extra.orbit}><cylinderGeometry args={[.092,.092,.035,32]}/></mesh>
        <mesh position={[0,0,-.17]} rotation={[Math.PI/2,0,0]} material={materials.brassDark}><cylinderGeometry args={[.10,.10,.06,24]}/></mesh>
      </group>
    </group>
    </group>

    {/* The cards are thick, staggered objects, with metal constellation inlays. */}
    <group name="star-instrument-card-rack" position={[.20,0,0]}>
    <BeveledBox size={[1.52,.24,1.0]} position={[2.66,1.02,-.10]} radius={.08} material={materials.woodEdge}/>
    <BeveledBox size={[1.45,.09,.16]} position={[2.66,1.15,.41]} radius={.025} material={materials.brassDark}/>
    {[1,2].map(index=><BeveledBox key={index} size={[1.38,.23,.24]} position={[2.66,1.02+index*.23,.31-index*.20]} radius={.025} material={materials.woodEdge}/>)}
    {([0,1,2]as const).map(index=>{
      const selected=index===props.constellation;
      return <group key={index} name={`star-instrument-card-${index}`} position={[2.60+(index-1)*.10,1.62+index*.23,.34-index*.20]} rotation={[0,(index-1)*-.045,(index-1)*-.06]}
        onPointerDown={event=>begin('card',event,index)} onClick={event=>cardClick(index,event)} onPointerOver={cursor}>
        <mesh geometry={card} material={extra.chart} castShadow/>
        <mesh geometry={cardRim} position={[0,0,.078]} material={selected?extra.orbit:materials.brassDark}/>
        <CardConstellation index={index} material={selected?extra.orbit:materials.brassDark}/>
        <mesh position={[0,.05,.076]}><boxGeometry args={[1.22,1.55,.04]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
      </group>;
    })}
    </group>

    {/* A physical dovetail-like rail and a sliding glass observation lens. */}
    <group name="star-instrument-aim-rail" position={[1.55,1.02,2.05]} rotation={[-.27,0,0]}>
      <BeveledBox size={[2.50,.16,.73]} radius={.065} material={materials.woodEdge}/>
      <BeveledBox size={[2.35,.035,.62]} position={[0,.095,0]} radius={.035} material={materials.brass}/>
      <BeveledBox size={[2.06,.022,.10]} position={[0,.119,0]} radius={.022} material={materials.brassDark}/>
      <BeveledBox size={[2.02,.025,.035]} position={[0,.138,0]} radius={.01} material={extra.orbit}/>
      {Array.from({length:25},(_,index)=><BeveledBox key={index} size={[.008,.005,index%4===0?.075:.035]} position={[-1.03+index/24*2.06,.117,.20]} radius={.002} material={materials.brassDark}/>)}
      <group name="star-instrument-aim-slider" position={[-1+MathUtils.clamp(props.aim,0,1)*2,.18,0]} onPointerDown={event=>begin('aim',event)} onPointerOver={cursor}>
        <BeveledBox size={[.27,.06,.28]} radius={.025} material={materials.brassDark}/>
        <BeveledBox size={[.09,.23,.08]} position={[0,.13,.02]} radius={.018} material={materials.brass}/>
        <group ref={aimHandle} name="star-instrument-aim-handle" position={[0,.38,.035]} rotation={[.08,0,0]}>
          <mesh material={materials.brassDark} castShadow><torusGeometry args={[.216,.034,12,64]}/></mesh>
          <mesh position={[0,0,.025]} material={extra.orbit}><torusGeometry args={[.205,.016,10,64]}/></mesh>
          <mesh scale={[1,1,.16]} material={extra.lens} renderOrder={9}><sphereGeometry args={[.192,40,24]}/></mesh>
          <BeveledBox size={[.29,.006,.006]} radius={.002} material={materials.brassDark}/>
          <BeveledBox size={[.006,.29,.006]} radius={.002} material={materials.brassDark}/>
          <mesh><sphereGeometry args={[.24,20,14]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
        </group>
      </group>
    </group>
    <StarInstrumentDetails materials={materials} constellation={props.constellation}/>
  </group>;
}

function OrbitRing({radius,tilt,planets,materials,ringMaterial,planetMaterial,saturn=false}:{radius:number;tilt:[number,number,number];planets:[number,number][];materials:LabMaterials;ringMaterial:MeshStandardMaterial;planetMaterial:MeshStandardMaterial;saturn?:boolean}){
  // The complete circular tubes can rotate through 360° in front of the rear
  // board. Each tube retains a round section; planets are not scaled flat.
  const depth=1;
  const geometry=useGeometry(()=>new TubeGeometry(new CatmullRomCurve3(Array.from({length:64},(_,index)=>{const angle=index/64*Math.PI*2;return new Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius*depth);}),true),160,.018,10,true),[radius]);
  return <group name={`star-instrument-orbit-${radius}`} rotation={tilt}>
    <mesh name={`star-instrument-orbit-tube-${radius}`} geometry={geometry} material={ringMaterial} castShadow/>
    {planets.map(([angle,size],index)=><group name={`star-instrument-planet-mount-${radius}-${index}`} key={angle} position={[Math.cos(angle)*radius,0,Math.sin(angle)*radius*depth]}>
      <mesh name={`star-instrument-planet-${radius}-${index}`} material={planetMaterial} castShadow receiveShadow><sphereGeometry args={[size,36,24]}/></mesh>
      <mesh position={[0,-size*.82,0]} material={materials.brassDark}><cylinderGeometry args={[.032,.026,.08,16]}/></mesh>
      {saturn&&index===0&&<group name="star-instrument-saturn-crown" rotation={[.35,0,-.22]}><mesh rotation={[Math.PI/2,0,0]} material={ringMaterial}><torusGeometry args={[size*1.6,.018,8,64]}/></mesh><mesh rotation={[Math.PI/2,0,0]} material={materials.brassDark}><torusGeometry args={[size*1.48,.005,6,64]}/></mesh></group>}
    </group>)}
  </group>;
}

function CardConstellation({index,material}:{index:0|1|2;material:MeshStandardMaterial}){
  const chart=INSTRUMENT_CONSTELLATIONS[index];
  const points=chart.points.map(([x,y])=>[(x+.30)*.48,(y-3.95)*.65]as const);
  return <group position={[0,.10,.085]}>
    {chart.links.map(([from,to],i)=>{const[x,y]=points[from],end=points[to],dx=end[0]-x,dy=end[1]-y,length=Math.hypot(dx,dy);return <mesh key={i} position={[(x+end[0])/2,(y+end[1])/2,0]} rotation={[0,0,-Math.atan2(dx,dy)]} material={material}><cylinderGeometry args={[.005,.005,length,7]}/></mesh>;})}
    {points.map(([x,y],i)=><mesh key={i} position={[x,y,0]} material={material}><sphereGeometry args={[i===2?.030:.021,12,8]}/></mesh>)}
  </group>;
}
