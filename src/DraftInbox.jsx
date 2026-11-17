import './draft-inbox.css';
import React,{useEffect,useRef,useState} from 'react';
import ChatGPTWorkoutImport from './ChatGPTWorkoutImport.jsx';
import AIDraftReview from './AIDraftReview.jsx';
import {chatGPTWorkoutImportEnvelope} from '../shared/chatgpt-workout-import.mjs';

export default function DraftInbox({request,exercises,coachId,open,onOpen,onSaved,pasteRequest=0}){
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const openedLink=useRef(false),selection=useRef(0);
  const refresh=async()=>setRows(await request('external-drafts'));
  const load=async id=>{
    const attempt=++selection.current;setBusy(true);setError('');
    try{const value=await request(`external-drafts/${encodeURIComponent(id)}`);if(attempt!==selection.current)return;
      setSelected({...value,generationId:`inbox-${value.id}-${value.revision}-${Date.now()}`,source:'chatgpt-import',inbox:{id:value.id,revision:value.revision},savedProgram:value.savedProgramId?{id:value.savedProgramId,name:value.draft.program.name}:null,metadata:{provider:'Private Draft Inbox',model:'Iron Heart JSON v1',generatedAt:value.createdAt}});
    }catch(e){setError(e.message);}finally{if(attempt===selection.current)setBusy(false);}
  };
  useEffect(()=>{if(open)refresh().catch(e=>setError(e.message));},[open]);
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get('draft');if(id&&!openedLink.current){openedLink.current=true;onOpen(true);load(id);}},[]);
  const receive=async result=>{
    const value=await request('external-drafts','POST',chatGPTWorkoutImportEnvelope(result.draft),{idempotencyKey:result.submissionKey});
    await load(value.id);await refresh();
  };
  return <section className="draft-inbox" aria-label="Coach draft inbox">
    <button className="btn secondary" aria-expanded={open} onClick={()=>onOpen(!open)}>ChatGPT Drafts</button>
    {open&&<div className="panel" style={{marginTop:12,minWidth:0}}>
      <h2>ChatGPT Drafts</h2><p>Private saved drafts. Review and approve before saving a new program. Athlete assignment is separate.</p>
      <div className="row"><button className="btn secondary" disabled={busy} onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>Refresh drafts</button>{selected&&<><button className="btn secondary" onClick={()=>{++selection.current;setBusy(false);setSelected(null);setError('');}}>Back to inbox</button><button className="btn secondary" disabled={busy} onClick={()=>load(selected.id)}>Reopen saved draft</button></>}</div>
      {error&&<p role="alert" className="error">{error}</p>}{busy&&<p role="status">Opening draft…</p>}
      {!selected&&<><ChatGPTWorkoutImport exercises={exercises} onImported={receive} persist buttonLabel="Paste from ChatGPT" openRequest={pasteRequest}/>{rows.length===0?<p>No incoming drafts yet.</p>:<ul style={{padding:0,listStyle:'none'}}>{rows.map(row=><li key={row.id} style={{padding:'12px 0',borderBottom:'1px solid #ffffff22',overflowWrap:'anywhere'}}><strong>{row.name} · {row.status}</strong><p>Revision {row.revision} · {new Date(row.updatedAt||row.createdAt).toLocaleString()}</p><button className="btn secondary" disabled={busy} onClick={()=>load(row.id)}>Review</button></li>)}</ul>}</>}
      {selected&&<AIDraftReview key={selected.generationId} initialGeneration={selected} exercises={exercises} coachId={coachId} request={request} onSaved={async result=>{await onSaved?.(result);await refresh();}}/>}
    </div>}
  </section>;
}
