import test from 'node:test';
import assert from 'node:assert/strict';
import {initialLabState,labReducer} from '../src/lab3d/state';

test('inspection and assembly require an open lid and explicit selection',()=>{
  let state=initialLabState();
  assert.equal(labReducer(state,{type:'select'}).selected,false,'orbit mode cannot pick parts');
  state=labReducer(state,{type:'mode',mode:'assemble'});
  assert.equal(labReducer(state,{type:'install',at:100}).installingAt,null,'an empty click cannot install');
  state=labReducer(state,{type:'lid'});
  assert.equal(labReducer(state,{type:'select'}).selected,false,'closed lid blocks hidden internals');
  state=labReducer(state,{type:'lid'});state=labReducer(state,{type:'select'});
  state=labReducer(state,{type:'install',at:100});
  assert.equal(labReducer(state,{type:'lid'}).lidOpen,true,'lid waits while a part is seating');
  assert.equal(labReducer(state,{type:'install',at:101}).installingAt,100,'duplicate install does not replace the motion');
  assert.equal(labReducer(state,{type:'mode',mode:'observe'}).mode,'assemble','camera mode is locked until the current seating action finishes');
});
test('old seating completion cannot change a reset experiment',()=>{
  let state=initialLabState();state=labReducer(state,{type:'mode',mode:'assemble'});state=labReducer(state,{type:'select'});state=labReducer(state,{type:'install',at:100});
  const epoch=state.epoch;state=labReducer(state,{type:'reset'});
  state=labReducer(state,{type:'installed',at:100,epoch});
  assert.equal(state.installed,false);assert.equal(state.winding,0);assert.equal(state.playing,false);
});
test('spring responds to net travel, and only a seated mechanism may play',()=>{
  let state=initialLabState();assert.equal(labReducer(state,{type:'wind',fraction:1}).winding,0);
  assert.equal(labReducer(state,{type:'play'}).playing,false);
  assert.equal(labReducer({...state,installed:true},{type:'wind',fraction:.25}).winding,0,'observation gestures cannot wind the mechanism');
  state={...state,mode:'assemble',installed:true};
  for(let i=0;i<20;i++){state=labReducer(state,{type:'wind',fraction:.04});state=labReducer(state,{type:'wind',fraction:-.04});}
  assert.ok(state.winding<.0001,'back-and-forth jitter cannot manufacture spring energy');
  for(let i=0;i<4;i++)state=labReducer(state,{type:'wind',fraction:.25});
  assert.equal(state.winding,1);state=labReducer(state,{type:'play'});assert.equal(state.playing,true);
  assert.equal(labReducer(state,{type:'wind',fraction:-.25}).winding,1,'no winding while the mechanism plays');
  state=labReducer(state,{type:'lid'});assert.equal(state.playing,false);assert.equal(state.lidOpen,false);
});
test('camera mode and return-view requests preserve repaired parts and spring tension',()=>{
  let state={...initialLabState(),installed:true,winding:.75};
  state=labReducer(state,{type:'mode',mode:'assemble'});state=labReducer(state,{type:'view'});state=labReducer(state,{type:'mode',mode:'observe'});
  assert.equal(state.installed,true);assert.equal(state.winding,.75);assert.equal(state.viewRevision,3);
});
