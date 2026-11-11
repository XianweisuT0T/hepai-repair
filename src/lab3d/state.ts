import type { Lab3DState, LabMode } from './types';

export function initialLabState(reduceMotion = false, epoch = 0): Lab3DState {
  return { mode:'observe',lidOpen:true,selected:false,installed:false,installingAt:null,winding:0,playing:false,epoch,viewRevision:0,reduceMotion };
}
export type LabAction =
  | {type:'mode';mode:LabMode} | {type:'lid'} | {type:'select'} | {type:'cancel'}
  | {type:'install';at:number} | {type:'installed';at:number;epoch:number}
  | {type:'wind';fraction:number} | {type:'play'} | {type:'stop'}
  | {type:'reset'} | {type:'view'} | {type:'reduceMotion';value:boolean};

/** Local experiment only. No room credential, private blueprint or server command. */
export function labReducer(state:Lab3DState, action:LabAction):Lab3DState {
  switch(action.type){
    case 'mode':return state.installingAt!==null?state:{...state,mode:action.mode,selected:false,viewRevision:state.viewRevision+1};
    case 'lid':return state.installingAt!==null?state:{...state,lidOpen:!state.lidOpen,selected:false,playing:false};
    case 'select':return state.mode!=='assemble'||!state.lidOpen||state.installed||state.installingAt!==null||state.playing?state:{...state,selected:true};
    case 'cancel':return state.installingAt!==null?state:{...state,selected:false};
    case 'install':return !state.selected||state.mode!=='assemble'||!state.lidOpen||state.installed||state.installingAt!==null?state:{...state,installingAt:action.at};
    case 'installed':return state.epoch!==action.epoch||state.installingAt!==action.at?state:{...state,installed:true,selected:false,installingAt:null};
    case 'wind':{
      if(state.mode!=='assemble'||!state.installed||!state.lidOpen||state.playing||state.installingAt!==null||!Number.isFinite(action.fraction))return state;
      const next=Math.max(0,Math.min(1,state.winding+Math.max(-.25,Math.min(.25,action.fraction))));
      // A small end-stop tolerance prevents a complete physical circle from
      // displaying 100% while floating-point projection leaves play disabled.
      return {...state,winding:next>=.998?1:next};
    }
    case 'play':return !state.installed||state.winding<1||!state.lidOpen||state.installingAt!==null||state.playing?state:{...state,playing:true,selected:false};
    case 'stop':return {...state,playing:false};
    case 'reset':return initialLabState(state.reduceMotion,state.epoch+1);
    case 'view':return {...state,viewRevision:state.viewRevision+1};
    case 'reduceMotion':return {...state,reduceMotion:action.value};
  }
}
