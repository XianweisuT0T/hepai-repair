import gear from './assets/onboarding/manual-handgear.png';
import { NoteIcon } from './MusicBox';
import { PencilArrow } from './RepairNoteArt';

function Gear({small=false}:{small?:boolean}){return <img className={`sketch-gear${small?' sketch-gear-small':''}`} src={gear} alt=""/>;}
function Spark(){return <svg className="sketch-spark" viewBox="0 0 40 40"><path d="m20 3 4 12 12 5-12 4-4 13-4-13L3 20l13-5Z" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>;}

/** Decorative instructions only. None of these motions can send a workshop action. */
export default function ManualSketchMotion({page}:{page:number}){
  return <span className={`manual-sketch-motion sketch-scene-${page}`} aria-hidden="true">
    {page<=1?<span className="sketch-gears"><Gear/><Gear small/></span>
      :page===2?<span className="sketch-exchange"><span className="sketch-tool-paper"><svg viewBox="0 0 44 44"><path d="M8 6h28v32H8zM14 14h15M14 21h9m-9 7h13"/></svg></span><PencilArrow/><Gear small/></span>
      :page===3?<span className="sketch-notes"><NoteIcon symbol="leaf"/><NoteIcon symbol="star"/><NoteIcon symbol="moon"/></span>
      :page===4?<span className="sketch-start"><Gear small/><svg className="sketch-slider" viewBox="0 0 132 58"><path d="M8 21h116v25H8zM20 33h88M93 28l8 5-8 5"/><g className="sketch-slider-tab"><path d="M17 13h16v38H17zM21 23h8m-8 5h8m-8 5h8"/></g></svg></span>
      :page===5?<span className="sketch-stars"><Spark/><Spark/><Spark/></span>
      :<span className="sketch-letter"><svg viewBox="0 0 90 58"><path d="m8 12 67-5 6 40-68 5Z"/><path d="m8 12 36 22L75 7M13 52l20-26m48 21L57 24"/></svg><Spark/></span>}
  </span>;
}
