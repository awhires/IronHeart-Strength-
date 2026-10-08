import React from 'react';
import {calculatedCardioMetrics} from '../shared/cardio-prescriptions.mjs';
import {FIELDS,convertDistance} from '../shared/tracking.mjs';
import TimeInput from './TimeInput.jsx';
export default function CardioMetrics({value,type,onChange,fields}){
 const keys=fields||[...FIELDS[type],'rpe'];
 const unit=value.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 const paceUnit=type==='running'?(value.paceUnit||(['mi','km'].includes(unit)?unit:'km')):unit;
 const edit=(k,v)=>onChange(calculatedCardioMetrics({...value,...(type==='running'?{paceUnit}:{}),[k]:v},type));
 const names={durationSeconds:'Duration (M:SS)',paceSeconds:`Pace (M:SS / ${type==='erg'?'500 m':type==='swimming'?`100 ${unit==='yd'?'yd':'m'}`:paceUnit})`,distance:'Distance',speedMph:'Speed (mph)',watts:'Power (W)',cadence:type==='running'?'Cadence (steps/min)':type==='erg'?'Cadence (strokes/min)':'Cadence (RPM)',calories:'Calories',level:'Level',incline:'Incline (%)',rpe:'RPE (optional)'};
 return <div className="metric-grid">{keys.map(k=><label className="field" key={k}><span>{names[k]||k}</span>{['durationSeconds','paceSeconds'].includes(k)?<TimeInput value={value[k]} onChange={v=>edit(k,v)}/>:<input type="number" min={k==='rpe'?1:0} max={k==='rpe'?10:undefined} step="any" value={value[k]??''} onChange={e=>edit(k,e.target.value===''?null:Number(e.target.value))}/>}</label>)}
 {keys.includes('distance')&&<label className="field"><span>Distance unit</span><select value={unit} onChange={e=>{const next=e.target.value;onChange(calculatedCardioMetrics({...value,distanceUnit:next,...(value.distance!=null?{distance:convertDistance(Number(value.distance),unit,next)}:{}),...(type==='running'?{paceUnit}:{}),...(value.paceSeconds!=null&&type==='swimming'?{paceSeconds:convertDistance(Number(value.paceSeconds),next==='yd'?'yd':'m',unit==='yd'?'yd':'m')}:{})},type));}}>{['mi','km','m','yd'].map(u=><option key={u}>{u}</option>)}</select></label>}
 {type==='running'&&keys.includes('paceSeconds')&&<label className="field"><span>Pace unit</span><select value={paceUnit} onChange={e=>{const next=e.target.value;onChange(calculatedCardioMetrics({...value,paceUnit:next,...(value.paceSeconds!=null?{paceSeconds:convertDistance(value.paceSeconds,next,paceUnit)}:{})},type));}}><option value="mi">min/mi</option><option value="km">min/km</option></select></label>}</div>;
}
