import React from 'react';
import NumericInput from './NumericInput.jsx';
import TimeInput from './TimeInput.jsx';
export default function MovementMetrics({type,value,onChange,prefix=''}){
 const edit=(key,v)=>onChange({...value,[key]:v});
 return <div className="form-grid">{type!=='timed'&&<label className="field"><span>Load</span><NumericInput aria-label={prefix+'Load'} required min="0" max="1200" step="any" value={value.load??''} onChange={v=>edit('load',v)}/><select aria-label={prefix+'Load unit'} value={value.loadUnit||'lbs'} onChange={e=>edit('loadUnit',e.target.value)}><option value="lbs">lb</option><option value="kg">kg</option></select></label>}{type==='carry'&&<label className="field"><span>Distance</span><NumericInput aria-label={prefix+'Distance'} required min="0.01" max="1000000" step="any" value={value.distance??''} onChange={v=>edit('distance',v)}/><select aria-label={prefix+'Distance unit'} value={value.distanceUnit||'m'} onChange={e=>edit('distanceUnit',e.target.value)}>{['m','yd','km','mi'].map(u=><option key={u}>{u}</option>)}</select></label>}<label className="field"><span>Duration (M:SS){type==='carry'?' · optional':''}</span><TimeInput aria-label={prefix+'Duration (M:SS)'} required={type!=='carry'} value={value.durationSeconds} onChange={v=>edit('durationSeconds',v)}/></label></div>;
}
