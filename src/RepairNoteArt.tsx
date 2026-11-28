import comic from './assets/onboarding/repair-comic.webp';
let warmed=false;
export function warmRepairComic(){if(warmed)return;warmed=true;const image=new Image();image.src=comic;}

/** Crops one illustrated strip in CSS; captions remain selectable, accessible text. */
export function RepairComic({scene}:{scene:0|1|2}){
  return <span className={`repair-comic-art comic-scene-${scene}`} aria-hidden="true"><img src={comic} alt="" decoding="async"/></span>;
}
export function PencilArrow(){
  return <svg className="pencil-arrow" viewBox="0 0 64 32" fill="none" aria-hidden="true"><path d="M4 19c15 5 30 1 49-9M42 5l12 4-5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export function JoiningMark(){
  return <svg className="joining-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M14 15a11 11 0 1 0 0 22l7-7M34 33a11 11 0 1 0 0-22l-7 7M17 31l14-14M8 6l3 3m28 30 3 3M3 23h4m34 2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}
