import { useCallback, useSyncExternalStore } from 'react';

const eventName='hepai-operation-guide-change';
const memory=new Map<string,boolean>();
function read(key:string){
  if(memory.has(key))return memory.get(key)!;
  try{return localStorage.getItem(`hepai-guide-v1:${key}`)==='seen';}catch{return false;}
}
function subscribe(callback:()=>void){
  window.addEventListener(eventName,callback);window.addEventListener('storage',callback);
  return()=>{window.removeEventListener(eventName,callback);window.removeEventListener('storage',callback);};
}
/** Shared by the short cue and its actual UI target; skipping removes both. */
export function useGuideDismissed(key:string){
  const dismissed=useSyncExternalStore(subscribe,()=>read(key));
  const setDismissed=useCallback((value:boolean)=>{
    try{if(value)localStorage.setItem(`hepai-guide-v1:${key}`,'seen');else localStorage.removeItem(`hepai-guide-v1:${key}`);memory.delete(key);}
    catch{memory.set(key,value);}
    window.dispatchEvent(new Event(eventName));
  },[key]);
  return [dismissed,setDismissed] as const;
}
