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
export default function CardioIntervals({target,sets,onChange}){
 const targets=prescribedCardioIntervals(target),type=target.trackingType;
 const extra=FIELDS[type].filter(k=>!['distance','durationSeconds','paceSeconds'].includes(k));
 const edit=(j,patch)=>onChange(sets.map((v,k)=>k===j?{...v,...patch}:v));
 return <div className="compact-intervals">{sets.map((value,j)=>{const prescribed=targets[j]||{work:{},recovery:{}},seconds=prescribed.recovery.durationSeconds||0;
 return <section className="cardio-interval" key={j} aria-label={`Interval ${j+1}`}>
 <header className="interval-heading"><strong>Interval {j+1}</strong><label><input type="checkbox" aria-label={`Interval ${j+1} complete`} checked={value.completed===true} onChange={e=>edit(j,{completed:e.target.checked})}/> Complete</label></header>
 <p className="interval-target">Target: {setSummary(prescribed.work,type)}{seconds>0?` · Recovery ${formatTime(seconds)}`:''}</p>
 <CardioMetrics type={type} value={value} fields={FIELDS[type].filter(k=>['distance','durationSeconds','paceSeconds'].includes(k))} onChange={v=>edit(j,{...v,completed:v.durationSeconds>0||v.distance>0})}/>
 {j>0&&<button type="button" className="text-button copy-interval" onClick={()=>onChange(sets.map((v,k)=>k===j?copyPreviousActual(sets[j-1],value):v))}>Copy previous actual results</button>}
 <details><summary>Power, cadence, calories, RPE & recovery</summary><CardioMetrics type={type} value={value} fields={[...extra,'rpe']} onChange={v=>edit(j,v)}/><label className="field"><span>Actual recovery (M:SS, optional)</span><TimeInput value={value.recoverySeconds} onChange={v=>edit(j,{recoverySeconds:v})}/></label>{seconds>0&&<RecoveryTimer seconds={seconds}/>}</details>
 </section>;})}</div>;
}
