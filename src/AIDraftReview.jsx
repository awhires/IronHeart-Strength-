import React,{useMemo,useState} from 'react';
import {CheckCircle2,AlertTriangle,ShieldCheck,FileJson,Sparkles} from 'lucide-react';
import {LOAD_MODE,EFFORT_MODE,LOAD_UNIT,DRAFT_STATUS,REFERENCE_TYPE,SEVERITY,DAYS,PROGRAM_LENGTHS,TEMPO_DESCRIPTION,parseOptionalNumber} from '../shared/ai/contract.mjs';
import {validateDraft,percentageLoad,estimateSessionMinutes} from '../shared/ai/validate.mjs';
import {createReview,editReview,approveReview,isApproved} from '../shared/ai/draft-state.mjs';
import {toIronHeartProgram} from '../shared/ai/convert.mjs';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import './ai-review.css';

const LOAD_LABELS={[LOAD_MODE.FIXED]:'Fixed weight',[LOAD_MODE.PERCENTAGE]:'Percentage of 1RM',[LOAD_MODE.BODYWEIGHT]:'Bodyweight',[LOAD_MODE.ATHLETE_SELECTED]:'Athlete selects weight'};
const EFFORT_LABELS={[EFFORT_MODE.NONE]:'Standard sets / reps',[EFFORT_MODE.RPE]:'RPE target',[EFFORT_MODE.RIR]:'RIR target'};
const STATUS_LABELS={[DRAFT_STATUS.DRAFT]:'Draft',[DRAFT_STATUS.NEEDS_REVIEW]:'Needs review',[DRAFT_STATUS.APPROVED]:'Approved revision'};
const lines=s=>s===''?[]:s.split('\n');

function Field({label,path,findings,children}){
  const own=findings.filter(f=>f.path===path||f.path.startsWith(path+'/'));
  const severity=own.some(f=>f.severity===SEVERITY.ERROR)?SEVERITY.ERROR:own.some(f=>f.severity===SEVERITY.WARNING)?SEVERITY.WARNING:'valid';
  return <label className={`ai-field ai-${severity}`}><span>{label}<small>{severity==='valid'?'✓':severity===SEVERITY.ERROR?'Error':'Review'}</small></span>{React.cloneElement(children,{'aria-label':label,'aria-invalid':severity===SEVERITY.ERROR})}{own.map(f=><small className="ai-field-message" key={f.code+f.path}>{f.message}</small>)}</label>;
}
function NumberInput({value,onChange,...props}){return <input type="number" value={value??''} onChange={e=>onChange(parseOptionalNumber(e.target.value))} {...props}/>;}

export default function AIDraftReview({exercises,coachId,request,onSaved,initialGeneration,onRegenerate}){
  const [review,setReview]=useState(()=>createReview(initialGeneration?.draft||createFixture())),[weekIndex,setWeekIndex]=useState(0),[fixture,setFixture]=useState('valid'),[warningsReviewed,setWarningsReviewed]=useState(false),[converted,setConverted]=useState(null),[actionError,setActionError]=useState(''),[receipt,setReceipt]=useState(null),[pending,setPending]=useState(false),[saved,setSaved]=useState(null);
  const requirements=initialGeneration?.requirements||FIXTURE_REQUIREMENTS;
  const draft=review.draft,p=draft.program;
  const validation=useMemo(()=>validateDraft(draft,exercises,requirements),[draft,exercises,requirements]);
  const approved=isApproved(review,exercises,requirements);
  const status=approved?DRAFT_STATUS.APPROVED:validation.counts.error||validation.counts.warning?DRAFT_STATUS.NEEDS_REVIEW:DRAFT_STATUS.DRAFT;
  const findings=validation.findings;
  const edit=fn=>{setReceipt(null);setSaved(null);setReview(r=>editReview(r,fn));setWarningsReviewed(false);setConverted(null);setActionError('');};
  const program=(key,value)=>edit(d=>{d.program[key]=value;});
  const session=(si,key,value)=>edit(d=>{d.program.plan[weekIndex].sessions[si][key]=value;});
  const exercise=(si,ei,key,value)=>edit(d=>{d.program.plan[weekIndex].sessions[si].exercises[ei][key]=value;});
  const reference=(si,ei,key,value)=>edit(d=>{d.program.plan[weekIndex].sessions[si].exercises[ei].reference1RM[key]=value;});
  const field=(label,path,child)=> <Field label={label} path={path} findings={findings}>{child}</Field>;
  const loadFixture=kind=>{setReceipt(null);setSaved(null);setFixture(kind);setReview(createReview(createFixture(kind)));setWeekIndex(0);setWarningsReviewed(false);setConverted(null);setActionError('');};
  const approve=async()=>{setPending(true);try{const next=approveReview(review,exercises,requirements,{coachId,warningsReviewed});const result=await request('ai/approve','POST',{review:next,requirements});setReview(next);setReceipt(result.receipt);setActionError('');}catch(e){setActionError(e.message);}finally{setPending(false);}};
  const save=async()=>{setPending(true);setActionError('');try{const result=await request('ai/programs','POST',{review,requirements,receipt});setSaved(result);await onSaved?.(result);}catch(e){setActionError(e.message);if(/Approval expired|exact draft revision/.test(e.message)){setReceipt(null);setReview(r=>({...r,approval:null,draft:{...r.draft,status:DRAFT_STATUS.NEEDS_REVIEW}}));}}finally{setPending(false);}};
  const convert=()=>{try{setConverted(toIronHeartProgram(review,exercises,requirements));setActionError('');}catch(e){setActionError(e.message);}};
  const w=p.plan[weekIndex];
  return <div className="ai-review"><fieldset disabled={pending} className="ai-review-controls">
    <div className="page-heading"><div><div className="eyebrow">IRON HEART · AI FOUNDATION</div><h1>AI Draft Review</h1><p>Review the plan. Make it yours. Approve only when it’s ready.</p></div><span className="badge">{initialGeneration?`AI DRAFT · ${initialGeneration.metadata.provider}`:'PRACTICE SAMPLE'}</span></div>
    <div className="ai-prototype-note"><Sparkles size={20}/><p>{initialGeneration?'This draft was generated by AI and needs your review.':'This is a practice sample.'} Unsaved edits disappear on refresh. Approval reviews this revision; Save as new program creates a template. Assignment is a separate action.</p></div>
    <section className="panel ai-summary" aria-label="Validation summary">
      <div className="ai-summary-top"><div><h2>{STATUS_LABELS[status]}</h2><p>Revision {review.revision}{approved?' · approved by you':' · awaiting coach approval'}</p></div><div className="ai-counts" aria-live="polite"><span className="ai-count error">{validation.counts.error} Errors</span><span className="ai-count warning">{validation.counts.warning} Warnings</span><span className="ai-count info">{validation.counts.info} Info</span></div></div>
      <p className="ai-summary-caption">Errors prevent approval. Warnings need your acknowledgement. Any edit invalidates approval.</p>
      {findings.length>0?<details className="ai-findings" open={validation.counts.error>0}><summary>View {findings.length} validation findings</summary><ul>{findings.map(f=><li className={`ai-${f.severity}`} key={f.code+f.path}><strong>{f.severity===SEVERITY.ERROR?'Error':f.severity===SEVERITY.WARNING?'Warning':'Info'} · {f.code}</strong><p>{f.message}</p><code>{f.path||'/'}</code>{f.suggestedResolution&&<small>{f.suggestedResolution}</small>}</li>)}</ul></details>:<p className="ai-valid-message"><CheckCircle2 size={17}/>The draft passes the structural and sample-request checks.</p>}
    </section>
    {!initialGeneration&&<div className="ai-sample-toolbar"><label className="field"><span>Sample draft</span><select aria-label="Sample draft" value={fixture} onChange={e=>loadFixture(e.target.value)}><option value="valid">Valid · four-day strength</option><option value="issues">Needs review · errors and warnings</option><option value="percentage">Percentage · reference maximum</option></select></label><small>Loading a sample replaces only this unsaved review draft.</small></div>}
    {initialGeneration&&<div className="ai-sample-toolbar"><button className="btn secondary" onClick={onRegenerate}>Regenerate Draft</button><small>{initialGeneration.metadata.model} · {new Date(initialGeneration.metadata.generatedAt).toLocaleString()} · {Math.round(initialGeneration.metadata.durationMs/1000)}s · New draft only; current review is preserved.</small></div>}
    <details className="panel ai-request"><summary>Original request and validation requirements</summary><p>{draft.originalRequest}</p><p><strong>Confirmed checks:</strong> {Object.keys(requirements).length?JSON.stringify(requirements):'None supplied. Compare the full request with the plan during review.'}</p><p>Frequencies count distinct training days. Duration is an estimate, including 10 minutes of warm-up, 2 minutes of setup per exercise, work, and between-set rest.</p></details>
    <section className="panel ai-program"><h2>Program</h2><div className="ai-fields">
      {field('Program name','/program/name',<input value={p.name} onChange={e=>program('name',e.target.value)}/>)}
      {field('Training goal','/program/goal',<input value={p.goal} onChange={e=>program('goal',e.target.value)}/>)}
      {field('Number of weeks','/program/weeks',<select value={p.weeks??''} onChange={e=>program('weeks',parseOptionalNumber(e.target.value))}><option value="">Not specified</option>{PROGRAM_LENGTHS.map(n=><option key={n} value={n}>{n} weeks</option>)}</select>)}
      {field('Program description','/program/description',<input value={p.description} onChange={e=>program('description',e.target.value)}/>)}
      {field('Program coach notes','/program/coachNotes',<textarea value={p.coachNotes} onChange={e=>program('coachNotes',e.target.value)}/>)}
      {field('Program progression instructions','/program/progressionInstructions',<textarea value={p.progressionInstructions} onChange={e=>program('progressionInstructions',e.target.value)}/>)}
      {field('Assumptions (one per line)','/assumptions',<textarea value={draft.assumptions.join('\n')} onChange={e=>edit(d=>{d.assumptions=lines(e.target.value);})}/>)}
      {field('Open questions (clear when resolved)','/questions',<textarea value={draft.questions.join('\n')} onChange={e=>edit(d=>{d.questions=lines(e.target.value);})}/>)}
    </div><p className="ai-help">Coach notes are workout instructions, not private notes. Changing block length does not invent or delete weeks. Regenerate with a clarified request or restore the original length to resolve a mismatch.</p></section>
    <div className="week-picker ai-week-picker" aria-label="Draft weeks">{p.plan.map((week,i)=><button key={i} type="button" className={weekIndex===i?'active':''} onClick={()=>setWeekIndex(i)}>Week {week.week}</button>)}</div>
    <h2 className="ai-week-title">Week {w.week} · Sessions</h2>
    {w.sessions.map((s,si)=>{const sp=`/program/plan/${weekIndex}/sessions/${si}`;return <section className="panel ai-session" key={`${weekIndex}:${si}`}>
      <div className="ai-session-heading"><h3>{s.name||`Session ${si+1}`}</h3><span className="badge">{DAYS[s.day]||'Choose day'} · Estimated {estimateSessionMinutes(s)??'—'} min</span></div>
      <div className="ai-fields">
        {field(`Session ${si+1} name`,`${sp}/name`,<input value={s.name} onChange={e=>session(si,'name',e.target.value)}/>)}
        {field(`Session ${si+1} training day`,`${sp}/day`,<select value={s.day} onChange={e=>session(si,'day',Number(e.target.value))}>{DAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}</select>)}
        {field(`Session ${si+1} time limit (minutes)`,`${sp}/maxDurationMinutes`,<NumberInput value={s.maxDurationMinutes} min="1" max="240" onChange={v=>session(si,'maxDurationMinutes',v)}/>)}
        {field(`Session ${si+1} coach notes`,`${sp}/coachNotes`,<textarea value={s.coachNotes} onChange={e=>session(si,'coachNotes',e.target.value)}/>)}
      </div>
      {s.exercises.map((e,ei)=>{const ep=`${sp}/exercises/${ei}`,prefix=`Session ${si+1} exercise ${ei+1}`,unresolved=!exercises.some(x=>x.id===e.exerciseId),issues=findings.filter(f=>f.path.startsWith(ep+'/')),hasError=issues.some(f=>f.severity===SEVERITY.ERROR);return <article className={`ai-exercise ${hasError?'has-error':issues.length?'has-warning':'is-valid'}`} key={ei}>
        <div className="ai-exercise-heading"><div><small>{String.fromCharCode(65+ei)} · EXERCISE</small><h3>{e.exerciseName||'Unnamed exercise'}</h3></div>{unresolved?<span className="ai-state error"><AlertTriangle size={15}/>Exercise needs library match</span>:hasError?<span className="ai-state error">Fix prescription errors</span>:issues.length?<span className="ai-state warning">Coach review</span>:<span className="ai-state valid"><CheckCircle2 size={15}/>Valid prescription</span>}</div>
        <div className="ai-fields">
          {field(`${prefix} library match`,`${ep}/exerciseId`,<select value={exercises.some(x=>x.id===e.exerciseId)?e.exerciseId:''} onChange={ev=>edit(d=>{const item=d.program.plan[weekIndex].sessions[si].exercises[ei];item.exerciseId=ev.target.value||null;const found=exercises.find(x=>x.id===item.exerciseId);if(found)item.exerciseName=found.name;})}><option value="">Exercise needs library match</option>{exercises.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>)}
          {field(`${prefix} name`,`${ep}/exerciseName`,<input value={e.exerciseName} onChange={ev=>exercise(si,ei,'exerciseName',ev.target.value)}/>)}
        </div>
        <div className="ai-fields ai-prescription-fields">
          {field(`${prefix} sets`,`${ep}/sets`,<NumberInput value={e.sets} min="1" max="12" step="1" onChange={v=>exercise(si,ei,'sets',v)}/>)}
          {field(`${prefix} reps`,`${ep}/reps`,<NumberInput value={e.reps} min="1" max="50" step="1" onChange={v=>exercise(si,ei,'reps',v)}/>)}
          {field(`${prefix} load mode`,`${ep}/loadMode`,<select value={e.loadMode} onChange={ev=>exercise(si,ei,'loadMode',ev.target.value)}>{Object.values(LOAD_MODE).map(mode=><option key={mode} value={mode}>{LOAD_LABELS[mode]}</option>)}</select>)}
          {field(`${prefix} load`,`${ep}/load`,<NumberInput value={e.load} min="0" max="1200" step="any" placeholder="Not prescribed" onChange={v=>exercise(si,ei,'load',v)}/>)}
          {field(`${prefix} weight unit`,`${ep}/loadUnit`,<select value={e.loadUnit} onChange={ev=>exercise(si,ei,'loadUnit',ev.target.value)}>{Object.values(LOAD_UNIT).map(unit=><option key={unit}>{unit}</option>)}</select>)}
          {field(`${prefix} percent of 1RM`,`${ep}/percent1RM`,<NumberInput value={e.percent1RM} min="1" max="100" step="any" placeholder="No percentage" onChange={v=>exercise(si,ei,'percent1RM',v)}/>)}
          {field(`${prefix} effort mode`,`${ep}/effortMode`,<select value={e.effortMode} onChange={ev=>exercise(si,ei,'effortMode',ev.target.value)}>{Object.values(EFFORT_MODE).map(mode=><option key={mode} value={mode}>{EFFORT_LABELS[mode]}</option>)}</select>)}
          {field(`${prefix} RPE`,`${ep}/rpe`,<NumberInput value={e.rpe} min="1" max="10" step="0.5" placeholder="No RPE target" onChange={v=>exercise(si,ei,'rpe',v)}/>)}
          {field(`${prefix} RIR`,`${ep}/rir`,<NumberInput value={e.rir} min="0" max="10" step="0.5" placeholder="No RIR target" onChange={v=>exercise(si,ei,'rir',v)}/>)}
          {field(`${prefix} rest (seconds)`,`${ep}/rest`,<NumberInput value={e.rest} min="0" max="600" step="5" onChange={v=>exercise(si,ei,'rest',v)}/>)}
          {field(`${prefix} tempo`,`${ep}/tempo`,<input value={e.tempo??''} placeholder="Optional · 3-1-X-0" title={TEMPO_DESCRIPTION} onChange={ev=>exercise(si,ei,'tempo',ev.target.value===''?null:ev.target.value)}/>)}
          {field(`${prefix} weight increment`,`${ep}/increment`,<NumberInput value={e.increment} min="0.25" max="25" step="0.25" onChange={v=>exercise(si,ei,'increment',v)}/>)}
        </div>
        <p className="ai-help">Blank weight means no fixed load prescribed. Only “Bodyweight” mode means bodyweight. {TEMPO_DESCRIPTION}</p>
        {(e.loadMode===LOAD_MODE.PERCENTAGE||e.reference1RM!==null)&&<div className="ai-reference"><h4>Reference maximum</h4>{e.reference1RM===null?<><p>No reference maximum. A weight will not be calculated.</p><button className="btn secondary" onClick={()=>exercise(si,ei,'reference1RM',{exerciseId:e.exerciseId||'',value:null,unit:e.loadUnit,type:REFERENCE_TYPE.COACH_ENTERED,date:''})}>Enter reference maximum</button></>:<><div className="ai-fields">
          {field(`${prefix} reference lift`,`${ep}/reference1RM/exerciseId`,<select value={e.reference1RM.exerciseId} onChange={ev=>reference(si,ei,'exerciseId',ev.target.value)}><option value="">Select reference lift</option>{exercises.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>)}
          {field(`${prefix} reference maximum`,`${ep}/reference1RM/value`,<NumberInput value={e.reference1RM.value} min="0.25" step="any" onChange={v=>reference(si,ei,'value',v)}/>)}
          {field(`${prefix} reference unit`,`${ep}/reference1RM/unit`,<select value={e.reference1RM.unit} onChange={ev=>reference(si,ei,'unit',ev.target.value)}>{Object.values(LOAD_UNIT).map(unit=><option key={unit}>{unit}</option>)}</select>)}
          {field(`${prefix} reference source`,`${ep}/reference1RM/type`,<select value={e.reference1RM.type} onChange={ev=>reference(si,ei,'type',ev.target.value)}>{Object.values(REFERENCE_TYPE).map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select>)}
          {field(`${prefix} reference date`,`${ep}/reference1RM/date`,<input type="date" value={e.reference1RM.date} onChange={ev=>reference(si,ei,'date',ev.target.value)}/>)}
        </div><button className="text-button" onClick={()=>exercise(si,ei,'reference1RM',null)}>Clear reference maximum</button></>}{field(`${prefix} reference validation`,`${ep}/reference1RM`,<input readOnly value={percentageLoad(e,exercises)===null?'No calculated weight':`Calculated weight: ${percentageLoad(e,exercises)} ${e.loadUnit}`}/>)}</div>}
        <div className="ai-fields">
          {field(`${prefix} notes`,`${ep}/notes`,<textarea value={e.notes} onChange={ev=>exercise(si,ei,'notes',ev.target.value)}/>)}
          {field(`${prefix} progression instructions`,`${ep}/progressionInstructions`,<textarea value={e.progressionInstructions} onChange={ev=>exercise(si,ei,'progressionInstructions',ev.target.value)}/>)}
        </div>
      </article>;})}
    </section>;})}
    <section className="panel ai-approval"><div><ShieldCheck size={25}/><h2>Coach approval</h2></div><p>Approve this revision only. Approval does not save or assign anything. Every change requires a fresh review.</p>
      {validation.counts.warning>0&&<label className="checkbox-field"><input type="checkbox" checked={warningsReviewed} onChange={e=>setWarningsReviewed(e.target.checked)} disabled={approved}/>I reviewed the warnings and accept these draft choices.</label>}
      {actionError&&<p className="error" role="alert">{actionError}</p>}
      <div className="ai-actions"><button className="btn" disabled={approved||!validation.canApprove||(validation.counts.warning>0&&!warningsReviewed)} onClick={approve}><CheckCircle2 size={17}/>{approved?`Revision ${review.revision} approved`:'Approve this revision'}</button><button className="btn secondary" disabled={!approved} onClick={convert}><FileJson size={17}/>Preview program JSON</button><button className="btn secondary" disabled={!approved||!receipt||!!saved} onClick={save}>{saved?'Program saved':pending?'Working…':'Save as new program'}</button></div>
      <p className="ai-help">Saving revalidates this approved revision and creates a new program ID. Your source program stays unchanged. No athlete is assigned automatically.</p>
    </section>
    {saved&&<section className="panel"><h2>Saved as a new program</h2><p>{saved.name}</p><p className="ai-help">Open Programs to edit or assign this template. Program ID: {saved.id}</p></section>}
    {converted&&<section className="panel ai-output"><h2>Converted program preview</h2><p>Complete weekly plan included. Week 1 also supplies the existing sessions field. Conversion itself assigns no program ID.</p><pre tabIndex="0" aria-label="Converted program JSON">{JSON.stringify(converted,null,2)}</pre></section>}
    {initialGeneration?.debug&&<details className="panel ai-output"><summary>Development diagnostics · generation</summary><pre>{JSON.stringify(initialGeneration.debug,null,2)}</pre></details>}
    <details className="panel ai-output"><summary>Structured draft JSON</summary><pre tabIndex="0" aria-label="Structured draft JSON">{JSON.stringify({...draft,status,validationFindings:findings},null,2)}</pre></details>
  </fieldset></div>;
}
