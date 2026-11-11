import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Lighting from '../lab3d/Lighting';
import { supportsWebGL2 } from '../lab3d/MusicBox3D';
import StarInstrument, { type StarInstrumentProps } from './StarInstrument';

interface Props extends Omit<StarInstrumentProps,'onManipulating'>{viewRevision:number}
type ControlsRef=MutableRefObject<OrbitControls|null>;

function ViewerControls({controlsRef,manipulating,revision}:{controlsRef:ControlsRef;manipulating:MutableRefObject<boolean>;revision:number}){
  const {camera,gl,size,invalidate}=useThree();
  useEffect(()=>{
    const controls=new OrbitControls(camera,gl.domElement);controlsRef.current=controls;
    controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.10;controls.rotateSpeed=.65;controls.zoomSpeed=.7;
    controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI*.48;
    const change=()=>invalidate();controls.addEventListener('change',change);controls.addEventListener('start',change);
    return()=>{controls.removeEventListener('change',change);controls.removeEventListener('start',change);controls.dispose();controlsRef.current=null;};
  },[camera,gl,invalidate]);
  useEffect(()=>{
    const controls=controlsRef.current;if(!controls||!size.width||!size.height)return;
    // Drain any outstanding damped rotation before assigning the exact preset.
    controls.enableDamping=false;controls.update();
    const aspect=size.width/size.height;
    const target=new Vector3(0,1.65,-.20),offset=new Vector3(7.3,3.8,10.2);
    // Leave room for the separate front observation rail and its timber ledge.
    const fit=Math.max(1.08,1.22/aspect);
    camera.position.copy(offset.multiplyScalar(fit).add(target));controls.target.copy(target);
    controls.minDistance=6.8*fit;controls.maxDistance=24*fit;
    if(camera instanceof PerspectiveCamera){camera.fov=35;camera.updateProjectionMatrix();}
    controls.update();controls.saveState();controls.enableDamping=true;invalidate();
  },[size.width,size.height,revision,camera,invalidate]);
  useFrame(()=>{const controls=controlsRef.current;if(controls){controls.enabled=!manipulating.current;if(controls.enabled)controls.update();}},-1);
  return null;
}

function StarScene({props,host}:{props:Props;host:RefObject<HTMLDivElement|null>}){
  const {camera,scene,invalidate,gl}=useThree();
  const controlsRef=useRef<OrbitControls|null>(null),manipulating=useRef(false);
  useEffect(()=>{invalidate();},[props,invalidate]);
  useEffect(()=>{
    const element=host.current;if(element)element.dataset.webgl='ready';
    return()=>{if(element)delete element.dataset.webgl;};
  },[host,gl]);
  useFrame(()=>{
    const element=host.current;if(!element)return;camera.updateMatrixWorld();scene.updateMatrixWorld(true);
    const point=new Vector3();
    const project=(prefix:string,name:string,top=false)=>{
      const object=scene.getObjectByName(name);if(!object)return;
      object.getWorldPosition(point);
      if(top){const bounds=new Box3().setFromObject(object);if(!bounds.isEmpty())point.set((bounds.min.x+bounds.max.x)*.5,bounds.max.y-.10,(bounds.min.z+bounds.max.z)*.5);}
      point.project(camera);element.setAttribute(`data-${prefix}-ndc-x`,point.x.toFixed(6));element.setAttribute(`data-${prefix}-ndc-y`,point.y.toFixed(6));
    };
    project('star-wheel-handle','star-instrument-wheel-handle');
    project('star-aim-handle','star-instrument-aim-handle');
    [0,1,2].forEach(index=>project(`star-card-${index}`,`star-instrument-card-${index}`,true));
    const orbits=scene.getObjectByName('star-instrument-orbits'),lens=scene.getObjectByName('star-instrument-aim-slider');
    if(orbits)element.dataset.starOrbitAngle=orbits.rotation.y.toFixed(6);
    if(lens){lens.getWorldPosition(point);element.dataset.starAimX=point.x.toFixed(6);}
    element.dataset.cameraX=camera.position.x.toFixed(5);element.dataset.cameraY=camera.position.y.toFixed(5);element.dataset.cameraZ=camera.position.z.toFixed(5);
    element.dataset.starManipulating=String(manipulating.current);
    element.dataset.starChartObject=scene.getObjectByName(`backdrop-constellation-${props.constellation}`)?.name??'';
    element.dataset.starDrawCalls=String(gl.info.render.calls);element.dataset.starTriangles=String(gl.info.render.triangles);
  });
  return <>
    <Lighting transparent/>
    <ViewerControls controlsRef={controlsRef} manipulating={manipulating} revision={props.viewRevision}/>
    <mesh position={[0,-.06,0]} receiveShadow><cylinderGeometry args={[5.8,5.8,.13,88]}/><meshStandardMaterial color="#10231e" roughness={.98}/></mesh>
    <StarInstrument {...props} onManipulating={active=>{manipulating.current=active;if(controlsRef.current)controlsRef.current.enabled=!active;invalidate();}}/>
  </>;
}

export default function StarInstrumentViewer(props:Props){
  const host=useRef<HTMLDivElement>(null);
  const [supported,setSupported]=useState<boolean|null>(null);
  useEffect(()=>setSupported(supportsWebGL2()),[]);
  if(supported===false)return <div className="commission-error" role="status"><p>当前浏览器暂时无法显示三维星仪。</p><button className="secondary" onClick={()=>location.reload()}>重新载入预览</button></div>;
  return <div className="commission-model-host" ref={host} data-testid="star-model-host" role="group" data-webgl="loading" data-star-chart={props.constellation} data-star-aim={props.aim.toFixed(4)} data-star-orbit-requested={props.orbitAngle.toFixed(6)} aria-label="合拍星仪三维概念预览">
    {supported?<Canvas frameloop="demand" shadows dpr={[1,1.6]} camera={{position:[7.3,5.92,10.2],fov:35,near:.1,far:90}} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}}><StarScene props={props} host={host}/></Canvas>:<div className="commission-loading" role="status">正在打开三维星仪…</div>}
  </div>;
}
