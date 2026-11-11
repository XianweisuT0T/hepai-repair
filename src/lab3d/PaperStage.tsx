import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, ExtrudeGeometry, Group, MathUtils, Mesh, Shape, TubeGeometry, Vector3 } from 'three';
import { useGeometry } from './Geometry';
import type { LabMaterials } from './materials';
import type { Lab3DState } from './types';
import type { ArrangementVersion } from '../../shared/types';
import { getScoreWorldLayout, sampleScoreWorldClock, type ScorePlayback, type ScoreWorldRenderedState } from '../../shared/scoreWorld';
import ScoreWorld from '../three/ScoreWorld';

function paperGeometry(points:readonly (readonly [number,number])[]){const shape=new Shape();points.forEach(([x,y],index)=>index?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return new ExtrudeGeometry(shape,{depth:.016,bevelEnabled:false});}
function star(){return Array.from({length:10},(_,i)=>{const a=i*Math.PI/5+Math.PI/2,r=i%2===0?.108:.044;return[Math.cos(a)*r,Math.sin(a)*r]as const;});}
const frontLeft=[[0,1.18],[-.10,.95],[-.055,.95],[-.235,.69],[-.12,.69],[-.35,.43],[-.20,.43],[-.465,.065],[0,-.004]]as const;
const backLeft=[[0,-.004],[-.06,.98],[-.17,.46],[-.45,.62],[-.31,.28],[-.58,.14],[-.21,.10]]as const;
const backRight=[[0,-.004],[.17,.97],[.23,.49],[.50,.66],[.34,.29],[.59,.16],[.23,.11]]as const;
export default function PaperStage({state,materials,openness,openHeight=1.46,stageZ=-1.0,showStem=false,score,playback,scoreTelemetry}:{state:Lab3DState;materials:LabMaterials;openness:RefObject<number>;openHeight?:number;stageZ?:number;showStem?:boolean;score?:ArrangementVersion;playback?:ScorePlayback;scoreTelemetry?:MutableRefObject<ScoreWorldRenderedState|null>}){
  const base=useRef<Group>(null),turntable=useRef<Group>(null);
  const stem=useRef<Mesh>(null);
  const leftFold=useGeometry(()=>paperGeometry(frontLeft),[]);
  const rightFold=useGeometry(()=>paperGeometry(frontLeft.map(([x,y])=>[-x,y]as const)),[]);
  const rearLeft=useGeometry(()=>paperGeometry(backLeft),[]);
  const rearRight=useGeometry(()=>paperGeometry(backRight),[]);
  const rearLeftFold=useGeometry(()=>paperGeometry([[0,-.004],[-.17,.46],[-.31,.28],[-.21,.10]]),[]);
  const rearRightFold=useGeometry(()=>paperGeometry([[0,-.004],[.23,.49],[.34,.29],[.23,.11]]),[]);
  const moon=useGeometry(()=>{const shape=new Shape();shape.absarc(0,0,.24,Math.PI*.31,Math.PI*1.69,false);shape.quadraticCurveTo(-.02,-.04,.14,.20);return new ExtrudeGeometry(shape,{depth:.020,bevelEnabled:false,curveSegments:30});},[]);
  const starGeometry=useGeometry(()=>paperGeometry(star()),[]);
  const arch=useGeometry(()=>new TubeGeometry(new CatmullRomCurve3(Array.from({length:25},(_,index)=>{
    const angle=Math.PI-index/24*Math.PI;
    return new Vector3(Math.cos(angle)*.61,-.004+Math.sin(angle)*1.14,-.255-Math.sin(angle)*.035);
  })),44,.005,5,false),[]);
  const moonCrease=useGeometry(()=>new TubeGeometry(new CatmullRomCurve3(Array.from({length:17},(_,index)=>{
    const angle=Math.PI*.54+index/16*Math.PI*.94;
    return new Vector3(Math.cos(angle)*.185,Math.sin(angle)*.185,.022);
  })),22,.0023,4,false),[]);
  const paperDetails=useMemo(()=>{
    const folded=materials.paper.clone();folded.color.lerp(materials.paperShade.color,.24);
    const edge=materials.paperShade.clone();edge.color.lerp(materials.brassDark.color,.22);edge.roughness=1;
    return {folded,edge};
  },[materials.paper,materials.paperShade,materials.brassDark]);
  useEffect(()=>()=>{paperDetails.folded.dispose();paperDetails.edge.dispose();},[paperDetails]);
  useEffect(()=>{if(turntable.current)turntable.current.rotation.y=0;},[state.epoch]);
  useFrame((_,delta)=>{
    const lift=MathUtils.smoothstep(openness.current,.35,.95);
    if(base.current)base.current.position.y=.42+(openHeight-.42)*lift;
    const height=.42+(openHeight-.42)*lift;
    if(stem.current){stem.current.position.y=.15375-height*.5;stem.current.scale.y=Math.max(.0075,height-.4125);}
    // A documented storage rule, not a physical folding simulation: the paper
    // contracts a little while its carrier lowers into the actual stage well.
    if(turntable.current)turntable.current.scale.y=.8+.2*lift;
    if(turntable.current&&state.playing&&!state.reduceMotion){
      if(score){const clock=sampleScoreWorldClock(getScoreWorldLayout(score),playback??{playing:state.playing},Date.now());turntable.current.rotation.y=clock.elapsedBeats*.08;if(clock.active||clock.pending)_.invalidate();}
      else{turntable.current.rotation.y+=Math.min(delta,.08)*.33;_.invalidate();}
    }
  },-1);
  return <group ref={base} position={[0,openHeight,stageZ]} name="retracting-paper-stage">
    {showStem&&<mesh ref={stem} name="stage-storage-stem" position={[0,.15375-openHeight*.5,0]} scale={[1,openHeight-.4125,1]} material={materials.brassDark} castShadow><cylinderGeometry args={[.07,.07,1,20]}/></mesh>}
    {/* The carrier keeps its .73 radius and -.0525 floor clearance. The fine
        nested rims add a stage edge without enlarging the storage envelope. */}
    <mesh position={[0,-.015,0]} material={materials.brassDark} castShadow receiveShadow><cylinderGeometry args={[.73,.73,.070,56]}/></mesh>
    <mesh position={[0,.0325,0]} material={materials.brass} castShadow receiveShadow><cylinderGeometry args={[.702,.714,.025,56]}/></mesh>
    <mesh position={[0,.063,0]} material={materials.paperShade} receiveShadow><cylinderGeometry args={[.65,.65,.022,56]}/></mesh>
    <mesh position={[0,.047,0]} rotation={[Math.PI/2,0,0]} material={materials.brass}><torusGeometry args={[.686,.007,5,56]}/></mesh>
    <mesh position={[0,-.038,0]} rotation={[Math.PI/2,0,0]} material={materials.brass}><torusGeometry args={[.724,.004,4,56]}/></mesh>
    <group ref={turntable} position={[0,.08,0]} userData={{captureNeutralRotor:true}}>
      {score&&<ScoreWorld score={score} playback={playback??{playing:state.playing}} reduceMotion={state.reduceMotion} materials={materials} telemetry={scoreTelemetry}/>}
      {/* The arch sits behind the paper, while unequal rear leaves and the
          brighter folded centre retain the old illustrated theatre silhouette. */}
      <mesh geometry={arch} material={materials.brassDark}/>
      <group position={[0,0,-.19]}>
        <group rotation={[0,-.12,0]}>
          <mesh geometry={rearLeft} material={[materials.paperShade,paperDetails.edge]} castShadow receiveShadow/>
          <mesh geometry={rearLeftFold} position={[0,0,.017]} material={[paperDetails.folded,paperDetails.edge]}/>
        </group>
        <group rotation={[0,.14,0]}>
          <mesh geometry={rearRight} material={[materials.paperShade,paperDetails.edge]} castShadow receiveShadow/>
          <mesh geometry={rearRightFold} position={[0,0,.017]} material={[paperDetails.folded,paperDetails.edge]}/>
        </group>
      </group>
      <group position={[.015,0,.105]} rotation={[0,-.10,0]}>
        <mesh geometry={leftFold} material={[materials.paper,paperDetails.edge]} rotation={[0,-.30,0]} castShadow receiveShadow/>
        <mesh geometry={rightFold} material={[paperDetails.folded,paperDetails.edge]} rotation={[0,.30,0]} castShadow receiveShadow/>
        <mesh position={[0,.586,.018]} material={materials.paper}><cylinderGeometry args={[.003,.003,1.18,5]}/></mesh>
      </group>
      <group position={[-.43,.975,-.065]} rotation={[0,.14,-.15]}>
        <mesh geometry={moon} material={[materials.paper,paperDetails.edge]} castShadow/>
        <mesh geometry={moonCrease} material={paperDetails.folded}/>
      </group>
      <mesh geometry={starGeometry} material={[materials.paper,paperDetails.edge]} position={[.43,1.095,-.075]} rotation={[0,-.40,.10]} castShadow/>
      <mesh geometry={starGeometry} material={[paperDetails.folded,paperDetails.edge]} position={[.49,.61,.14]} scale={.44} rotation={[0,.35,.2]}/>
      <mesh position={[-.43,.411,-.065]} material={materials.brassDark}><cylinderGeometry args={[.007,.007,.83,7]}/></mesh>
      <mesh position={[.43,.503,-.075]} material={materials.brassDark}><cylinderGeometry args={[.006,.006,1.014,7]}/></mesh>
      {/* Low folded feet visibly meet the disc; no floating paper or new motion. */}
      <mesh position={[0,-.004,.04]} rotation={[0,-.08,0]} material={paperDetails.folded}><boxGeometry args={[.20,.012,.17]}/></mesh>
    </group>
  </group>;
}
