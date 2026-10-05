import {missingConditioningExercises,missingSingleUnders} from '../shared/conditioning-library.mjs';
import {recordBlockScores,referencesExercise} from '../shared/workout-blocks.mjs';
import {missingTrackingExercises} from '../shared/tracking.mjs';
// Device-only preview. No remote accounts or synchronization are implied.
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import { exercises, programs } from '../server/seed.mjs';
import { periodize, recommend } from '../server/progression.mjs';
import { toPounds } from '../server/units.mjs';
import {prepareProgram,prepareSession,prepareItems,recordPerformance,normalizeData} from '../shared/prescriptions.mjs';
import {createDraftSaveService} from '../shared/ai/save-service.mjs';
import {LIBRARY_UPDATE,missingLibraryExercises} from '../shared/exercise-library.mjs';
const KEY='iron-heart-phone-preview-v1';
const clone=value=>structuredClone(value);
const id=()=>crypto.randomUUID();
function assignment(p,athleteId,startDate){return {id:id(),athleteId,programId:p.id,name:p.name,goal:p.goal,coachNotes:p.coachNotes,progressionInstructions:p.progressionInstructions,aiProvenance:clone(p.aiProvenance),weeks:p.weeks,startDate,progressionOptions:clone(p.progressionOptions),plan:p.plan?clone(p.plan):Array.from({length:p.weeks},(_,i)=>({week:i+1,sessions:p.sessions.map(s=>({...clone(s),exercises:s.exercises.map(e=>periodize(e,i+1,p.weeks))}))}))};}
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
    if(!state.libraryUpdates?.includes(LIBRARY_UPDATE)){
      state.exercises.push(...missingLibraryExercises(state.exercises));
      state.libraryUpdates=[...(state.libraryUpdates||[]),LIBRARY_UPDATE];
    }
    if(!state.libraryUpdates?.includes('tracking-library-v1')){state.exercises.push(...missingTrackingExercises(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'tracking-library-v1'];}
    if(!state.libraryUpdates?.includes('conditioning-library-v1')){state.exercises.push(...missingConditioningExercises(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'conditioning-library-v1'];}
    if(!state.libraryUpdates?.includes('single-unders-v1')){state.exercises.push(...missingSingleUnders(state.exercises));state.libraryUpdates=[...(state.libraryUpdates||[]),'single-unders-v1'];}
    const b=clone(body),url=new URL(path,'https://preview.local/'),route=url.pathname.slice(1);
    const user=state.active==='coach'?state.coach:state.athletes.find(a=>a.id===state.active);
    const coach=()=>{if(user?.role!=='coach')throw Error('Open Coach view to make this change.');};
    const owned=key=>{const a=state.assignments.find(a=>a.id===key);if(!a||user.role!=='coach'&&a.athleteId!==user.id)throw Error('Program not found.');return a;};
    const session=()=>{const a=owned(b.id||b.assignmentId),s=a.plan.find(w=>w.week===b.week)?.sessions[b.session];if(!s)throw Error('Session not found.');return {a,s};};
    const save=(collection,value)=>{const i=state[collection].findIndex(x=>x.id===value.id);if(i<0)state[collection].push(value);else state[collection][i]=value;return value;};
    const eraseAthlete=key=>{state.athletes=state.athletes.filter(x=>x.id!==key);state.assignments=state.assignments.filter(x=>x.athleteId!==key);state.logs=state.logs.filter(x=>x.athleteId!==key);};
    const requestId=b.clientRequestId;delete b.clientRequestId;
    const receiptKey=requestId&&user?`${user.id}:${requestId}`:null;
    if(receiptKey&&['log','tracker'].includes(route)&&method==='POST'){const old=state.workoutReceipts?.[receiptKey];if(old){if(old.payload!==JSON.stringify({route,b}))throw Error('Save ID belongs to a different workout.');const prior=state.logs.find(l=>l.id===old.id);if(!prior)throw Error('Workout was deleted; start a new workout to redo it.');return clone(prior);}}
    let result={ok:true};
    if(route==='config')result={demo:true,standalone:true,previewAthletes:state.athletes.map(({id,name})=>({id,name}))};
    else if(route==='demo'&&method==='POST'){
      const selected=b.role==='athlete'?(b.athleteId?state.athletes.find(a=>a.id===b.athleteId):state.athletes.find(a=>a.id==='jordan')||state.athletes[0]):state.coach;
      if(!selected)throw Error('Add an athlete in Coach view first.');
      state.active=selected.id;result={user:selected};
    }else if(route==='logout'){state.active=null;}
    else if(['login','redeem','invite'].includes(route))throw Error('Live sign-in and invitations require the hosted version. This preview saves only on this phone.');
    else{
      if(!user)throw Error('Choose Coach view or Athlete view.');
      if(route==='data')result={user,demo:true,standalone:true,exercises:state.exercises,programs:user.role==='coach'?state.programs:[],athletes:user.role==='coach'?state.athletes:[],assignments:state.assignments.filter(a=>user.role==='coach'||a.athleteId===user.id),logs:state.logs.filter(l=>user.role==='coach'||l.athleteId===user.id)};
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
        result=save(route,{...prepared,id:b.id||id()});
      }else if(route==='athletes'&&method==='POST'){
        coach();if(!b.name?.trim()||!b.email?.trim())throw Error('Enter an athlete name and email.');
        if(state.athletes.some(a=>a.email.toLowerCase()===b.email.toLowerCase()))throw Error('This athlete email already exists.');
        result=save('athletes',{...b,id:id(),role:'athlete'});
      }else if(route==='assign'&&method==='POST'){
        coach();const p=state.programs.find(p=>p.id===b.programId);
        if(!p||!state.athletes.some(a=>a.id===b.athleteId)||!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate))throw Error('Choose a program, athlete, and start date.');
        result=save('assignments',assignment(p,b.athleteId,b.startDate));
      }else if(['assignment','reschedule','session-status'].includes(route)){
        coach();const {a,s}=session();
        if(route==='assignment'){Object.assign(s,prepareSession({...s,exercises:b.exercises,...(b.blocks!==undefined?{blocks:b.blocks}:{})},state.exercises));}
        if(route==='reschedule'){if(!Number.isInteger(b.day)||b.day<0||b.day>6)throw Error('Choose a weekday.');s.day=b.day;}
        if(route==='session-status')s.cancelled=!!b.cancelled;
        result=a;
      }else if(route==='tracker'&&method==='POST'){
        if(user.role!=='athlete')throw Error('Open Athlete view to journal a workout.');
        const workout=prepareTrackerWorkout(b,state.exercises);
        result=save('logs',{...workout,id:id(),athleteId:user.id,createdAt:new Date().toISOString()});
      }else if(route==='log'&&method==='POST'){
        if(user.role!=='athlete')throw Error('Open Athlete view to log a workout.');
        const {a,s}=session();if(s.cancelled)throw Error('This session is removed from the calendar.');
        if(state.logs.some(l=>l.assignmentId===a.id&&l.week===b.week&&l.session===b.session))throw Error('This workout is already logged. Delete its log to redo it.');
        if(!b.exercises||b.exercises.length!==s.exercises.length)throw Error('Complete every exercise.');
        const recorded=recordPerformance(b.exercises,s.exercises,state.exercises);
        const blockResults=recordBlockScores(b.blockResults,s.blocks);
        result=save('logs',{...b,id:id(),athleteId:user.id,sessionName:s.name,createdAt:new Date().toISOString(),exercises:recorded,...(blockResults.length?{blockResults,blocks:clone(s.blocks)}:{})});
      }else if(route==='recommendations'){
        coach();const a=owned(url.searchParams.get('id')),week=a.plan.find(w=>w.week===Number(url.searchParams.get('week')));if(!week)throw Error('Week not found.');
        result=week.sessions.flatMap((s,si)=>s.exercises.map((e,ei)=>({session:si,index:ei,exerciseId:e.exerciseId,current:e.load,...recommend(e,state.logs.filter(l=>l.athleteId===a.athleteId&&l.source!=='tracker').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).flatMap(l=>l.exercises.filter(x=>x.exerciseId===e.exerciseId).map(x=>({...x,pain:l.pain,readiness:l.readiness}))))})));
      }else if(route==='delete'&&method==='POST'){
        if(b.kind==='athlete'){coach();eraseAthlete(b.id);}
        else{
          const collection={program:'programs',exercise:'exercises',assignment:'assignments',log:'logs'}[b.kind];
          const record=collection&&state[collection].find(x=>x.id===b.id);if(!record)throw Error('Record not found.');
          if(b.kind==='log'){if(user.role!=='coach'&&record.athleteId!==user.id)throw Error('Access denied.');}else coach();
          if(b.kind==='exercise'&&[...state.programs,...state.assignments,...state.logs].some(r=>referencesExercise(r,b.id)))throw Error('This exercise is still used in a program or workout history.');
          state[collection]=state[collection].filter(x=>x.id!==b.id);
        }
      }else if(route==='account'&&method==='DELETE'){
        if(user.role!=='athlete')throw Error('Only an athlete account can be removed here.');eraseAthlete(user.id);state.active=null;
      }else throw Error('This action is not available in the phone preview.');
    }
    // Persist before acknowledging success; quota failures leave the prior state intact.
    if(receiptKey&&['log','tracker'].includes(route)&&method==='POST'){state.workoutReceipts={...(state.workoutReceipts||{}),[receiptKey]:{id:result.id,payload:JSON.stringify({route,b})}};}
    storage.setItem(KEY,JSON.stringify(state));
    return route==='data'?normalizeData(result):clone(result);
  };
}
