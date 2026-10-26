import React,{useState} from 'react';
import {Clipboard,FileJson,Import,TriangleAlert} from 'lucide-react';
import {applyWorkoutImportMappings,CHATGPT_WORKOUT_PROMPT,parseChatGPTWorkoutImport,validateMappedWorkoutImport} from '../shared/chatgpt-workout-import.mjs';
import './chatgpt-workout-import.css';

export default function ChatGPTWorkoutImport({exercises,onImported}){
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[checked,setChecked]=useState(null),[mapping,setMapping]=useState({}),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const inspect=()=>{setError('');try{const result=parseChatGPTWorkoutImport(text,exercises);setChecked(result);setMapping(Object.fromEntries(result.unresolved.map(item=>[item.path,''])));}catch(e){setChecked(null);setError(e.message);}};
  const mappedDraft=checked?applyWorkoutImportMappings(checked.draft,mapping,exercises):null;
  const validation=checked?validateMappedWorkoutImport(mappedDraft,exercises):null;
  const canImport=!!checked&&!checked.unresolved.some(item=>!mapping[item.path])&&!error;
  const importDraft=()=>{
    if(!canImport)return;
    try{
      onImported({generationId:`chatgpt-import-${crypto.randomUUID()}`,source:'chatgpt-import',draft:mappedDraft,requirements:{},metadata:{provider:'ChatGPT copy-and-paste',model:'Iron Heart JSON v1',generatedAt:new Date().toISOString(),durationMs:0},importFindings:validation.findings});
      setOpen(false);setChecked(null);setText('');setMapping({});setError('');
    }catch(e){setError(e.message);}
  };
  const copyPrompt=async()=>{try{await navigator.clipboard.writeText(CHATGPT_WORKOUT_PROMPT);setCopied(true);setError('');setTimeout(()=>setCopied(false),1800);}catch{setError('Clipboard access is unavailable. Copy the prompt from the format guide in the documentation.');}};
  return <section className="chatgpt-import">
    <button type="button" className="btn secondary" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setError('');}}><FileJson size={16}/>Import from ChatGPT</button>
    {open&&<div className="chatgpt-import-panel" aria-label="Import from ChatGPT">
      <div className="chatgpt-import-heading"><div><h2>Paste a structured workout</h2><p>No AI call is made. Import creates an unapproved draft for this review.</p></div><button type="button" className="text-button" onClick={copyPrompt}><Clipboard size={15}/>{copied?'Prompt copied':'Copy ChatGPT prompt'}</button></div>
      <label className="field"><span>Versioned workout JSON</span><textarea aria-label="Versioned workout JSON" rows={10} maxLength={500000} value={text} onChange={e=>{setText(e.target.value);setChecked(null);setMapping({});setError('');}} placeholder={'Paste the complete JSON object here…'} /></label>
      <div className="row"><button type="button" className="btn secondary" onClick={inspect}>Check JSON</button><small>{text.length.toLocaleString()} / 500,000 characters · schema v1 wraps Iron Heart draft v2</small></div>
      {error&&<p className="error" role="alert">{error}</p>}
      {checked&&<div className="chatgpt-import-check" role="status">
        <strong>Structure is valid: {checked.draft.program.name} · {checked.draft.program.weeks} weeks · {checked.draft.program.plan.length} weeks provided</strong>
        {checked.matched.length>0&&<div className="chatgpt-import-matches"><p>Exact exercise-library matches:</p><ul>{checked.matched.map(item=><li key={item.path}>{item.from?`${item.from} → `:''}{item.to}</li>)}</ul></div>}
        {checked.unresolved.length>0&&<div className="chatgpt-import-unmatched"><p><TriangleAlert size={15}/>Choose a library match for each unmatched exercise before importing. Nothing is silently substituted.</p>{checked.unresolved.map(item=><label className="field" key={item.path}><span>{item.exerciseName} · {item.path}</span><select aria-label={`Map ${item.exerciseName} to exercise`} value={mapping[item.path]||''} onChange={e=>setMapping(value=>({...value,[item.path]:e.target.value}))}><option value="">Choose a library match…</option>{item.candidates.map(exercise=><option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select>{!item.candidates.length&&<small>No matching library item is available. Add the exercise to the library or correct the JSON, then check it again.</small>}</label>)}</div>}
        {!!validation?.findings.length&&<details className="chatgpt-import-findings"><summary>{validation.counts.error} errors · {validation.counts.warning} warnings · {validation.counts.info} info. These will remain visible in Draft Review.</summary><ul>{validation.findings.slice(0,12).map((finding,index)=><li key={`${finding.code}-${finding.path}-${index}`}><strong>{finding.severity}</strong> · <code>{finding.path||'/'}</code> · {finding.message}</li>)}</ul></details>}
        <div className="row"><button type="button" className="btn" disabled={!canImport} onClick={importDraft}><Import size={16}/>Open in AI Draft Review</button><small>Import never approves, saves, assigns, or replaces a program.</small></div>
      </div>}
    </div>}
  </section>;
}
