import React,{useState} from 'react';
import {benchmarkHistory} from '../shared/benchmark-attempts.mjs';

const formatted=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
export default function SavedBenchmarkPanel({data,athlete,onRepeat,onSession}){
  const [selected,setSelected]=useState('');
  const assigned=new Set(data.assignments.filter(a=>a.athleteId===athlete).map(a=>a.programId));
  const definitions=(data.savedBenchmarks||[]).filter(b=>assigned.has(b.programId));
  const current=definitions.find(b=>b.id===selected)||definitions[0];
  const history=current?benchmarkHistory(current,data.logs.filter(l=>l.athleteId===athlete)):null;
  const result=row=>row?.score?.label||'No comparable completed result';
  const change=history?.change;
  return <section className="panel"><h2>Saved benchmark library</h2><p>Each benchmark keeps its original workout definition. Changed targets are saved as separate variations and are not ranked against the original.</p>{!definitions.length?<p>No saved benchmark workouts are assigned to this athlete yet.</p>:<><label className="field"><span>Benchmark workout</span><select aria-label="Choose saved benchmark" value={current.id} onChange={e=>setSelected(e.target.value)}>{definitions.map(b=><option key={b.id} value={b.id}>{b.name} · {b.createdAt.slice(0,10)}</option>)}</select></label><p>{current.description||current.session.name} · {({strength_load:'Heaviest qualifying load',fastest_time:'Fastest time',greatest_distance:'Greatest distance',metcon:'Metcon result'})[current.scoring.type]}</p>{onRepeat&&<button className="btn secondary" onClick={()=>onRepeat(current)}>Start new benchmark attempt</button>}<div className="benchmark-summary"><div><small>Attempts</small><strong>{history.attempts.length}</strong></div><div><small>Latest result</small><strong>{result(history.latest)}</strong></div><div><small>Previous</small><strong>{result(history.previous)}</strong></div><div><small>Best</small><strong>{result(history.best)}</strong></div><div><small>Change vs previous</small><strong>{change?`${change.improved?'Improved':'Changed'} · ${change.label}${change.percent==null?'':` (${change.percent>=0?'+':''}${formatted(change.percent)}%)`}`:'Need two comparable results'}</strong></div></div><h3>Attempt history</h3>{history.attempts.length?history.attempts.slice().reverse().map(row=><button type="button" className="history-row" key={row.logId} onClick={()=>onSession(data.logs.find(l=>l.id===row.logId))}><span>{row.date} · {row.status||'Completed'}</span><strong>{row.score?.label||'Incomplete or changed prescription'}</strong></button>):<p>No attempts yet.</p>}</>}</section>;
}
