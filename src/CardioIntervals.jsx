import {intervalSegments} from '../shared/cardio-structure.mjs';
import React,{useEffect,useState} from 'react';
import CardioMetrics from './CardioMetrics.jsx';
import TimeInput from './TimeInput.jsx';
import {FIELDS,setSummary} from '../shared/tracking.mjs';
import {formatTime} from '../shared/time.mjs';
import {prescribedCardioIntervals,copyPreviousActual} from '../shared/cardio-logging.mjs';
import './cardio-intervals.css';
function RecoveryTimer({seconds}){
 const [deadline,setDeadline]=useState(null),[remaining,setRemaining]=useState(seconds);
 useEffect(()=>{if(deadline==null){return;}const update=()=>{const n=Math.max(0,Math.ceil((deadline-Date.now())/1000));setRemaining(n);if(n===0)setDeadline(null);};update();const id=setInterval(update,250);return()=>clearInterval(id);},[deadline,seconds]);
 return <span className="recovery-timer"><output aria-live="polite">{formatTime(remaining)}</output> <button type="button" className="btn secondary" onClick={()=>{setRemaining(seconds);if(deadline){setDeadline(null);}else{setDeadline(Date.now()+seconds*1000);}}}>{deadline?'Reset timer':'Start recovery'}</button></span>;
}
export default function CardioIntervals({target,sets,onChange,recorded=false}){
 const targets=prescribedCardioIntervals(target),type=target.trackingType;
 const extra=FIELDS[type].filter(k=>!['distance','durationSeconds','paceSeconds'].includes(k));
 const edit=(j,patch)=>onChange(sets.map((v,k)=>k===j?{...v,...patch}:v));
 const render=(value,j)=>{const prescribed=targets[j]||{work:{},recovery:{}},seconds=prescribed.recovery.durationSeconds||0,previous=prescribed.segmentIndex!=null?targets.findLastIndex((t,k)=>k<j&&t.blockIndex===prescribed.blockIndex&&t.segmentIndex===prescribed.segmentIndex):j-1;
 return <section className="cardio-interval" key={j} aria-label={`Interval ${j+1}`}>
 <header className="interval-heading"><strong>Interval {j+1}</strong><label><input type="checkbox" aria-label={`Interval ${j+1} complete`} checked={value.completed===true} onChange={e=>edit(j,{completed:e.target.checked})}/> Complete</label></header>
 <p className="interval-target">{recorded?'Scanned:':'Target:'} {prescribed.label&&`${prescribed.label} · `}{setSummary(prescribed.work,type)}{seconds>0?` · Recovery ${formatTime(seconds)}`:''}</p>
 <CardioMetrics type={type} value={value} fields={FIELDS[type].filter(k=>['distance','durationSeconds','paceSeconds'].includes(k))} onChange={v=>edit(j,{...v,completed:v.durationSeconds>0||v.distance>0})}/>
 {previous>=0&&<button type="button" className="text-button copy-interval" onClick={()=>onChange(sets.map((v,k)=>k===j?copyPreviousActual(sets[previous],value):v))}>Copy previous actual results</button>}
 <details><summary>Power, cadence, calories, RPE & recovery</summary><CardioMetrics type={type} value={value} fields={[...extra,'rpe']} onChange={v=>edit(j,v)}/><label className="field"><span>Actual recovery (M:SS, optional)</span><TimeInput value={value.recoverySeconds} onChange={v=>edit(j,{recoverySeconds:v})}/></label>{seconds>0&&<RecoveryTimer seconds={seconds}/>}</details>
 </section>;};
 const blocks=target.intervals?.length?target.intervals:[{rounds:target.intervalCount||1,work:target.metrics||{},recovery:{durationSeconds:target.restSeconds||0}}];
 let offset=0;return <div className="compact-intervals">{blocks.map((b,i)=>{const segments=intervalSegments(b),start=offset;offset+=b.rounds*segments.length;return <section className="interval-block" key={i}><header><strong>{b.rounds} Rounds</strong><small>{recorded?'Scanned structure · edit actual results below':'Prescribed targets · actuals recorded separately'}</small></header>{segments.map((s,j)=><div className="interval-summary" key={j}><span>{s.label||`Segment ${j+1}`}</span><strong>{setSummary(s.metrics,type)}</strong></div>)}{b.recovery?.durationSeconds>0&&<div className="interval-summary"><span>Rest {b.segments?"between rounds":"after each effort"}</span><strong>{formatTime(b.recovery.durationSeconds)}</strong></div>}<details className="actual-rounds"><summary>Log round-by-round results</summary>{Array.from({length:b.rounds},(_,r)=><details className="round-detail" key={r}><summary>Round {r+1} · {segments.filter((_,j)=>sets[start+r*segments.length+j]?.completed).length}/{segments.length} complete</summary>{segments.map((_,j)=>{const index=start+r*segments.length+j;return <React.Fragment key={j}>{render(sets[index]||{},index)}</React.Fragment>;})}</details>)}</details></section>;})}</div>;
}
