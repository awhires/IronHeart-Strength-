import React,{useState} from 'react';

import PrescriptionEditor from './PrescriptionEditor.jsx';

import ExercisePicker from './ExercisePicker.jsx';

import TimeInput from './TimeInput.jsx';

import {BLOCK_TYPES,SCORE_TYPES,newMetcon,scoreFields} from '../shared/workout-blocks.mjs';

import {formatTime} from '../shared/time.mjs';

import {newPrescription} from '../shared/prescriptions.mjs';

export function MetconEditor({value:m,onChange,exercises}){

 const [picker,setPicker]=useState(false),[scheme,setScheme]=useState((m.repScheme||[]).join('-'));

 const set=(k,v)=>onChange({...m,[k]:v});

 return <div className="metcon-editor"><div className="form-grid"><label className="field"><span>Workout / benchmark name</span><input required value={m.name} onChange={e=>set('name',e.target.value)} placeholder="Annie or your custom workout"/></label><label className="field"><span>Score type</span><select aria-label="Score type" value={m.scoreType} onChange={e=>set('scoreType',e.target.value)}>{SCORE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><label className="field"><span>Shared rep scheme (optional)</span><input value={scheme} placeholder="50-40-30-20-10" onChange={e=>{const v=e.target.value;setScheme(v);const valid=!v||/^\d+(?:-\d+)*$/.test(v);e.target.setCustomValidity(valid?'':'Use reps separated by hyphens.');if(valid)set('repScheme',v?v.split('-').map(Number):[]);}}/></label><label className="field"><span>Rounds (optional)</span><input type="number" min="1" value={m.rounds??''} onChange={e=>set('rounds',e.target.value?Number(e.target.value):null)}/></label>{[['durationSeconds','Duration'],['timeCapSeconds','Time cap'],['workSeconds','Work interval'],['restSeconds','Rest interval']].map(([k,t])=><label key={k} className="field"><span>{t} (M:SS)</span><TimeInput value={m[k]} onChange={v=>set(k,v)}/></label>)}</div>

 {(m.movements||[]).map((v,i)=><section className="set-block" key={i}><div className="row spread"><strong>{v.exerciseName||exercises.find(e=>e.id===v.exerciseId)?.name}</strong><button type="button" className="btn secondary" onClick={()=>set('movements',m.movements.filter((_,n)=>n!==i))}>Remove movement</button></div><div className="metric-grid">{[['reps','Reps'],['distance','Distance'],['calories','Calories'],['load','Prescribed load'],...(m.scoreType==='EMOM'?[['minute','Minute in cycle']]:[])].map(([k,t])=><label className="field" key={k}><span>{t} (optional)</span><input type="number" min="0" step={['load','distance'].includes(k)?'any':1} value={v[k]??''} onChange={e=>set('movements',m.movements.map((x,n)=>n===i?{...x,[k]:e.target.value===''?null:Number(e.target.value)}:x))}/></label>)}{[['distanceUnit',['m','km','mi','yd']],['loadUnit',['lbs','kg']]].map(([k,units])=><label className="field" key={k}><span>{k==='distanceUnit'?'Distance unit':'Load unit'}</span><select value={v[k]||units[0]} onChange={e=>set('movements',m.movements.map((x,n)=>n===i?{...x,[k]:e.target.value}:x))}>{units.map(u=><option key={u}>{u}</option>)}</select></label>)}</div><label className="field"><span>Movement notes / suggested scaling</span><input value={v.notes||''} onChange={e=>set('movements',m.movements.map((x,n)=>n===i?{...x,notes:e.target.value}:x))}/></label><details><summary>Coach substitution options</summary><label className="field"><span>One substitute name per line (athlete can adjust targets)</span><textarea defaultValue={(v.scalingOptions||[]).map(o=>o.exerciseName).join('\n')} onBlur={e=>set('movements',m.movements.map((x,n)=>n===i?{...x,scalingOptions:e.target.value.split('\n').filter(x=>x.trim()).map(name=>({exerciseId:exercises.find(e=>e.name.toLowerCase()===name.trim().toLowerCase())?.id||null,exerciseName:name.trim()}))}:x))}/></label></details></section>)}

 <button type="button" className="btn secondary" onClick={()=>setPicker(!picker)}>+ Add movement from library</button>{picker&&<ExercisePicker exercises={exercises} onClose={()=>setPicker(false)} onSelect={e=>{set('movements',[...m.movements,{exerciseId:e.id,exerciseName:e.name,distanceUnit:'m',loadUnit:'lbs'}]);setPicker(false);}}/>}<label className="field"><span>Workout instructions / scaling</span><textarea value={m.notes||''} onChange={e=>set('notes',e.target.value)}/></label></div>;

}

const movementText=v=>[v.minute?`Minute ${v.minute}:`:null,v.repScheme?.length?v.repScheme.join('-'):v.reps,v.exerciseName,v.distance!=null?`${v.distance} ${v.distanceUnit}`:null,v.calories!=null?`${v.calories} calories`:null,v.load!=null?`@ ${v.load} ${v.loadUnit}`:null].filter(v=>v!=null&&v!=='').join(' ');

export function MetconSummary({metcon:m,score}){return <div className="metcon-summary metcon-whiteboard"><span className="metcon-kicker">{m.scoreType}</span><h3>{m.name}</h3><div className="metcon-scheme">{m.repScheme?.join(' – ')}</div><p>{[m.rounds?`${m.rounds} rounds`:null,m.durationSeconds?formatTime(m.durationSeconds):null,m.timeCapSeconds?`Cap ${formatTime(m.timeCapSeconds)}`:null,m.workSeconds?`Work ${formatTime(m.workSeconds)} / rest ${formatTime(m.restSeconds||0)}`:null].filter(Boolean).join(' · ')}</p>{score?.performedMovements&&<small>Programmed</small>}<ul>{m.movements.map((v,i)=><li key={i}>{movementText(v)}{v.notes&&<small>{v.notes}</small>}</li>)}</ul>{score?.performedMovements&&<><small>Performed · {score.rx}</small><ul>{score.performedMovements.map((v,i)=><li key={i}>{movementText(v)}</li>)}</ul></>}{m.notes&&<p>{m.notes}</p>}</div>;}

function MovementScaling({metcon,score,onChange,exercises=[]}){

 const [open,setOpen]=useState(null),[picker,setPicker]=useState(false);

 const actual=score.performedMovements||metcon.movements.map(({scalingOptions,...v})=>({loadUnit:'lbs',distanceUnit:'m',...v}));

 const edit=(i,patch)=>onChange({...score,rx:score.rx==='Modified'?'Modified':'Scaled',performedMovements:actual.map((v,n)=>n===i?{...v,...patch}:v)});

 return <div className="metcon-scaling"><small>Tap a movement to scale or substitute</small>{metcon.movements.map((v,i)=><div key={i}><button type="button" className="metcon-movement" onClick={()=>{setOpen(open===i?null:i);setPicker(false);}}>{movementText(actual[i])}<small>Scale / substitute</small></button>{open===i&&<section className="panel"><p>Programmed: {movementText(v)}</p>{v.scalingOptions?.map((o,n)=><button key={n} type="button" className="btn secondary" onClick={()=>edit(i,o)}>{movementText(o)}</button>)}<button type="button" className="btn secondary" onClick={()=>setPicker(!picker)}>Choose substitute from library</button>{picker&&<ExercisePicker exercises={exercises} onClose={()=>setPicker(false)} onSelect={e=>{edit(i,{exerciseId:e.id,exerciseName:e.name});setPicker(false);}}/>}<label className="field"><span>Performed movement / custom substitute</span><input value={actual[i].exerciseName} onChange={e=>edit(i,{exerciseId:null,exerciseName:e.target.value})}/></label><div className="form-grid">{['reps','load','distance','calories'].filter(k=>k==='reps'?!metcon.repScheme?.length:actual[i][k]!=null).map(k=><label key={k} className="field"><span>Actual {k}</span><input type="number" min="0" step="any" value={actual[i][k]??''} onChange={e=>edit(i,{[k]:e.target.value===''?null:Number(e.target.value)})}/></label>)}{actual[i].load!=null&&<label className="field"><span>Actual load unit</span><select value={actual[i].loadUnit||'lbs'} onChange={e=>edit(i,{loadUnit:e.target.value})}><option>lbs</option><option>kg</option></select></label>}{actual[i].distance!=null&&<label className="field"><span>Actual distance unit</span><select value={actual[i].distanceUnit||'m'} onChange={e=>edit(i,{distanceUnit:e.target.value})}>{['m','km','mi','yd'].map(u=><option key={u}>{u}</option>)}</select></label>}{metcon.repScheme?.length>0&&<label className="field"><span>Performed rep scheme</span><input defaultValue={(actual[i].repScheme||metcon.repScheme).join('-')} onBlur={e=>{if(/^\d+(?:-\d+)*$/.test(e.target.value))edit(i,{repScheme:e.target.value.split('-').map(Number)});}}/></label>}</div><details><summary>Add a load, distance or calorie change</summary><div className="form-grid">{['load','distance','calories'].filter(k=>actual[i][k]==null).map(k=><label className="field" key={k}><span>Actual {k}</span><input type="number" min="0" step="any" onBlur={e=>edit(i,{[k]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div></details><button type="button" className="btn secondary" onClick={()=>edit(i,{...v,load:v.load??null,distance:v.distance??null,calories:v.calories??null,reps:v.reps??null,repScheme:metcon.repScheme})}>Reset to programmed movement</button></section>}</div>)}</div>;

}

export function MetconScoreEditor({metcon,score,onChange,exercises}){

 const set=(k,v)=>onChange({...score,[k]:v});

 return <><MovementScaling metcon={metcon} score={score} onChange={onChange} exercises={exercises}/><div className="metric-grid">{scoreFields(metcon.scoreType,metcon.timeCapSeconds).filter(k=>!(score.completed===false&&k==='timeSeconds')&&!(['rounds','reps'].includes(k)&&score.completed===true&&metcon.scoreType!=='AMRAP'&&metcon.scoreType!=='Rounds + Reps')).map(k=><label className="field" key={k}><span>{({timeSeconds:'Completion time (M:SS)',rounds:'Completed rounds',reps:'Additional reps',successfulMinutes:metcon.scoreType==='Intervals'?'Successful intervals':'Successful minutes',completed:'Completed?',load:'Actual load'})[k]}</span>{k==='timeSeconds'?<TimeInput value={score[k]} onChange={v=>set(k,v)} required={['For Time','Rounds for Time'].includes(metcon.scoreType)&&score.completed!==false}/>:k==='completed'?<select value={score[k]===undefined?'':String(score[k])} required onChange={e=>set(k,e.target.value==='true')}><option value="">Choose</option><option value="true">Completed</option><option value="false">Failed / capped</option></select>:<input type="number" min="0" step={k==='load'?'any':1} value={score[k]??''} onChange={e=>set(k,e.target.value===''?null:Number(e.target.value))}/>}</label>)}{scoreFields(metcon.scoreType).includes('load')&&<label className="field"><span>Actual load unit</span><select value={score.loadUnit||'lbs'} onChange={e=>set('loadUnit',e.target.value)}><option>lbs</option><option>kg</option></select></label>}<label className="field"><span>RX / scaled</span><select required value={score.rx||''} onChange={e=>set('rx',e.target.value)}><option value="">Choose</option><option>RX</option><option>Scaled</option><option>Modified</option></select></label><label className="field"><span>Result notes / exact scaling</span><textarea maxLength={2000} value={score.notes||''} onChange={e=>set('notes',e.target.value)}/></label></div></>;

}

export default function SessionBlocksEditor({session,onChange,exercises}){

 const [nextType,setNextType]=useState('Strength');

 const blocks=session.blocks||[{id:'legacy-strength',type:'Strength',exerciseIndexes:session.exercises.map((_,i)=>i)}];

 function updateBlock(index,items,patch={}){

  const all=[],next=blocks.map((b,i)=>{if(b.type==='Metcon')return i===index?{...b,...patch}:b;const selected=i===index?items:b.exerciseIndexes.map(n=>session.exercises[n]);const start=all.length;all.push(...selected);return {...b,...(i===index?patch:{}),exerciseIndexes:selected.map((_,n)=>start+n)};});onChange({...session,exercises:all,blocks:next});

 }

 function remove(index){const all=[],next=blocks.filter((_,i)=>i!==index).map(b=>{if(b.type==='Metcon')return b;const start=all.length;all.push(...b.exerciseIndexes.map(n=>session.exercises[n]));return {...b,exerciseIndexes:b.exerciseIndexes.map((_,n)=>start+n)};});onChange({...session,exercises:all,blocks:next});}

 return <><div className="workout-blocks">{blocks.map((b,i)=><section className="set-block" key={b.id}><div className="row spread"><h3>Block {i+1} · {b.type}</h3>{blocks.length>1&&<button type="button" className="btn secondary" onClick={()=>remove(i)}>Delete block</button>}</div>{b.type==='Metcon'?<MetconEditor value={b.metcon} exercises={exercises} onChange={metcon=>updateBlock(i,[],{metcon})}/>:<><label className="field"><span>Block type</span><select value={b.type} onChange={e=>updateBlock(i,b.exerciseIndexes.map(n=>session.exercises[n]),{type:e.target.value})}>{BLOCK_TYPES.filter(t=>t!=='Metcon').map(t=><option key={t}>{t}</option>)}</select></label><PrescriptionEditor items={b.exerciseIndexes.map(n=>session.exercises[n])} exercises={exercises} onChange={items=>updateBlock(i,items)}/></>}</section>)}</div><div className="row"><label className="field"><span>New block type</span><select aria-label="New block type" value={nextType} onChange={e=>setNextType(e.target.value)}>{BLOCK_TYPES.map(t=><option key={t}>{t}</option>)}</select></label><button type="button" className="btn secondary" onClick={()=>onChange({...session,blocks:[...blocks,{id:crypto.randomUUID(),type:nextType,...(nextType==='Metcon'?{metcon:newMetcon()}:{exerciseIndexes:[]})}]})}>+ Add workout block</button></div></>;

}
