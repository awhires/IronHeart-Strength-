import React from 'react';
import {RUNNING_PACE_SOURCES,RUNNING_PACE_CATEGORIES} from '../shared/running-pace-method.mjs';
import {resolveAutomaticRunningPace,withoutAutomaticPace} from '../shared/automatic-running-pace.mjs';
import {formatTime} from '../shared/time.mjs';
import {trackingProfile} from '../shared/tracking.mjs';

export default function RunningPaceMethodEditor({item,context,exercises,onChange}){
 const rule=item.paceMethod||{type:'fixed'},automatic=rule.type==='assessment';
 const trials=(context?.definitions||[]).filter(definition=>definition.scoring?.type==='fastest_time'&&trackingProfile(exercises.find(exercise=>exercise.id===definition.scoring.exerciseId))==='running');
 const update=patch=>{const nextRule={...rule,...patch},normalized=nextRule.type==='assessment'?withoutAutomaticPace({...item,paceMethod:nextRule}):{...item,paceMethod:{type:'fixed'},paceRecommendation:undefined};onChange(normalized);};
 const preview=automatic&&context?.athleteId?resolveAutomaticRunningPace(item,{logs:context.logs,definitions:context.definitions,library:exercises,athleteId:context.athleteId}):null;
 return <section className="prescription-details" aria-label="Running pace method">
  <label className="field"><span>Pace method</span><select aria-label="Pace method" value={rule.type} onChange={e=>update(e.target.value==='assessment'?{type:'assessment',source:'six_minute',category:'threshold',unit:item.metrics?.paceUnit||'mi'}:{type:'fixed'})}><option value="fixed">Fixed Pace</option><option value="assessment">Assessment-Based Pace</option></select></label>
  {automatic&&<><div className="form-grid"><label className="field"><span>Assessment source</span><select aria-label="Assessment source" value={rule.source} onChange={e=>update({source:e.target.value,category:e.target.value==='six_minute'?'threshold':'observed',...(e.target.value==='benchmark'?{benchmarkId:trials[0]?.id}:{})})}>{Object.entries(RUNNING_PACE_SOURCES).map(([key,name])=><option key={key} value={key} disabled={key==='benchmark'&&!trials.length}>{name}</option>)}</select></label>{rule.source==='benchmark'&&<label className="field"><span>Running benchmark</span><select aria-label="Running benchmark" value={rule.benchmarkId||''} onChange={e=>update({benchmarkId:e.target.value})}>{trials.map(definition=><option key={definition.id} value={definition.id}>{definition.name} · {definition.scoring.distanceMeters} m</option>)}</select></label>}<label className="field"><span>Training pace category</span><select aria-label="Training pace category" value={rule.category} onChange={e=>update({category:e.target.value})}>{Object.entries(RUNNING_PACE_CATEGORIES).filter(([key])=>rule.source==='six_minute'?key!=='observed':key==='observed').map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label className="field"><span>Assessment pace unit</span><select aria-label="Assessment pace unit" value={rule.unit} onChange={e=>update({unit:e.target.value})}><option value="mi">min/mi</option><option value="km">min/km</option></select></label></div>
   <p className="footnote">The coach authorizes this method once. Future qualifying results update uncompleted athlete workouts. Fixed pace overrides remain available.</p>
   {preview?.paceRecommendation?.status==='recommended'?<p className="footnote">Current athlete target: {formatTime(preview.metrics.paceSeconds)} / {rule.unit} · {preview.paceRecommendation.method} · {preview.paceRecommendation.sourceDate}. This is an estimate from completed performance.</p>:<p className="footnote">{preview?.paceRecommendation?.reason||'Each athlete’s qualifying assessment is checked when the program is assigned.'}</p>}
   <button type="button" className="btn secondary" onClick={()=>onChange({...item,paceMethod:{type:'fixed'},paceRecommendation:undefined})}>Lock current pace as Fixed</button>
  </>}
 </section>;
}
