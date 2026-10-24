import React from 'react';
import NumericInput from './NumericInput.jsx';
import {LOAD_MODE as L,LOAD_UNIT} from '../shared/ai/contract.mjs';
import {LOAD_METHOD_OPTIONS,loadModePatch} from '../shared/load-methods.mjs';
import {defaultIncrement} from '../shared/prescriptions.mjs';
import {trackingProfile} from '../shared/tracking.mjs';

// Shared coach control for ordinary and duration-based strength prescriptions.
export default function LoadMethodEditor({value,exercises,onPatch,prefix='Exercise',renderField,
  movement=false,showDirectFixed=true}){
  const e=value,mode=e.loadMode||L.ATHLETE_SELECTED;
  const field=(name,path,child)=>renderField?renderField(`${prefix} ${name}`,path,child):
    <label className="field"><span>{name}</span>{React.cloneElement(child,{'aria-label':name==='Reference Exercise'?`${name} ${prefix.replace(/^Exercise /,'')}`:`${name} ${prefix.replace(/^Exercise /,'exercise ')}`})}</label>;
  const numeric=(name,path,current,onChange,props={})=>field(name,path,<NumericInput value={current??''} onChange={onChange} {...props}/>);
  const load=movement?e.metrics?.load:e.load;
  const setLoad=v=>onPatch(movement?{metrics:{...e.metrics,load:v}}:{load:v});
  const referenceId=e.referenceExerciseId||e.reference1RM?.exerciseId||(!movement?e.exerciseId:'')||'';
  return <div className="load-method-fields">
    {field('Load Method','loadMode',<select value={mode} onChange={event=>onPatch(loadModePatch(e,event.target.value,{movement}))}>
      {LOAD_METHOD_OPTIONS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select>)}
    {(mode===L.FIXED&&showDirectFixed||mode===L.BODYWEIGHT)&&numeric(mode===L.BODYWEIGHT?'Added external load (optional)':'Prescribed load',movement?'metrics/load':'load',load,setLoad,{min:0,max:1200,step:'any'})}
    {[L.FIXED,L.BODYWEIGHT,L.PERCENTAGE,L.PREVIOUS_PERFORMANCE].includes(mode)&&field('Weight unit',movement?'metrics/loadUnit':'loadUnit',<select value={movement?e.metrics?.loadUnit||e.loadUnit||'lbs':e.loadUnit||'lbs'} onChange={event=>{
      const unit=event.target.value,old=e.metrics?.loadUnit||e.loadUnit||'lbs';onPatch(movement?{metrics:{...e.metrics,loadUnit:unit},increment:e.increment==null||e.increment===defaultIncrement(old)?defaultIncrement(unit):e.increment}:{loadUnit:unit,increment:e.increment===defaultIncrement(old)?defaultIncrement(unit):e.increment});
    }}>{Object.values(LOAD_UNIT).map(unit=><option key={unit} value={unit}>{unit}</option>)}</select>)}
    {mode===L.PERCENTAGE&&<>
      {numeric('Percentage','percent1RM',e.percent1RM,v=>onPatch({percent1RM:v}),{min:1,max:100,step:'any'})}
      {field('Reference Exercise','referenceExerciseId',<select value={referenceId} onChange={event=>{
        const ref=exercises.find(x=>x.id===event.target.value);onPatch({referenceExerciseId:ref?.id??null,referenceExerciseName:ref?.name??null,reference1RM:e.reference1RM?.exerciseId===ref?.id?e.reference1RM:null});
      }}><option value="">Choose reference lift</option>{exercises.filter(x=>trackingProfile(x)==='strength').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>)}
      <p className="footnote">Without a qualifying maximum, the athlete sees the percentage but no invented weight.</p>
    </>}
    {mode===L.PREVIOUS_PERFORMANCE&&<>
      {numeric('Change from previous performance', 'loadDelta',e.loadDelta,v=>onPatch({loadDelta:v}),{min:-200,max:200,step:'any'})}
      <p className="footnote">Positive or negative change from the most recent qualifying completed set for this exercise. If none exists, the athlete chooses a load.</p>
    </>}
    {[L.PERCENTAGE,L.PREVIOUS_PERFORMANCE].includes(mode)&&numeric('Rounding step','increment',e.increment??defaultIncrement(e.metrics?.loadUnit||e.loadUnit),v=>onPatch({increment:v}),{min:.25,max:25,step:.25})}
    {mode===L.BODYWEIGHT&&<p className="footnote">Bodyweight is the base. Added load is optional and stays separate from body mass.</p>}
    {mode===L.ATHLETE_SELECTED&&<p className="footnote">The athlete selects the actual weight when logging.</p>}
    {mode===L.NONE&&<p className="footnote">No weight target is prescribed.</p>}
  </div>;
}
