import { useEffect, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA } from './config';
import type { Lab3DState } from './types';

export default function Controls({state,controlsRef,dragging}:{state:Lab3DState;controlsRef:MutableRefObject<OrbitControls|null>;dragging:MutableRefObject<boolean>}){
  const {camera,gl,invalidate,size}=useThree();
  useEffect(()=>{
    const controls=new OrbitControls(camera,gl.domElement);controlsRef.current=controls;
    controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.11;
    controls.minPolarAngle=Math.PI*.15;controls.maxPolarAngle=Math.PI*.43;
    controls.minAzimuthAngle=-1.15;controls.maxAzimuthAngle=1.15;
    controls.minDistance=9.2;controls.maxDistance=20;
    controls.rotateSpeed=.65;controls.zoomSpeed=.65;
    controls.target.set(...CAMERA.target);
    const changed=()=>invalidate();
    controls.addEventListener('change',changed);controls.addEventListener('start',changed);
    controls.update();invalidate();
    return()=>{controls.removeEventListener('change',changed);controls.removeEventListener('start',changed);controls.dispose();controlsRef.current=null;};
  },[camera,gl,invalidate,controlsRef]);
  useEffect(()=>{
    const controls=controlsRef.current;if(!controls)return;
    // OrbitControls keeps private spherical deltas while damping settles.
    // Consume them on the old pose before assigning the explicit reset pose.
    controls.enableDamping=false;
    controls.update();
    const fit=Math.max(1,1.2/(size.width/size.height));
    const target=CAMERA.target;
    const position=state.mode==='assemble'?[7.05,7.9,9.4]:CAMERA.position;
    camera.position.set(target[0]+(position[0]-target[0])*fit,target[1]+(position[1]-target[1])*fit,target[2]+(position[2]-target[2])*fit);
    controls.target.set(...target);controls.minDistance=9.2*fit;controls.maxDistance=20*fit;
    controls.enabled=state.mode==='observe'&&!dragging.current;
    controls.update();controls.saveState();controls.enableDamping=true;invalidate();
  },[state.mode,state.viewRevision,state.epoch,size.width,size.height,camera,controlsRef,dragging,invalidate]);
  useFrame(()=>{if(controlsRef.current?.enabled)controlsRef.current.update();});
  return null;
}
