import React,{useState} from 'react';
import NumericInput from './NumericInput.jsx';
import TimeInput from './TimeInput.jsx';
import './repeated-set-logger.css';

const blankFor=(type,bodyweight=false)=>({load:bodyweight?0:'',loadUnit:'lbs',reps:'',rpe:'',durationSeconds:'',distance:'',distanceUnit:'m',completed:false});
function Fields({type,value,onChange,prefix='',bodyweight=false,disabled=false,requiredFields=true}){
 const field=(key,label,props={})=>{const {required=false,...inputProps}=props;return <label className="field" key={key}><span>{label}</span><NumericInput aria-label={`${prefix}${label}`} value={value[key]??''} min={key==='reps'?0:key==='rpe'?1:0} max={key==='rpe'?10:undefined} step={key==='rpe'?'.5':key==='reps'?1:'any'} disabled={disabled} onChange={v=>onChange({...value,[key]:v})} required={requiredFields&&required} {...inputProps}/></label>;};
 return <div className="repeated-set-fields">
  {!bodyweight&&type!=='timed'&&<label className="field"><span>Load</span><NumericInput aria-label={`${prefix}Load`} value={value.load??''} min="0" max="1200" step="any" required={requiredFields&&(type==='strength'||type==='loadedTimed'||type==='carry')} disabled={disabled} onChange={v=>onChange({...value,load:v})}/><select aria-label={`${prefix}Load unit`} value={value.loadUnit||'lbs'} disabled={disabled} onChange={e=>onChange({...value,loadUnit:e.target.value})}><option value="lbs">lb</option><option value="kg">kg</option></select></label>}
  {type==='strength'&&<>{field('reps','Reps',{required:true})}{field('rpe','RPE (optional)')}</>}
  {['timed','loadedTimed'].includes(type)&&<label className="field"><span>Duration (M:SS)</span><TimeInput aria-label={`${prefix}Duration (M:SS)`} required={requiredFields} value={value.durationSeconds} disabled={disabled} onChange={v=>onChange({...value,durationSeconds:v})}/></label>}
  {type==='carry'&&<>{field('distance','Distance',{required:true,min:'0.01',max:'1000000'})}<label className="field"><span>Distance unit</span><select aria-label={`${prefix}Distance unit`} value={value.distanceUnit||'m'} disabled={disabled} onChange={e=>onChange({...value,distanceUnit:e.target.value})}>{['m','yd','km','mi'].map(x=><option key={x}>{x}</option>)}</select></label>{field('durationSeconds','Duration (seconds)')}</>}
  {type==='loadedTimed'&&field('rpe','RPE (optional)')}
 </div>;
}

export default function RepeatedSetLogger({name,type,sets=[],onChange,targetCount=1,quickDefaults={},quickEligible=true,bodyweight=false,prefix='',forceIndividual=false}){
 const actualCount=Math.max(0,sets.filter(s=>s.completed===true).length);
 const [count,setCount]=useState(actualCount||targetCount||1),[quick,setQuick]=useState(()=>({...blankFor(type,bodyweight),...quickDefaults,...(sets.find(s=>s.completed)?.completed?sets.find(s=>s.completed):{})}));
 const [individualOpen,setIndividualOpen]=useState(forceIndividual),[individualEdited,setIndividualEdited]=useState(false),[confirmReplace,setConfirmReplace]=useState(false),[quickError,setQuickError]=useState('');
 const canQuick=quickEligible&&targetCount>1;
 const changeRow=(index,next)=>{setIndividualEdited(true);setConfirmReplace(false);onChange(sets.map((s,i)=>i===index?{...s,...next}:s),{actualSetGroups:true});};
 const apply=()=>{
  if((type==='strength'&&(quick.reps==null||quick.reps===''||!Number.isInteger(Number(quick.reps))))||(['timed','loadedTimed'].includes(type)&&!(Number(quick.durationSeconds)>0))||(!bodyweight&&type!=='timed'&&(quick.load==null||quick.load===''))||(type==='carry'&&!(Number(quick.distance)>0))){setQuickError('Enter the actual weight, reps or duration for the sets you completed.');return;}
  if(!Number.isInteger(Number(count))||Number(count)<1||Number(count)>targetCount){setQuickError(`Choose 1–${targetCount} completed sets.`);return;}
  if(individualEdited&&!confirmReplace){setConfirmReplace(true);return;}
  const rows=Array.from({length:Number(count)},(_,prescriptionIndex)=>({...quick,prescriptionIndex,completed:true,...(bodyweight?{load:0,loadUnit:'lbs'}:{})}));
  onChange(rows,{actualSetGroups:true});setIndividualEdited(false);setConfirmReplace(false);setQuickError('');setIndividualOpen(false);
 };
 const addSet=()=>{if(sets.length>=Math.min(30,targetCount||30))return;const occupied=new Set(sets.map((s,i)=>s.prescriptionIndex??i));const prescriptionIndex=Array.from({length:targetCount||30},(_,i)=>i).find(i=>!occupied.has(i))??sets.length;onChange([...sets,{...blankFor(type,bodyweight),prescriptionIndex}],{actualSetGroups:true});setIndividualOpen(true);};
 const toggleCompleted=(index,checked)=>changeRow(index,{completed:checked});
 return <section className="repeated-set-logger" aria-label={`${name} set logging`}>
  {canQuick&&<div className="repeated-set-quick"><div className="repeated-set-quick-heading"><strong>Log identical sets</strong><small>Suggested values need your confirmation.</small></div><label className="field"><span>Sets completed</span><NumericInput aria-label={`${name} Sets completed`} min="1" max={targetCount} step="1" value={count} onChange={v=>{if(v!=null)setCount(v);}}/></label><Fields type={type} value={quick} onChange={setQuick} prefix={`${name} `} bodyweight={bodyweight} requiredFields={false}/><button type="button" className="btn secondary" onClick={apply}>{confirmReplace?'Confirm replace all sets':'Apply to All Sets'}</button>{quickError&&<small role="alert">{quickError}</small>}{confirmReplace&&<small role="alert">This replaces individually edited set values. Press again to confirm.</small>}</div>}
  <details className="repeated-set-individual" open={individualOpen||!canQuick||undefined} onToggle={e=>setIndividualOpen(e.currentTarget.open)}>
   <summary>{canQuick?'Edit Individual Sets':'Individual Sets'} <small>{actualCount} completed · {sets.length} rows</small></summary>
   {sets.map((row,index)=><article className="repeated-set-row" key={index}><label className="checkbox-field"><input type="checkbox" aria-label={`Set ${index+1} completed`} checked={row.completed===true} onChange={e=>toggleCompleted(index,e.target.checked)}/><strong>Set {index+1} completed</strong></label><Fields type={type} value={row} onChange={next=>changeRow(index,next)} prefix={`${prefix}${index+1} `} bodyweight={bodyweight} disabled={!row.completed}/></article>)}
   {targetCount>1&&sets.length<targetCount&&<button type="button" className="text-button" onClick={addSet}>+ Add set</button>}
  </details>
 </section>;
}
