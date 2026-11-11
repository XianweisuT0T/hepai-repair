import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from 'three';
import type { ArrangementVersion } from '../../shared/types';
import { getScoreWorldLayout, sampleScoreWorldClock, SCORE_LAMP_DIM, SCORE_LAMP_ON, type Four, type ScoreClock, type ScorePlayback, type ScoreWorldLayout, type ScoreWorldRenderedState } from '../../shared/scoreWorld';
import { useGeometry } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';

const POSITIONS=[[-.54,.30],[-.20,.53],[.20,.53],[.54,.30]]as const;
interface Props{score:ArrangementVersion;playback:ScorePlayback;reduceMotion:boolean;materials:LabMaterials;telemetry?:MutableRefObject<ScoreWorldRenderedState|null>}

export default function ScoreWorld({score,playback,reduceMotion,materials,telemetry}:Props){
  const root=useRef<Group>(null),stars=useRef<(Mesh|null)[]>([]),stems=useRef<(Mesh|null)[]>([]),lamps=useRef<(Mesh|null)[]>([]);
  const live=useRef({score,playback,reduceMotion});live.current={score,playback,reduceMotion};
  const layout=useMemo(()=>getScoreWorldLayout(score),[score]);
  const starGeometry=useGeometry(()=>{const shape=new Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2===0?.055:.022;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();return new ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false});},[]);
  const actorMaterials=useMemo(()=>({stars:POSITIONS.map(()=>materials.paper.clone()),lamps:POSITIONS.map(()=>new MeshStandardMaterial({color:'#caa86b',metalness:.15,roughness:.45,emissive:'#efc06b',emissiveIntensity:SCORE_LAMP_DIM}))}),[materials.paper]);
  useEffect(()=>()=>{actorMaterials.stars.forEach(material=>material.dispose());actorMaterials.lamps.forEach(material=>material.dispose());},[actorMaterials]);

  const apply=(mapped:ScoreWorldLayout,clock:ScoreClock,reduced:boolean)=>{
    POSITIONS.forEach((_,index)=>{
      const star=stars.current[index],stem=stems.current[index];if(!star||!stem)return;
      const current=clock.active&&clock.beat===index;
      const pulse=current&&!reduced&&mapped.lead[index]!==null?clock.pulse:0;
      star.position.y=mapped.starHeights[index]+.014*pulse;star.scale.setScalar(1+.07*pulse);
      stem.position.y=star.position.y*.5-.0175;stem.scale.y=Math.max(.01,star.position.y-.045);
      const starMaterial=actorMaterials.stars[index];starMaterial.color.copy(mapped.lead[index]?materials.paper.color:materials.paperShade.color);
      starMaterial.emissive.set('#b4a66c');starMaterial.emissiveIntensity=current?(reduced?.18:.07+.14*clock.pulse):0;
      const lamp=actorMaterials.lamps[index];lamp.color.set(mapped.lampOn[index]?'#d3b77c':'#59634d');
      lamp.emissiveIntensity=mapped.lampOn[index]?SCORE_LAMP_ON+(current?(reduced?.45:.18+.36*clock.pulse):0):SCORE_LAMP_DIM;
    });
  };
  const snapshot=(mapped:ScoreWorldLayout,clock:ScoreClock):ScoreWorldRenderedState=>{
    const point=new Vector3();
    return{...clock,tempo:mapped.tempo,
      starBaseHeights:[...mapped.starHeights],
      starHeights:stars.current.map(star=>star?.position.y??0)as Four<number>,
      starScales:stars.current.map(star=>star?.scale.y??1)as Four<number>,
      starWorldHeights:stars.current.map(star=>star?star.getWorldPosition(point).y:0)as Four<number>,
      lampIntensities:actorMaterials.lamps.map(material=>material.emissiveIntensity)as Four<number>,
      lampOn:actorMaterials.lamps.map(material=>material.emissiveIntensity>=SCORE_LAMP_ON-.001)as Four<boolean>};
  };
  useLayoutEffect(()=>{
    const clock=sampleScoreWorldClock(layout,playback,Date.now());apply(layout,clock,reduceMotion);
    if(telemetry)telemetry.current=snapshot(layout,clock);
  },[layout,playback.playing,playback.startedAt,playback.beatMs,playback.beats,playback.loops,reduceMotion]);
  useLayoutEffect(()=>{
    const object=root.current;if(!object)return;
    object.userData.captureScoreWorld=(finalScore?:ArrangementVersion)=>{
      const nodes=[...stars.current,...stems.current,...lamps.current].filter((node):node is Mesh=>!!node);
      const saved=nodes.map(node=>({node,position:node.position.clone(),scale:node.scale.clone()}));
      const savedMaterials=[...actorMaterials.stars,...actorMaterials.lamps].map(material=>({material,color:material.color.clone(),emissive:material.emissive.clone(),intensity:material.emissiveIntensity}));
      const mapped=getScoreWorldLayout(finalScore??live.current.score);apply(mapped,sampleScoreWorldClock(mapped,{playing:false},Date.now()),true);
      return()=>{saved.forEach(({node,position,scale})=>{node.position.copy(position);node.scale.copy(scale);});savedMaterials.forEach(({material,color,emissive,intensity})=>{material.color.copy(color);material.emissive.copy(emissive);material.emissiveIntensity=intensity;});};
    };
    return()=>{delete object.userData.captureScoreWorld;if(telemetry)telemetry.current=null;};
  },[actorMaterials,materials]);
  useFrame(state=>{
    const current=live.current,mapped=getScoreWorldLayout(current.score),clock=sampleScoreWorldClock(mapped,current.playback,Date.now());
    apply(mapped,clock,current.reduceMotion);if(telemetry)telemetry.current=snapshot(mapped,clock);
    if(clock.active||clock.pending)state.invalidate();
  },-.5);
  return <group ref={root} name="score-paper-world">
    {POSITIONS.map(([x,z],index)=><group key={index} position={[x,0,z]}>
      <mesh ref={node=>{stars.current[index]=node;}} name={`score-star-${index}`} geometry={starGeometry} position={[0,layout.starHeights[index],0]} rotation={[0,(index-1.5)*.08,0]} material={actorMaterials.stars[index]} castShadow>
        <mesh geometry={starGeometry} position={[0,0,-.006]} scale={1.12} material={materials.brassDark}/>
      </mesh>
      <mesh ref={node=>{stems.current[index]=node;}} position={[0,layout.starHeights[index]*.5-.0175,0]} scale={[1,layout.starHeights[index]-.045,1]} material={materials.brassDark}><cylinderGeometry args={[.003,.003,1,7]}/></mesh>
      <mesh position={[0,.002,0]} material={materials.brassDark}><cylinderGeometry args={[.043,.043,.016,16]}/></mesh>
      <mesh ref={node=>{lamps.current[index]=node;}} name={`score-lamp-${index}`} position={[0,.008,0]} material={actorMaterials.lamps[index]}><sphereGeometry args={[.029,14,8,0,Math.PI*2,0,Math.PI/2]}/></mesh>
    </group>)}
  </group>;
}
