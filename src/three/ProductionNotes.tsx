import { useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group, MathUtils, Mesh, Shape } from 'three';
import type { NoteSymbol } from '../../shared/types';
import { BeveledBox, flatExtrusion, useGeometry } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';
import { NOTE_POSITIONS } from './productionConfig';
import type { CollaborativeSceneProps } from './types';

function NoteRelief({symbol,materials}:{symbol:NoteSymbol;materials:LabMaterials}){
  const geometry=useGeometry(()=>{
    const shape=new Shape();
    if(symbol==='star')for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2===0?.12:.048;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}
    else if(symbol==='leaf'){shape.moveTo(-.095,-.075);shape.bezierCurveTo(-.19,.03,-.04,.17,.125,.135);shape.bezierCurveTo(.14,-.025,.02,-.16,-.095,-.075);}
    else {shape.absarc(0,0,.12,Math.PI*.31,Math.PI*1.69,false);shape.quadraticCurveTo(-.015,-.02,.07,.1);}
    shape.closePath();return flatExtrusion(shape,.012,.002);
  },[symbol]);
  return <mesh geometry={geometry} position={[0,.041,0]} material={materials.steel} castShadow/>;
}

export default function ProductionNotes({props,materials,canInteract,openness}:{props:CollaborativeSceneProps;materials:LabMaterials;canInteract:()=>boolean;openness:RefObject<number>}){
  const down=useRef<Record<number,{x:number;y:number}>>({});
  const rail=useRef<Group>(null);
  useFrame(()=>{if(rail.current)rail.current.position.y=.10*MathUtils.smoothstep(openness.current,.45,.95);});
  const allowed=()=>canInteract()&&props.stage==='melody'&&(props.canPlaceNotes||props.canPoint);
  const click=(index:number,event:ThreeEvent<MouseEvent>)=>{
    const start=down.current[index];if(!allowed()||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>7)return;
    event.stopPropagation();if(props.canPlaceNotes)props.onNoteSlot(index);else props.onPoint(`note-${index}`);
  };
  const noteRaycast:Mesh['raycast']=function(this:Mesh,raycaster,intersections){if(props.stage==='melody'&&props.lidOpen)Mesh.prototype.raycast.call(this,raycaster,intersections);};
  return <group ref={rail} name="retracting-note-rail" position={[0,.10,0]}>
    <BeveledBox size={[4.85,.055,.36]} position={[0,1.383,1.54]} radius={.018} material={materials.brassDark}/>
    {NOTE_POSITIONS.map((position,index)=><group key={index} position={[...position]} userData={{productionTarget:{kind:'note',index}}}>
      <BeveledBox size={[1.02,.025,.28]} radius={.018} material={materials.velvet}/>
      {(props.notes[index]||props.work)&&<group>
        <BeveledBox size={[.93,.035,.255]} position={[0,.017,0]} radius={.025} material={props.highlightNote===index?materials.paperShade:materials.brass}/>
        {props.notes[index]?<NoteRelief symbol={props.notes[index]!} materials={materials}/>:<BeveledBox size={[.16,.012,.022]} position={[0,.047,0]} radius={.004} material={materials.steel}/>}
      </group>}
      {/* Expand toward the inactive mechanism, ending before the front rim at z=1.73. */}
      <mesh name={`note-hit-${index}`} position={[0,0,-.11]} raycast={noteRaycast} onPointerDown={event=>{if(allowed()){event.stopPropagation();down.current[index]={x:event.clientX,y:event.clientY};}}} onClick={event=>click(index,event)}>
        <boxGeometry args={[1.06,.14,.56]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
      </mesh>
    </group>)}
  </group>;
}
