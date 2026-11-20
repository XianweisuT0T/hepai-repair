import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Group, MathUtils, Quaternion, TubeGeometry, Vector3 } from 'three';
import { useGeometry } from '../lab3d/Geometry';
import { CRANK_CENTER } from '../lab3d/config';
import { ARM_POSITION } from './productionConfig';
import type { CollaborativeSceneProps } from './types';

/** Direction is drawn in the mechanism's actual plane, so the camera cannot reverse it. */
export default function GestureGuide({props}:{props:CollaborativeSceneProps}){
  const crank=props.role==='maker',root=useRef<Group>(null),amount=useRef(1);
  const points=useMemo(()=>Array.from({length:30},(_,i)=>{
    if(crank){const a=-.15-i/29*Math.PI*.30;return new Vector3(CRANK_CENTER[0]+.56,CRANK_CENTER[1]+.70*Math.cos(a),CRANK_CENTER[2]+.70*Math.sin(a));}
    const a=-.40+i/29*.80;return new Vector3(ARM_POSITION[0]+.46*Math.sin(a),ARM_POSITION[1]+.24,ARM_POSITION[2]+.46*Math.cos(a));
  }),[crank]);
  const geometry=useGeometry(()=>new TubeGeometry(new CatmullRomCurve3(points),40,.012,5,false),[points]);
  const orientation=useMemo(()=>new Quaternion().setFromUnitVectors(new Vector3(0,1,0),points.at(-1)!.clone().sub(points.at(-2)!).normalize()),[points]);
  const done=crank?props.windingStarted||props.windingProgress>0:props.guideReady;
  useFrame((state,delta)=>{
    const target=done?0:1;
    amount.current=props.reduceMotion?target:MathUtils.damp(amount.current,target,12,Math.min(delta,.05));
    if(root.current){root.current.visible=props.stage==='launch'&&props.lidOpen&&amount.current>.02;root.current.traverse(node=>{if('material'in node){const material=(node as import('three').Mesh).material as import('three').MeshBasicMaterial;material.opacity=amount.current*.85;}});}
    if(Math.abs(amount.current-target)>.01)state.invalidate();
  });
  return <group ref={root} name="first-action-direction" visible={props.stage==='launch'&&!done}>
    <mesh geometry={geometry}><meshBasicMaterial color="#efd3a0" transparent depthWrite={false}/></mesh>
    <mesh position={points.at(-1)} quaternion={orientation}><coneGeometry args={[.035,.10,12]}/><meshBasicMaterial color="#efd3a0" transparent depthWrite={false}/></mesh>
  </group>;
}
