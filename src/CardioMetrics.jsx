import React from 'react';
import {calculatedCardioMetrics} from '../shared/cardio-prescriptions.mjs';
import {FIELDS,convertDistance} from '../shared/tracking.mjs';
import TimeInput from './TimeInput.jsx';
export default function CardioMetrics({value,type,onChange}){
 const edit=(k,v)=>onChange(calculatedCardioMetrics({...value,[k]:v},type));
 const unit=value.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 return <div className="metric-grid">{[...FIELDS[type],'rpe'].map(k=><label className="field" key={k}><span>{({durationSeconds:'Duration (M:SS)',paceSeconds:`Pace (M:SS / ${type==='erg'?'500 m':type==='swimming'?`100 ${unit==='yd'?'yd':'m'}`:unit})`,distance:'Distance',speedMph:'Speed (mph)',watts:'Power (W)',cadence:'Cadence (RPM)',calories:'Calories',level:'Level',incline:'Incline (%)',rpe:'RPE (optional)'})[k]||k}</span>{['durationSeconds','paceSeconds'].includes(k)?<TimeInput value={value[k]} onChange={v=>edit(k,v)}/>:<input type="number" min="0" step="any" value={value[k]??''} onChange={e=>edit(k,e.target.value===''?null:Number(e.target.value))}/>}</label>)}{FIELDS[type].includes('distance')&&<label className="field"><span>Distance unit</span><select value={unit} onChange={e=>{const next=e.target.value;onChange({...value,distanceUnit:next,...(value.distance!=null?{distance:convertDistance(Number(value.distance),unit,next)}:{}),...(value.paceSeconds!=null&&type==='running'?{paceSeconds:convertDistance(Number(value.paceSeconds),next,unit)}:{}),...(value.paceSeconds!=null&&type==='swimming'?{paceSeconds:convertDistance(Number(value.paceSeconds),next==='yd'?'yd':'m',unit==='yd'?'yd':'m')}:{})});}}>{['mi','km','m','yd'].map(u=><option key={u}>{u}</option>)}</select></label>}</div>;
}
