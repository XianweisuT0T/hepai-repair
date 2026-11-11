import { useEffect, useMemo } from 'react';
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { Mark } from '../../shared/types';
import { BeveledBox } from '../lab3d/Geometry';
import type { LabMaterials } from '../lab3d/materials';
import { NOTE_POSITIONS, PRODUCTION_SOCKETS } from './productionConfig';

function PaperTag({text,position,materials}:{text:string;position:readonly[number,number,number];materials:LabMaterials}){
  const label=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const context=canvas.getContext('2d');if(context){context.fillStyle='#293c31';context.font='64px "Microsoft YaHei", serif';context.textAlign='center';context.fillText(text,256,85,478);}const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return{texture,material:new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false})};},[text]);
  useEffect(()=>()=>{label.texture.dispose();label.material.dispose();},[label]);
  return <group position={[...position]} rotation={[-1.1,0,0]}>
    <BeveledBox size={[1.68,.40,.022]} radius={.022} material={materials.paper}/>
    <mesh position={[0,0,.015]} material={label.material}><planeGeometry args={[1.64,.39]}/></mesh>
  </group>;
}
export default function ProductionMarks({mark,materials}:{mark:Mark|undefined;materials:LabMaterials}){
  if(!mark)return null;
  const socket=PRODUCTION_SOCKETS.find(slot=>slot.id===mark.target);
  const note=mark.target.startsWith('note-')?NOTE_POSITIONS[Number(mark.target.slice(5))]:undefined;
  if(!socket&&!note)return null;
  const position=socket?[socket.x,1.60,socket.z]as const:[note![0],1.60,note![2]]as const;
  return <group name="partner-pointing-arrow" userData={{target:mark.target,by:mark.by}}>
    <mesh position={[position[0],position[1]-.015,position[2]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={socket?[.77,.79,64]:[.23,.25,48]}/><meshBasicMaterial color="#ebd7a6" transparent opacity={.34} depthWrite={false}/></mesh>
    <group position={[position[0],position[1]+.16,position[2]]} rotation={[-Math.PI/2,0,0]}>
      <mesh position={[0,.32,0]} material={materials.paper} castShadow><cylinderGeometry args={[.022,.022,.32,12]}/></mesh>
      <mesh position={[0,.09,0]} rotation={[0,0,Math.PI]} material={materials.paper} castShadow><coneGeometry args={[.10,.18,16]}/></mesh>
    </group>
    <PaperTag text={`${mark.by} · ${mark.text}`} position={[position[0],2.15,position[2]-.62]} materials={materials}/>
  </group>;
}
