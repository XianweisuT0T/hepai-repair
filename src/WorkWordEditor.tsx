import { useEffect, useState } from 'react';

interface Props {
  savedWord:string;
  partnerWord:string;
  disabled:boolean;
  shared:boolean;
  onSave:(word:string)=>Promise<{ok:boolean}>;
}

/** A draft belongs to one person's word. Empty submission is an explicit action. */
export default function WorkWordEditor({savedWord,partnerWord,disabled,shared,onSave}:Props){
  const [draft,setDraft]=useState(savedWord);
  useEffect(()=>{setDraft(savedWord);},[savedWord,shared]);
  const trimmed=draft.trim(),unchanged=trimmed===savedWord;
  const locked=disabled||shared;
  return <form className="word-picker" onSubmit={event=>{event.preventDefault();if(!locked&&trimmed&&!unchanged)void onSave(trimmed);}}>
    <label htmlFor="work-word">各留一个词，合成它的名字 <span>可跳过</span></label>
    <div>
      <input id="work-word" value={draft} disabled={locked} onChange={event=>setDraft(event.target.value.slice(0,8))} placeholder="例如：晚风" maxLength={8}/>
      <button className="word-save" type="submit" disabled={locked||!trimmed||unchanged}>{savedWord&&unchanged?'已留下':'留下'}</button>
    </div>
    <div className="word-saved-row">
      <small aria-live="polite">你的词：{savedWord||'未填写'} · 伙伴的词：{partnerWord||'未填写'}</small>
      {savedWord&&<button className="word-clear" type="button" data-testid="work-word-clear" disabled={locked} onClick={()=>void onSave('')}>清除我的词</button>}
    </div>
  </form>;
}
