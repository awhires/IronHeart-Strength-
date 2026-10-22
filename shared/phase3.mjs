import {trackingProfile} from './tracking.mjs';
import {convertWeight} from './ai/contract.mjs';
import {workoutDate} from './volume-stats.mjs';
import {scoreText} from './workout-blocks.mjs';

const dayKey=(value,timeZone='UTC')=>{
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  try{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
  catch{return new Date(value).toISOString().slice(0,10);}
};
const validZone=value=>{try{new Intl.DateTimeFormat('en-US',{timeZone:value});return value;}catch{return 'UTC';}};
const round=(value,n=2)=>Number(value.toFixed(n));
const dateFor=log=>workoutDate(log)||log.createdAt?.slice(0,10)||'';
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function completedProgram(assignment,logs){
  if(!assignment?.id||!Array.isArray(assignment.plan))return false;
  const required=assignment.plan.flatMap(w=>w.sessions.map((session,index)=>({week:w.week,index,session}))).filter(x=>!x.session.cancelled);
  return required.length>0&&required.every(({week,index})=>logs.some(l=>l.assignmentId===assignment.id&&l.week===week&&l.session===index&&['completed','skipped'].includes(l.status||'completed')));
}

export function repeatProgramInstance(assignment,{id,startDate,startedAt=new Date().toISOString()},logs=[]){
  if(!completedProgram(assignment,logs))throw Error('Finish or skip every scheduled workout before repeating this program.');
  if(assignment.repeatable===false)throw Error('Your coach has not enabled repeating this program.');
  if(typeof startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(Date.parse(`${startDate}T00:00:00Z`)))throw Error('Choose a valid start date.');
  const plan=structuredClone(assignment.plan).map(w=>({...w,sessions:w.sessions.map(s=>({...s,prescriptionRevision:0,cancelled:false}))}));
  return {...structuredClone(assignment),id,startDate,plan,instanceNumber:(assignment.instanceNumber||1)+1,repeatOfAssignmentId:assignment.id,repeatStartedAt:startedAt,enrollment:{...(assignment.enrollment||{}),status:'active'}};
}

export function repeatWorkoutDraft(log,exercises){
  if(!log?.id||!Array.isArray(log.exercises))throw Error('Workout history is unavailable for repeating.');
  return {repeatOfLogId:log.id,sessionName:log.sessionName,exercises:log.exercises.filter(e=>e.status!=='skipped').map(e=>({exerciseId:e.exerciseId,blockType:e.blockType|| (trackingProfile(exercises.find(x=>x.id===e.exerciseId))==='strength'?'Strength':'Cardio'),...(e.target?{target:structuredClone(e.target)}:{}),sets:(e.sets||[]).map(s=>({load:s.load??'',loadUnit:s.loadUnit||'lbs',reps:s.reps??'',rpe:s.rpe??'',durationSeconds:s.durationSeconds??'',distance:s.distance??'',distanceUnit:s.distanceUnit||'mi',paceSeconds:s.paceSeconds??'',completed:false})),complex:structuredClone(e.complex||[]),intervals:structuredClone(e.intervals||[]),notes:''})),blockResults:(log.blockResults||[]).filter(r=>r.status!=='skipped').map(r=>({metcon:structuredClone(r.metcon),score:{rx:r.score?.rx||'RX',loadUnit:r.score?.loadUnit||'lbs',notes:''}}))};
}

export function benchmarkDefinitions(programs=[],assignments=[]){
  const rows=[];
  const add=(program,source)=>{
    const weeks=program.plan||[{week:1,sessions:program.sessions||[]}];
    for(const w of weeks)for(const [sessionIndex,s] of w.sessions.entries()){
      const sourceId=source==='assignment'?program.id:undefined;
      if(program.benchmarkType&&program.benchmarkType!=='none')rows.push({id:`${source}:${program.id}:${w.week}:${sessionIndex}`,name:s.name,category:program.benchmarkType,programId:source==='program'?program.id:program.programId,assignmentId:sourceId,source,week:w.week,session:sessionIndex,exercises:structuredClone(s.exercises||[]),blocks:structuredClone(s.blocks||[])});
      for(const [blockIndex,b] of (s.blocks||[]).entries())if(b.type==='Metcon'&&b.metcon?.benchmark)rows.push({id:`${source}:${program.id}:${w.week}:${sessionIndex}:m${blockIndex}`,name:b.metcon.name,category:'benchmark',programId:source==='program'?program.id:program.programId,assignmentId:sourceId,source,week:w.week,session:sessionIndex,metcon:structuredClone(b.metcon)});
    }
  };
  programs.forEach(p=>add(p,'program'));
  assignments.forEach(a=>add(a,'assignment'));
  return [...new Map(rows.map(r=>[JSON.stringify([r.source,r.assignmentId||r.programId,r.category,r.metcon?.name||r.name,r.metcon||r.exercises]),r])).values()];
}

function evidenceFromQuestion(question,logs,library,timeZone,now,assignments=[]){
  const q=norm(question),zone=validZone(timeZone),owned=logs.filter(l=>l.status!=='skipped').slice(-500),evidence=[];
  const dated=owned.map(l=>({log:l,date:dayKey(dateFor(l),zone)})).sort((a,b)=>a.date.localeCompare(b.date)||String(a.log.createdAt||a.log.id).localeCompare(String(b.log.createdAt||b.log.id)));
  const exercise=library.filter(e=>{const name=norm(e.name),profile=trackingProfile(e);const words=name.split(' ').filter(word=>word.length>2);return q.includes(name)||words.some(word=>q.split(' ').includes(word))||profile==='running'&&/\b(run|running|mile|5k|10k)\b/.test(q);}).sort((a,b)=>{const na=norm(a.name),nb=norm(b.name),aExact=q.includes(na)?1:0,bExact=q.includes(nb)?1:0;return bExact-aExact||nb.length-na.length;})[0];
  if(/focus|together|strength and endurance|what areas/.test(q)){
    const today=dayKey(now,zone),cutoffDate=new Date(`${today}T12:00:00Z`);cutoffDate.setUTCDate(cutoffDate.getUTCDate()-42);const cutoff=cutoffDate.toISOString().slice(0,10),recent=dated.filter(x=>x.date>=cutoff),strength=recent.flatMap(({log})=>(log.exercises||[]).filter(e=>e.status!=='skipped'&&trackingProfile(library.find(v=>v.id===e.exerciseId))==='strength').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false&&s.reps>0))),endurance=recent.flatMap(({log})=>(log.exercises||[]).filter(e=>e.status!=='skipped'&&trackingProfile(library.find(v=>v.id===e.exerciseId))!=='strength').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false&&(s.distance!=null||s.durationSeconds!=null))));
    evidence.push({id:'training-focus',kind:'training_summary',period:{start:cutoff,end:today},sessions:recent.length,strengthSets:strength.length,enduranceRecords:endurance.length,skippedSessions:dated.filter(({log,date})=>date>=cutoff&&log.status==='skipped').length,source:'saved actual workout records only'});
  } else if(/repeat|previous program|program attempt|last program/.test(q)&&assignments.length){
    const pairs=assignments.filter(a=>a.repeatOfAssignmentId).map(a=>{const prior=assignments.find(p=>p.id===a.repeatOfAssignmentId);return prior?{original:{id:prior.id,name:prior.name,instanceNumber:prior.instanceNumber||1,startedAt:prior.startDate},repeat:{id:a.id,name:a.name,instanceNumber:a.instanceNumber||2,startedAt:a.startDate}}:null;}).filter(Boolean);evidence.push({id:'program-attempts',kind:pairs.length?'program_comparison':'insufficient_data',pairs});
  } else if(/benchmark|assessment|last time|previous time/.test(q)){
    const named=dated.flatMap(({log,date})=>(log.blockResults||[]).filter(r=>r.status!=='skipped'&&r.metcon?.benchmark).map(r=>({id:log.id,date,workout:log.sessionName,name:r.metcon.name,score:r.score})));const latest=named.at(-1);if(latest)evidence.push({...latest,id:'latest-benchmark',kind:'benchmark_result'});
  } else if(/how many times|frequency|how often/.test(q)&&/legs|lower body|leg/.test(q)){
    const today=dayKey(now,zone),month=today.slice(0,7),hits=dated.filter(({log,date})=>date.startsWith(month)&&log.exercises?.some(x=>x.status!=='skipped'&&['Lower body','Legs'].includes(library.find(e=>e.id===x.exerciseId)?.region)));
    evidence.push({id:'leg-frequency',kind:'count',value:hits.length,period:month,dates:hits.map(x=>x.date)});
  } else if(/last week/.test(q)&&!exercise){
    const today=dayKey(now,zone),dt=new Date(`${today}T12:00:00Z`),dow=(dt.getUTCDay()+6)%7;dt.setUTCDate(dt.getUTCDate()-dow-7);const start=dt.toISOString().slice(0,10);dt.setUTCDate(dt.getUTCDate()+7);const end=dt.toISOString().slice(0,10);
    const hits=dated.filter(x=>x.date>=start&&x.date<end);
    evidence.push({id:'last-week',kind:'sessions',period:{start,end},sessions:hits.map(({log,date})=>({date,name:log.sessionName,exercises:(log.exercises||[]).filter(x=>x.status!=='skipped').map(x=>({exercise:library.find(e=>e.id===x.exerciseId)?.name,sets:(x.sets||[]).filter(s=>s.completed!==false).map(s=>({reps:s.reps,load:s.load,loadUnit:s.loadUnit,rpe:s.rpe}))})),metcons:(log.blockResults||[]).filter(r=>r.status!=='skipped').map(r=>({name:r.metcon?.name,score:r.score}))}))});
  } else if(exercise&&/heaviest|heavy|highest|best|fastest|last|latest|recent|volume|improv|progress|reps/.test(q)){
    const p=trackingProfile(exercise),matches=dated.flatMap(({log,date})=>(log.exercises||[]).filter(e=>e.exerciseId===exercise.id&&e.status!=='skipped').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false).map((s,index)=>({id:`${log.id}:${exercise.id}:${index}`,date,workout:log.sessionName,exercise:exercise.name,reps:s.reps,loadLb:s.load==null?null:round(convertWeight(s.load,s.loadUnit||'lbs','lbs')),actualLoad:s.load,loadUnit:s.loadUnit||'lbs',rpe:s.rpe,distance:s.distance,distanceUnit:s.distanceUnit,durationSeconds:s.durationSeconds,paceSeconds:s.paceSeconds,volume:s.load!=null&&s.reps!=null?round(convertWeight(s.load,s.loadUnit||'lbs','lbs')*s.reps):null}))));
    if(p==='strength'){
      if(/heaviest|heavy|highest|best/.test(q)){const best=matches.filter(x=>x.actualLoad!=null).sort((a,b)=>b.loadLb-a.loadLb)[0];if(best)evidence.push({...best,id:'best-actual-load',kind:'actual_set',estimated1RM:false});}
      else if(/volume/.test(q)){const totals=dated.flatMap(({log,date})=>{const rows=(log.exercises||[]).filter(e=>e.exerciseId===exercise.id&&e.status!=='skipped').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false&&s.load!=null&&s.reps!=null).map(s=>convertWeight(s.load,s.loadUnit||'lbs','lbs')*s.reps));return rows.length?[{id:log.id,date,workout:log.sessionName,volumeLb:round(rows.reduce((a,b)=>a+b,0))}]:[];}).sort((a,b)=>b.volumeLb-a.volumeLb);if(totals[0])evidence.push({id:'highest-session-volume',kind:'actual_volume',exercise:exercise.name,...totals[0]});}
      else if(/last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(q)){const dayName=q.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/)[1],today=dayKey(now,zone),dt=new Date(`${today}T12:00:00Z`),day=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(dayName),delta=(dt.getUTCDay()-day+7)%7||7;dt.setUTCDate(dt.getUTCDate()-delta);const date=dt.toISOString().slice(0,10),found=matches.filter(m=>m.date===date);evidence.push({id:'exercise-day',kind:found.length?'actual_sets':'insufficient_data',exercise:exercise.name,date,records:found});}
      else if(/last week/.test(q)){const week=evidenceFromQuestion('logged workouts last week',logs,library,timeZone,now,assignments).evidence[0],records=matches.filter(m=>week.period&&m.date>=week.period.start&&m.date<week.period.end);evidence.push({id:'exercise-last-week',kind:records.length?'actual_sets':'insufficient_data',exercise:exercise.name,period:week.period,records});}
      else if(/last|latest|recent/.test(q)&&/workout|session/.test(q)){const latestLog=dated.filter(({log})=>(log.exercises||[]).some(e=>e.exerciseId===exercise.id&&e.status!=='skipped'&&(e.sets||[]).some(s=>s.completed!==false))).at(-1);if(latestLog){const records=matches.filter(m=>m.id.startsWith(`${latestLog.log.id}:${exercise.id}:`));evidence.push({id:'latest-exercise-workout',kind:'actual_sets',exercise:exercise.name,date:latestLog.date,workout:latestLog.log.sessionName,records});}}
      else if(/last|latest|recent/.test(q)){const latest=matches.at(-1);if(latest)evidence.push({...latest,id:'latest-actual-set',kind:'actual_set',estimated1RM:false});}
      else if(matches.length){const first=matches[0],latest=matches.at(-1);evidence.push({id:'exercise-history',kind:'actual_sets',exercise:exercise.name,records:matches.slice(-30),...(first.loadLb!=null&&latest.loadLb!=null?{baselineLoadLb:first.loadLb,latestLoadLb:latest.loadLb,changeLb:round(latest.loadLb-first.loadLb)}:{}),trend:'Compare actual matching sets only; estimated one-rep max is not an actual lift.'});}
    } else if(p==='running'||p==='treadmill'){
      const miles=Number((q.match(/(\d+(?:\.\d+)?)\s*(?:mile|mi)/)||[])[1]),requestedMeters=miles?miles*1609.344:null;
      const runs=dated.flatMap(({log,date})=>(log.exercises||[]).filter(e=>e.exerciseId===exercise.id&&e.status!=='skipped').flatMap(e=>{const sets=(e.sets||[]).filter(s=>s.completed!==false&&s.distance>0&&s.durationSeconds>0);const m=sets.reduce((n,s)=>n+s.distance*(s.distanceUnit==='km'?1000:s.distanceUnit==='mi'?1609.344:s.distanceUnit==='yd'?.9144:1),0),seconds=sets.reduce((n,s)=>n+s.durationSeconds,0);return m&&seconds?[{id:log.id,date,workout:log.sessionName,meters:round(m,1),seconds,paceSecondsPerMile:round(seconds/(m/1609.344),1)}]:[];}));
      const comparable=requestedMeters?runs.filter(r=>Math.abs(r.meters-requestedMeters)/requestedMeters<=.01):runs;
      const best=comparable.sort((a,b)=>a.seconds-b.seconds)[0];if(best)evidence.push({...best,id:'fastest-run',kind:'actual_run',requestedDistanceMeters:requestedMeters});
    }
  }
  if(!evidence.length)evidence.push({id:'no-match',kind:'insufficient_data',message:'No matching completed actual workout data was found for this request. Do not infer a result.'});
  return {evidence,athleteTimezone:zone};
}

export function answerFromEvidence(question,evidence){
  const row=evidence.find(x=>x.kind!=='insufficient_data');
  if(!row)return 'I could not find a matching completed result in your saved training history, so I cannot give a reliable number yet.';
  if(row.id==='best-actual-load')return `Your heaviest recorded ${row.exercise} set was ${row.actualLoad} ${row.loadUnit} for ${row.reps} reps on ${row.date} (${row.workout}). This is an actual lifted load, not an estimated 1RM.`;
  if(row.id==='fastest-run')return `Your fastest matching recorded run was ${Math.floor(row.seconds/60)}:${String(row.seconds%60).padStart(2,'0')} over ${round(row.meters/1609.344,2)} miles on ${row.date} (${row.workout}).`;
  if(row.id==='leg-frequency')return `You logged ${row.value} lower-body training session${row.value===1?'':'s'} in ${row.period}.`;
  if(row.id==='last-week')return row.sessions.length?`From ${row.period.start} through ${row.period.end} (your local calendar week), you logged ${row.sessions.length} workout${row.sessions.length===1?'':'s'}: ${row.sessions.map(s=>`${s.name} on ${s.date}`).join('; ')}.`:'I found no saved workouts for your local calendar week last week.';
  if(row.id==='latest-actual-set')return `Your latest recorded ${row.exercise} set was ${row.actualLoad} ${row.loadUnit} × ${row.reps} reps on ${row.date} (${row.workout}).`;
  if(row.id==='latest-exercise-workout')return `Your most recent ${row.exercise} workout was ${row.date} (${row.workout}): ${row.records.map(r=>`${r.actualLoad??'bodyweight'} ${r.loadUnit||''} × ${r.reps??'—'} reps`).join('; ')}.`;
  if(row.id==='exercise-day')return row.records?.length?`On ${row.date}, you logged ${row.exercise}: ${row.records.map(r=>`${r.actualLoad??'bodyweight'} ${r.loadUnit||''} × ${r.reps??'—'} reps`).join('; ')}.`:`I found no saved ${row.exercise} set for ${row.date}.`;
  if(row.id==='exercise-last-week')return `Last week you recorded ${row.records.map(r=>`${r.actualLoad??'bodyweight'} ${r.loadUnit||''} × ${r.reps??'—'} ${r.exercise} reps on ${r.date}`).join('; ')}.`;
  if(row.id==='training-focus')return `In the last six weeks, your saved history includes ${row.sessions} workout sessions, ${row.strengthSets} completed strength sets, and ${row.enduranceRecords} endurance records${row.skippedSessions?`, plus ${row.skippedSessions} skipped workouts`:''}. This describes activity only; it does not establish strength or endurance improvement by itself.`;
  if(row.id==='latest-benchmark')return `The latest saved ${row.name} benchmark result was ${scoreText(row.score)} on ${row.date}.`;
  if(row.id==='program-attempts')return `I found ${row.pairs.length} repeated program attempt${row.pairs.length===1?'':'s'}. Each repeat has its own saved workout history; compare the original and repeat attempts separately.`;
  if(row.id==='highest-session-volume')return `Your highest recorded ${row.exercise} session volume was ${row.volumeLb} lb × reps on ${row.date} (${row.workout}), calculated from actual completed sets.`;
  const records=Array.isArray(row.records)?row.records:[];
  return records.length?`I found ${records.length} actual ${row.exercise} training sets in your saved history${row.changeLb!=null?`; recorded load changed by ${row.changeLb>=0?'+':''}${row.changeLb} lb between the first and latest matching sets`:''}. These are recorded performances; estimated max values are separate.`:'I could not find a matching completed actual performance in your saved history, so I cannot give a reliable number yet.';
}

export function analyzeTrainingQuestion({question,logs,library,assignments=[],timeZone='UTC',now=new Date()}){
  if(typeof question!=='string'||question.trim().length<3||question.length>500)throw Error('Ask a question between 3 and 500 characters.');
  const {evidence,athleteTimezone}=evidenceFromQuestion(question,logs,library,timeZone,now,assignments);
  return {answer:answerFromEvidence(question,evidence),evidence,athleteTimezone};
}
