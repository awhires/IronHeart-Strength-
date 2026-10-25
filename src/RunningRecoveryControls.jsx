import React,{useState} from 'react';
import NumericInput from './NumericInput.jsx';
import CardioMetrics from './CardioMetrics.jsx';
import {intervalSegments} from '../shared/cardio-structure.mjs';
import {applyRunningRecovery,suggestedRecoverySeconds} from '../shared/running-interval-presets.mjs';
import {formatTime} from '../shared/time.mjs';

export default function RunningRecoveryControls({block,index,trackingType,onChange,onError}){
 const [custom,setCustom]=useState('');
 const segments=intervalSegments(block),duration=segments.length===1?segments[0].metrics.durationSeconds:null;
 let suggested=null;try{if(duration>0&&custom!=='')suggested=suggestedRecoverySeconds(duration,Number(custom));}catch{}
 const apply=rule=>{try{onChange(applyRunningRecovery(block,rule));onError('');}catch(e){onError(e.message);}};
 return <>
  <details className="prescription-details"><summary>Work-to-recovery suggestion</summary><p className="footnote">Choose a ratio to apply it. Each interval block can have a different work duration. Use separate blocks for mixed work durations.</p><div className="row spread"><span>Threshold · 1:0.75{duration>0?` · ${formatTime(duration)} work → ${formatTime(suggestedRecoverySeconds(duration,0.75))} recovery`:''}</span><button type="button" className="btn secondary" disabled={!(duration>0)||segments.length!==1} onClick={()=>apply({preset:'threshold'})}>Use threshold ratio</button></div><label className="field"><span>Custom recovery per 1 unit of work</span><NumericInput aria-label={`Custom recovery ratio block ${index+1}`} min="0" max="10" step="any" value={custom} onChange={setCustom}/></label>{suggested!=null&&<p className="footnote">Suggested recovery: {formatTime(suggested)}</p>}<button type="button" className="btn secondary" disabled={!(duration>0)||segments.length!==1||suggested==null} onClick={()=>apply({preset:'custom',recoveryPerWork:Number(custom)})}>Use custom ratio</button>{block.recoveryRule&&<p className="footnote">Applied: {block.recoveryRule.preset==='threshold'?'Threshold':'Custom'} 1:{block.recoveryRule.recoveryPerWork}. You may edit the recovery below.</p>}</details>
  {trackingType==='running'&&<details className="prescription-details"><summary>Recovery pace (optional)</summary><p className="footnote">Recovery pace is separate from work pace.</p><CardioMetrics calculate={false} type="running" fields={['paceSeconds']} value={block.recovery||{}} onChange={recovery=>onChange({...block,recovery})}/></details>}
 </>;
}
