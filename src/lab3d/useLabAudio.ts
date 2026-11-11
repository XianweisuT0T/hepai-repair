import { useEffect, useRef, useState } from 'react';
import { RepairAudio } from '../audio';
import type { NoteSymbol } from '../../shared/types';
import { LAB_PLAY_MS } from './types';

// Standalone lab score, independent of the private room repair blueprints.
const notes:NoteSymbol[]=['moon','moon','leaf','star','leaf','moon','star','leaf'];

export function useLabAudio(playing:boolean,epoch:number,onFinished:()=>void){
  const audio=useRef<RepairAudio|null>(null);
  const [muted,setMuted]=useState(true);
  const end=useRef(onFinished);end.current=onFinished;
  const mounted=useRef(false),generation=useRef(0);
  useEffect(()=>{
    mounted.current=true;const owned=new RepairAudio();audio.current=owned;
    return()=>{mounted.current=false;generation.current++;owned.dispose();if(audio.current===owned)audio.current=null;};
  },[]);
  useEffect(()=>{
    const owned=audio.current;if(!owned)return;
    owned.stop();owned.muted=muted;
    if(!playing)return;
    // Schedule only one finite score. Muting changes silence the existing voices;
    // restarting is an explicit stop/play action, never a second overlapping score.
    if(!muted)notes.forEach((note,i)=>owned.tone(note,'bell',i*.65,.62,1,.78));
    const timer=window.setTimeout(()=>end.current(),LAB_PLAY_MS);
    return()=>{clearTimeout(timer);owned.stop();};
  },[playing,epoch]);
  useEffect(()=>{if(audio.current){audio.current.muted=muted;if(muted)audio.current.stop();}},[muted]);
  async function toggleSound(){
    if(!muted){setMuted(true);return;}
    const owned=audio.current;if(!owned)throw new Error('声音还未准备好，请重试。');
    const ticket=++generation.current;
    await owned.enable();
    if(mounted.current&&generation.current===ticket)setMuted(false);
  }
  return {muted,toggleSound};
}
