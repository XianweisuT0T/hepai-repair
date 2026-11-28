import { useEffect, useState } from 'react';
import gears from './assets/onboarding/manual-action-gears.png';
import melody from './assets/onboarding/manual-action-melody.png';

const stories={
  gears:{image:gears,steps:['挑齿轮','递给伙伴','试着安装'],descriptions:['从零件盘中拿起一枚齿轮','把齿轮递给读图纸的伙伴，核对线索','对准音乐盒的轴位，将齿轮放下']},
  melody:{image:melody,steps:['交换工具','读声音顺序','排声音片'],descriptions:['两个人交换图纸和工具','读图纸的伙伴说明声音片的排列顺序','装配的伙伴把声音片放入对应位置']},
};
export function warmManualActions(){[gears,melody].forEach(src=>{const img=new Image();img.src=src;});}

/** Three real hand actions. Selecting an illustration never operates the workbench. */
export default function ManualActionStory({kind,animated}:{kind:keyof typeof stories;animated:boolean}){
  const [step,setStep]=useState(0),[inspecting,setInspecting]=useState(false),story=stories[kind];
  useEffect(()=>{
    if(!animated||inspecting)return;
    const timer=window.setInterval(()=>setStep(value=>(value+1)%3),3800);
    return()=>window.clearInterval(timer);
  },[animated,inspecting]);
  return <figure className="manual-action-story" onPointerDown={event=>event.stopPropagation()}>
    <div className="manual-action-frame"><img src={story.image} alt={story.descriptions[step]} draggable={false} style={{left:`${-step*100}%`}}/></div>
    <figcaption className="manual-action-steps" aria-label="查看操作分镜">
      {story.steps.map((label,index)=><button key={label} aria-pressed={step===index} onClick={()=>{setStep(index);setInspecting(true);}}><span aria-hidden="true">{index+1}</span>{label}</button>)}
    </figcaption>
  </figure>;
}
