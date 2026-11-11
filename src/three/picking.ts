export type ProductionDropTarget={kind:'gear';slotId:string}|{kind:'note';index:number};
interface Picker { element:HTMLElement; pick:(clientX:number,clientY:number)=>ProductionDropTarget|null }
const pickers=new Set<Picker>();
/** Bridges an HTML part tray to raycasting in the current authoritative 3D scene. */
export function registerProductionPicker(picker:Picker){pickers.add(picker);return()=>{pickers.delete(picker);};}
export function pickProductionDropTarget(clientX:number,clientY:number):ProductionDropTarget|null {
  for(const picker of [...pickers].reverse()){
    if(!picker.element.isConnected)continue;
    const bounds=picker.element.getBoundingClientRect();
    if(clientX<bounds.left||clientX>bounds.right||clientY<bounds.top||clientY>bounds.bottom)continue;
    const result=picker.pick(clientX,clientY);if(result)return result;
  }
  return null;
}
