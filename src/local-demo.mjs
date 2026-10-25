import {sessionRecommendations,withAthleteRecommendations} from '../shared/adaptive-prescriptions.mjs';
import {propagateProgram} from '../shared/program-sync.mjs';
import {refreshAssignmentRunningPaces} from '../shared/automatic-running-pace.mjs';
import {prepareStrengthGoal,prepareStrengthPR} from '../shared/strength-progress.mjs';
import {discoverable,confirmSchedule,proposeSchedule,moveWorkout,weekdayDate} from '../shared/program-schedule.mjs';
import {missingConditioningExercises,missingSingleUnders} from '../shared/conditioning-library.mjs';
import {recordBlockScores,referencesExercise} from '../shared/workout-blocks.mjs';
import {missingTrackingExercises} from '../shared/tracking.mjs';
import {repeatProgramInstance,completedProgram,benchmarkDefinitions,analyzeTrainingQuestion} from '../shared/phase3.mjs';
import {prepareBenchmark,benchmarkAttemptSignature} from '../shared/benchmark-attempts.mjs';
// Device-only preview. No remote accounts or synchronization are implied.
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import { exercises, programs } from '../server/seed.mjs';
import { periodize, recommend } from '../server/progression.mjs';
import { toPounds } from '../server/units.mjs';
import {prepareProgram,prepareSession,prepareItems,recordPerformance,normalizeData} from '../shared/prescriptions.mjs';
import {createDraftSaveService} from '../shared/ai/save-service.mjs';
import {LIBRARY_UPDATE,missingLibraryExercises,missingStrengthProgressExercises} from '../shared/exercise-library.mjs';
const KEY='iron-heart-phone-preview-v1';
const clone=value=>structuredClone(value);
const id=()=>crypto.randomUUID();
function assignment(p,athleteId,startDate){return {id:id(),athleteId,programId:p.id,name:p.name,goal:p.goal,coachNotes:p.coachNotes,progressionInstructions:p.progressionInstructions,aiProvenance:clone(p.aiProvenance),weeks:p.weeks,startDate,repeatable:p.repeatable!==false,benchmarkType:p.benchmarkType||'none',progressionOptions:clone(p.progressionOptions),plan:p.plan?clone(p.plan):Array.from({length:p.weeks},(_,i)=>({week:i+1,sessions:p.sessions.map(s=>({...clone(s),exercises:s.exercises.map(e=>periodize(e,i+1,p.weeks))}))}))};}
function seed(){
  const templates=clone(programs);
  templates.forEach(p=>p.sessions.forEach(s=>s.exercises.forEach(e=>{e.load=toPounds(e.load);e.increment=toPounds(e.increment);})));
  const athletes=[['jordan','Jordan Davis','Field sport'],['maya','Maya Chen','Powerlifting'],['marcus','Marcus Reed','Basketball'],['sofia','Sofia Rivera','General fitness']].map(([id,name,sport])=>({id,name,sport,role:'athlete',email:`${id}@ironheart.demo`}));
  const date=new Date();date.setDate(date.getDate()-((date.getDay()+6)%7));
  const start=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {active:null,coach:{id:'coach',name:'Head Coach',email:'coach@ironheart.demo',role:'coach'},athletes,programs:templates,exercises:clone(exercises),assignments:athletes.map(a=>assignment(templates[0],a.id,start)),logs:[]};
}
export function createLocalDemo(storage){
  const draftSaves=createDraftSaveService(id);
  return async function request(path,method='GET',body={}){
    const saved=storage.getItem(KEY);
    const state=saved?JSON.parse(saved):seed();
    const bench=state.exercises.find(e=>e.id==='bench'),namedBench=state.exercises.find(e=>e.name==='Bench Press'&&e.id!=='bench');if(bench?.name==='Barbell Bench Press'&&!namedBench)bench.name='Bench Press';
    if(!state.libraryUpdates?.includes(LIBRARY_UPDATE)){
      state.exercises.push(...missingLibraryExercises(state.exercises));
      state.libraryUpdates=[...(state.libraryUpdates||[]),LIBRARY_UPDATE];
    }
    if(!state.libraryUpdates?.includes('tracking-library-v1')){state.exercises.push(...missingTrackingExercises(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'tracking-library-v1'];}
    if(!state.libraryUpdates?.includes('conditioning-library-v1')){state.exercises.push(...missingConditioningExercises(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'conditioning-library-v1'];}
    if(!state.libraryUpdates?.includes('single-unders-v1')){state.exercises.push(...missingSingleUnders(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'single-unders-v1'];}
    state.strengthGoals??=[];state.strengthPRs??=[];state.savedBenchmarks??=[];
    if(!state.libraryUpdates?.includes('strength-progress-library-v1')){state.exercises.push(...missingStrengthProgressExercises(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'strength-progress-library-v1'];}
    const b=clone(body),url=new URL(path,'https://preview.local/'),route=url.pathname.slice(1);
    const user=state.active==='coach'?state.coach:state.athletes.find(a=>a.id===state.active);
    const coach=()=>{if(user?.role!=='coach')throw Error('Open Coach view to make this change.');};
    const owned=key=>{const a=state.assignments.find(a=>a.id===key);if(!a||user.role!=='coach'&&a.athleteId!==user.id)throw Error('Program not found.');return a;};
    const session=()=>{const a=owned(b.id||b.assignmentId),s=a.plan.find(w=>w.week===b.week)?.sessions[b.session];if(!s)throw Error('Session not found.');return {a,s};};
    const save=(collection,value)=>{const i=state[collection].findIndex(x=>x.id===value.id);if(i<0)state[collection].push(value);else state[collection][i]=value;return value;};
    const refreshPaces=athleteId=>{for(const current of state.assignments.filter(a=>a.athleteId===athleteId)){const result=refreshAssignmentRunningPaces(current,{logs:state.logs,definitions:state.savedBenchmarks,library:state.exercises},state.logs);if(result.changed)save('assignments',result.assignment);}};
    const eraseAthlete=key=>{state.strengthGoals=state.strengthGoals.filter(x=>x.athleteId!==key);state.strengthPRs=state.strengthPRs.filter(x=>x.athleteId!==key);state.athletes=state.athletes.filter(x=>x.id!==key);state.assignments=state.assignments.filter(x=>x.athleteId!==key);state.logs=state.logs.filter(x=>x.athleteId!==key);};
    const requestId=b.clientRequestId;delete b.clientRequestId;
    const receiptKey=requestId&&user?`${user.id}:${requestId}`:null;
    if(receiptKey&&['log','tracker'].includes(route)&&method==='POST'){const old=state.workoutReceipts?.[receiptKey];if(old){if(old.payload!==JSON.stringify({route,b}))throw Error('Save ID belongs to a different workout.');const prior=state.logs.find(l=>l.id===old.id);if(!prior)throw Error('Workout was deleted; start a new workout to redo it.');return clone(prior);}}
    let result={ok:true},programSync=null,recordAthleteId=null;
    if(route==='config')result={demo:true,standalone:true,previewAthletes:state.athletes.map(({id,name})=>({id,name}))};
    else if(route==='demo'&&method==='POST'){
      const selected=b.role==='athlete'?(b.athleteId?state.athletes.find(a=>a.id===b.athleteId):state.athletes.find(a=>a.id==='jordan')||state.athletes[0]):state.coach;
      if(!selected)throw Error('Add an athlete in Coach view first.');
      state.active=selected.id;result={user:selected};
    }else if(route==='logout'){state.active=null;}
    else if(['login','redeem','invite'].includes(route))throw Error('Live sign-in and invitations require the hosted version. This preview saves only on this phone.');
    else{
      if(!user)throw Error('Choose Coach view or Athlete view.');
      if(route==='data'){const assignments=state.assignments.filter(a=>user.role==='coach'||a.athleteId===user.id);result={user,demo:true,standalone:true,exercises:state.exercises,programs:user.role==='coach'?state.programs:[],discover:user.role==='athlete'?state.programs.filter(p=>discoverable(p,user.id)).map(({discover,...p})=>p):[],athletes:user.role==='coach'?state.athletes:[],assignments,strengthGoals:state.strengthGoals.filter(g=>user.role==='coach'||g.athleteId===user.id),strengthPRs:state.strengthPRs.filter(g=>user.role==='coach'||g.athleteId===user.id),logs:state.logs.filter(l=>user.role==='coach'||l.athleteId===user.id),benchmarks:benchmarkDefinitions(user.role==='coach'?state.programs:[],assignments),savedBenchmarks:state.savedBenchmarks.filter(x=>user.role==='coach'?x.coachId===user.id:assignments.some(a=>a.programId===x.programId))};}
      else if(route==='benchmarks'&&method==='POST'){coach();const program=state.programs.find(p=>p.id===b.programId);if(!program)throw Error('Program not found.');result=save('savedBenchmarks',prepareBenchmark(b,program,state.exercises,{id:id(),coachId:user.id,createdAt:new Date().toISOString()}));}
      else if(route==='ask-ai'&&method==='POST'){const athleteId=user.role==='coach'?b.athleteId:user.id;if(!state.athletes.some(a=>a.id===athleteId))throw Error('Choose an athlete to ask about.');result=analyzeTrainingQuestion({question:b.question,logs:state.logs.filter(l=>l.athleteId===athleteId),library:state.exercises,assignments:state.assignments.filter(a=>a.athleteId===athleteId),timeZone:b.timeZone||'UTC'});}
      else if(route==='strength-goal'&&method==='POST'){const athleteId=b.athleteId||user.id;if(user.role!=='coach'&&athleteId!==user.id)throw Error('Access denied.');if(!state.athletes.some(a=>a.id===athleteId))throw Error('Athlete not found.');result=save('strengthGoals',prepareStrengthGoal(b,state.exercises,athleteId));}
      else if(route==='strength-pr'&&method==='POST'){if(user.role!=='athlete')throw Error('Athlete access required.');const previous=b.id&&state.strengthPRs.find(p=>p.id===b.id);if(b.id&&previous?.athleteId!==user.id)throw Error('Manual PR not found.');result=save('strengthPRs',prepareStrengthPR(b,state.exercises,user.id));}
      else if(['enrollment-preview','enroll'].includes(route)&&method==='POST'){
        if(user.role!=='athlete')throw Error('Athlete access required.');let a;if(b.assignmentId)a=owned(b.assignmentId);else{const p=state.programs.find(p=>p.id===b.programId);if(!p||!discoverable(p,user.id))throw Error('Program unavailable.');if(route==='enroll'&&state.assignments.some(x=>x.athleteId===user.id&&x.programId===p.id))throw Error('This program is already in My Programs.');a={...assignment(p,user.id,b.startDate),description:p.description,modality:p.modality,level:p.level,enrollment:{source:'discover',status:'pending'}};}result=route==='enrollment-preview'?proposeSchedule(a,b):save('assignments',refreshAssignmentRunningPaces(confirmSchedule(a,b,state.logs),{logs:state.logs,definitions:state.savedBenchmarks,library:state.exercises},state.logs).assignment);
      }
      else if(route==='move-workout'&&method==='POST'){const a=owned(b.id);result=save('assignments',moveWorkout(a,b,state.logs));}
      else if(route==='ai/status'){coach();result={available:false,provider:null,model:null,debug:false,reason:'Live AI generation needs your computer backend or a hosted Iron Heart server. Connect in Account & settings. This device-only preview never stores an AI key.'};}
      else if(route==='ai/workout-scan'){throw Error('Connect to your Iron Heart computer server in Account & settings to scan a workout. Nothing has been saved.');}
      else if(route==='ai/program-draft'){coach();throw Error('Live AI generation needs your computer backend or a hosted Iron Heart server. Connect in Account & settings. No program was changed or saved.');}
      else if(route==='ai/approve'&&method==='POST'){coach();result=draftSaves.approve(b,state.exercises,user.id);}
      else if(route==='ai/programs'&&method==='POST'){
        coach();return clone(draftSaves.save(b,state.exercises,user.id,p=>{const saved=save('programs',prepareProgram(p,state.exercises));if(receiptKey&&['log','tracker'].includes(route)&&method==='POST'){state.workoutReceipts={...(state.workoutReceipts||{}),[receiptKey]:{id:result.id,payload:JSON.stringify({route,b})}};}
    storage.setItem(KEY,JSON.stringify(state));return saved;}));
      }
      else if(['programs','exercises'].includes(route)&&method==='POST'){
        coach();if(!b.name?.trim())throw Error('Enter a name.');
        const prepared=route==='programs'?prepareProgram(b,state.exercises):b;
        if(b.id&&!state[route].some(x=>x.id===b.id))throw Error('Record not found.');
        const previous=b.id&&route==='programs'?state.programs.find(p=>p.id===b.id):null;
        result=save(route,{...prepared,id:b.id||id()});
        if(previous){programSync={assignments:0,updated:0,completed:0,personalized:0,progression:0,conflicts:[]};for(const a of state.assignments.filter(a=>a.programId===result.id)){
          const oldPlan=assignment(previous,a.athleteId,a.startDate).plan,newPlan=assignment(result,a.athleteId,a.startDate).plan;
          const synced=propagateProgram(a,oldPlan,newPlan,state.logs,previous.progressionOptions,result.progressionOptions,previous,result);
          Object.assign(a,synced.assignment);refreshPaces(a.athleteId);
          programSync.assignments++;programSync.updated+=synced.summary.updated;programSync.completed+=synced.summary.completed;programSync.personalized+=synced.summary.personalized;programSync.progression+=synced.summary.progression;programSync.conflicts.push(...synced.summary.conflictDetails.map(item=>({athleteId:a.athleteId,assignmentId:a.id,...item})));
        }}
      }else if(route==='athletes'&&method==='POST'){
        coach();if(!b.name?.trim()||!b.email?.trim())throw Error('Enter an athlete name and email.');
        if(state.athletes.some(a=>a.email.toLowerCase()===b.email.toLowerCase()))throw Error('This athlete email already exists.');
        result=save('athletes',{...b,id:id(),role:'athlete'});
      }else if(route==='assign'&&method==='POST'){
        coach();const p=state.programs.find(p=>p.id===b.programId);
        if(!p||!state.athletes.some(a=>a.id===b.athleteId)||!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate))throw Error('Choose a program, athlete, and start date.');
        const a={...assignment(p,b.athleteId,b.startDate),description:p.description,modality:p.modality,level:p.level};if(b.requireSetup===true||b.requireSetup==='on')a.enrollment={source:'coach',status:'pending'};result=save('assignments',refreshAssignmentRunningPaces(a,{logs:state.logs,definitions:state.savedBenchmarks,library:state.exercises},state.logs).assignment);
      }else if(route==='repeat-program'&&method==='POST'){
        if(user.role!=='athlete')throw Error('Athlete access required.');const source=state.assignments.find(a=>a.id===b.assignmentId&&a.athleteId===user.id);if(!source)throw Error('Program not found.');if(state.assignments.some(a=>a.athleteId===user.id&&a.programId===source.programId&&a.id!==source.id&&!completedProgram(a,state.logs)))throw Error('This athlete already has an active attempt of this program. Finish it before starting another.');const next=repeatProgramInstance(source,{id:id(),startDate:b.startDate},state.logs);const dates=new Set(next.plan.flatMap(w=>w.sessions.map(s=>s.day)));for(const other of state.assignments.filter(a=>a.athleteId===user.id&&a.id!==source.id&&!completedProgram(a,state.logs)))if(other.plan.some(w=>w.sessions.some(s=>dates.has(s.day))))throw Error('Repeating this program may overlap another active schedule. Choose a different start date or adjust the other program.');result=save('assignments',next);
      }else if(['assignment','reschedule','session-status'].includes(route)){
        coach();const {a,s}=session();
        if(route==='assignment'){Object.assign(s,prepareSession({...s,exercises:b.exercises,...(b.blocks!==undefined?{blocks:b.blocks}:{})},state.exercises));s.prescriptionRevision=(s.prescriptionRevision||0)+1;refreshPaces(a.athleteId);}
        if(route==='reschedule'){if(!Number.isInteger(b.day)||b.day<0||b.day>6)throw Error('Choose a weekday.');if(a.schedule)Object.assign(a,moveWorkout(a,{week:b.week,session:b.session,targetDate:weekdayDate(a,b.week,b.session,b.day)},state.logs));else s.day=b.day;}
        if(route==='session-status')s.cancelled=!!b.cancelled;
        result=state.assignments.find(row=>row.id===a.id)||a;
      }else if(route==='tracker'&&method==='POST'){
        if(user.role!=='athlete')throw Error('Open Athlete view to journal a workout.');
        if(b.repeatOfLogId&&!state.logs.some(l=>l.id===b.repeatOfLogId&&l.athleteId===user.id))throw Error('Original workout was not found.');
        const benchmark=b.benchmarkId&&state.savedBenchmarks.find(x=>x.id===b.benchmarkId);
        if(b.benchmarkId&&(!benchmark||!state.assignments.some(a=>a.athleteId===user.id&&a.programId===benchmark.programId)))throw Error('Benchmark is not available to this athlete.');
        const attemptId=b.repeatAttemptId||b.benchmarkAttemptId;
        if(b.repeatAttemptId&&!b.repeatOfLogId||b.benchmarkId&&!attemptId||attemptId&&(typeof attemptId!=='string'||!/^[\w-]{16,100}$/.test(attemptId)))throw Error('Invalid workout attempt ID.');
        const attemptPayload=attemptId?JSON.stringify(b):null;
        const duplicate=attemptId&&state.logs.find(l=>l.athleteId===user.id&&l.attemptId===attemptId);
        if(duplicate){if(duplicate.repeatOfLogId!==b.repeatOfLogId||duplicate.benchmarkId!==benchmark?.id||duplicate.attemptPayload!==attemptPayload)throw Error('This attempt ID belongs to a different workout.');result=duplicate;}
        else{if(b.assessmentMaximal!==undefined&&(typeof b.assessmentMaximal!=='boolean'||benchmark?.scoring?.protocol!=='six_minute_max_run'))throw Error('Maximal effort confirmation requires a six-minute running assessment.');const {repeatOfLogId,repeatAttemptId,benchmarkAttemptId,benchmarkId,assessmentMaximal,...payload}=b;const workout=prepareTrackerWorkout(payload,state.exercises);
        result=save('logs',{...workout,id:id(),athleteId:user.id,createdAt:new Date().toISOString(),...(b.repeatOfLogId?{repeatOfLogId:b.repeatOfLogId}:{}),...(benchmark?{benchmarkId:benchmark.id,benchmarkSignature:benchmarkAttemptSignature(workout.exercises,workout.blocks,benchmark.scoring),...(benchmark.scoring.protocol==='six_minute_max_run'?{assessmentMaximal:b.assessmentMaximal===true}:{})}:{}),...(attemptId?{attemptId,attemptPayload}:{})});}
      }else if(route==='log'&&method==='POST'){
        if(user.role!=='athlete')throw Error('Open Athlete view to log a workout.');
        const {a,s}=session();if(a.enrollment?.status==='pending')throw Error('Confirm your program schedule before logging.');if(s.cancelled)throw Error('This session is removed from the calendar.');
        if(state.logs.some(l=>l.assignmentId===a.id&&l.week===b.week&&l.session===b.session))throw Error('This workout is already logged. Delete its log to redo it.');
        if(b.prescriptionRevision!==undefined&&b.prescriptionRevision!==(s.prescriptionRevision||0))throw Error('Coach updated this workout while it was open. Your entered results remain on this screen.');
        if(!b.exercises||b.exercises.length!==s.exercises.length)throw Error('Complete every exercise.');
        const recorded=recordPerformance(b.exercises,s.exercises,state.exercises);
        const blockResults=recordBlockScores(b.blockResults,s.blocks);
        const totalCount=recorded.length+blockResults.length,skippedCount=recorded.filter(e=>e.status==='skipped').length+blockResults.filter(e=>e.status==='skipped').length,partialCount=recorded.filter(e=>e.status==='partially_completed').length+blockResults.filter(e=>e.status==='partially_completed').length,status=b.status==='skipped'||totalCount>0&&skippedCount===totalCount?'skipped':skippedCount||partialCount?'partially_completed':'completed';
        result=save('logs',{...b,status,id:id(),athleteId:user.id,sessionName:s.name,createdAt:new Date().toISOString(),exercises:recorded,...(sessionRecommendations(a,b.week,b.session,state.logs,state.exercises,undefined,state.strengthPRs).some(rows=>rows.length)?{recommendations:sessionRecommendations(a,b.week,b.session,state.logs,state.exercises,undefined,state.strengthPRs),recommendationsComputedAt:new Date().toISOString()}:{}),...(blockResults.length?{blockResults,blocks:clone(s.blocks)}:{})});
      }else if(route==='recommendations'){
        coach();const a=owned(url.searchParams.get('id')),week=a.plan.find(w=>w.week===Number(url.searchParams.get('week')));if(!week)throw Error('Week not found.');
        result=week.sessions.flatMap((s,si)=>s.exercises.map((e,ei)=>({session:si,index:ei,exerciseId:e.exerciseId,current:e.load,...recommend(e,state.logs.filter(l=>l.athleteId===a.athleteId&&l.source!=='tracker').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).flatMap(l=>l.exercises.filter(x=>x.exerciseId===e.exerciseId).map(x=>({...x,pain:l.pain,readiness:l.readiness}))))})));
      }else if(route==='delete'&&method==='POST'){
        if(b.kind==='athlete'){coach();eraseAthlete(b.id);}
        else{
          const collection={program:'programs',exercise:'exercises',assignment:'assignments',log:'logs',strengthPR:'strengthPRs'}[b.kind];
          const record=collection&&state[collection].find(x=>x.id===b.id);if(!record)throw Error('Record not found.');
          if(b.kind==='log'){if(user.role!=='coach'&&record.athleteId!==user.id)throw Error('Access denied.');recordAthleteId=record.athleteId;}else if(b.kind==='strengthPR'){if(user.role!=='athlete'||record.athleteId!==user.id)throw Error('Access denied.');}else coach();
          if(b.kind==='exercise'&&[...state.programs,...state.assignments,...state.logs,...state.strengthGoals].map(r=>r.exerciseId?{exercises:[r]}:r).some(r=>referencesExercise(r,b.id)))throw Error('This exercise is still used in a program or workout history.');
          state[collection]=state[collection].filter(x=>x.id!==b.id);
        }
      }else if(route==='account'&&method==='DELETE'){
        if(user.role!=='athlete')throw Error('Only an athlete account can be removed here.');eraseAthlete(user.id);state.active=null;
      }else throw Error('This action is not available in the phone preview.');
    }
    if(['log','tracker'].includes(route)&&method==='POST'&&result?.athleteId)refreshPaces(result.athleteId);
    if(route==='delete'&&b.kind==='log'&&recordAthleteId)refreshPaces(recordAthleteId);
    // Persist before acknowledging success; quota failures leave the prior state intact.
    if(receiptKey&&['log','tracker'].includes(route)&&method==='POST'){state.workoutReceipts={...(state.workoutReceipts||{}),[receiptKey]:{id:result.id,payload:JSON.stringify({route,b})}};}
    storage.setItem(KEY,JSON.stringify(state));
    return route==='data'?withAthleteRecommendations(normalizeData(result)):clone(programSync?{...result,sync:programSync}:result);
  };
}
