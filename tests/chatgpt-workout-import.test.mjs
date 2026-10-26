import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exercises} from '../server/seed.mjs';
import {trackingExercises} from '../shared/tracking.mjs';
import {conditioningExercises} from '../shared/conditioning-library.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {prepareBlocks} from '../shared/workout-blocks.mjs';
import {parseChatGPTWorkoutImport,applyWorkoutImportMappings,validateMappedWorkoutImport,chatGPTWorkoutImportEnvelope} from '../shared/chatgpt-workout-import.mjs';

const library=[...exercises,...trackingExercises,...conditioningExercises];
const envelope=draft=>JSON.stringify(chatGPTWorkoutImportEnvelope(draft));
function hybrid(weeks=6){
 const draft=createFixture();draft.schemaVersion=2;draft.program.name='ChatGPT Hybrid Example';draft.program.goal='Strength and conditioning';draft.program.weeks=weeks;
 draft.program.plan=Array.from({length:weeks},(_,wi)=>({week:wi+1,sessions:[
  {name:'Strength + Metcon',day:1,maxDurationMinutes:75,coachNotes:'Keep technique crisp.',exercises:[{...structuredClone(draft.program.plan[0].sessions[0].exercises[0]),exerciseId:'bench',exerciseName:'Bench Press',sets:5,reps:5,setBlocks:[{sets:3,reps:5,loadMode:'athlete_selected',load:null,loadUnit:'lbs',loadDelta:null,percent1RM:null,referenceExerciseId:null,referenceExerciseName:null,reference1RM:null,referenceLoad:null,effortMode:'none',rpe:null,rir:null,rest:120,tempo:null,increment:5,notes:'',progressionInstructions:''},{sets:2,reps:3,loadMode:'athlete_selected',load:null,loadUnit:'lbs',loadDelta:null,percent1RM:null,referenceExerciseId:null,referenceExerciseName:null,reference1RM:null,referenceLoad:null,effortMode:'none',rpe:null,rir:null,rest:120,tempo:null,increment:5,notes:'Back-off',progressionInstructions:''}]},{...structuredClone(draft.program.plan[0].sessions[0].exercises[1]),exerciseId:'row',exerciseName:'Bent-over Barbell Row'}],blocks:[{id:`super-${wi}`,type:'Strength',name:'A1/A2 Superset',exerciseIndexes:[0,1],superset:true,supersetNotes:'Alternate movements.',restSeconds:90},{id:`metcon-${wi}`,type:'Metcon',name:'Conditioning',metcon:{name:'Short AMRAP',scoreType:'AMRAP',scoreMode:'rounds_reps',format:'standard',benchmark:false,repScheme:[],movements:[{exerciseId:'burpees',exerciseName:'Burpees',reps:8}],rounds:null,durationSeconds:600,intervalSeconds:null,timeCapSeconds:null,workSeconds:null,restSeconds:null,notes:''}}]},
  {name:'Run Intervals',day:3,maxDurationMinutes:60,coachNotes:'Assessment-derived target; coach confirms source.',exercises:[{exerciseId:'outdoor-running',exerciseName:'Outdoor Running',trackingType:'running',intervalCount:6,restSeconds:0,metrics:{distance:null,distanceUnit:'mi',paceUnit:'mi',durationSeconds:null,paceSeconds:null},intervals:[{rounds:6,work:{durationSeconds:120,paceSeconds:300,paceUnit:'mi'},segments:[{kind:'work',label:'Work',metrics:{durationSeconds:120,paceSeconds:300,paceUnit:'mi'}}],recovery:{durationSeconds:90},recoveryAfterFinal:false,recoveryRule:{preset:'threshold',recoveryPerWork:0.75,workDurationSeconds:120}}],paceMethod:{type:'assessment',source:'six_minute',category:'vo2Intervals',unit:'mi',locked:false},notes:'',progressionInstructions:'Progress only after review.'}],blocks:[{id:`cardio-${wi}`,type:'Cardio',name:'Running intervals',exerciseIndexes:[0]}]}
 ]}));
 return draft;
}

test('versioned import accepts complete six-week hybrid with grouped sets, superset, interval recovery and assessment pace',()=>{
 const before=hybrid(),result=parseChatGPTWorkoutImport(envelope(before),library);
 assert.equal(result.draft.program.plan.length,6);assert.deepEqual(result.unresolved,[]);
 assert.equal(result.draft.program.plan[0].sessions[0].exercises[0].setBlocks.length,2);
 assert.equal(result.draft.program.plan[0].sessions[0].blocks[0].superset,true);
 const run=result.draft.program.plan[0].sessions[1].exercises[0];assert.equal(run.intervals[0].recoveryRule.recoveryPerWork,.75);assert.equal(run.paceMethod.source,'six_minute');
 const validation=validateMappedWorkoutImport(result.draft,library);assert.equal(validation.canApprove,true,JSON.stringify(validation.findings));
 assert.equal(before.status,'draft');assert.equal(before.athleteId,null);
});
test('malformed or incompatible envelopes are rejected without mutation',()=>{
 assert.throws(()=>parseChatGPTWorkoutImport('{oops',library),/Invalid JSON/);
 const wrong=hybrid();assert.throws(()=>parseChatGPTWorkoutImport(JSON.stringify({format:'iron-heart-strength-workout',version:2,draft:wrong}),library),/version 2/);
 const assigned=hybrid();assigned.athleteId='athlete-1';assert.throws(()=>parseChatGPTWorkoutImport(JSON.stringify({format:'iron-heart-strength-workout',version:1,draft:assigned}),library),/cannot target an athlete/);
 const published=hybrid();published.status='approved';assert.throws(()=>parseChatGPTWorkoutImport(JSON.stringify({format:'iron-heart-strength-workout',version:1,draft:published}),library),/status "draft"/);
});
test('unknown library exercises remain explicit and can only be mapped by coach choice',()=>{
 const draft=hybrid(1);draft.program.plan[0].sessions[0].exercises[0].exerciseId=null;draft.program.plan[0].sessions[0].exercises[0].exerciseName='Bench Press (unknown alias)';
 const parsed=parseChatGPTWorkoutImport(envelope(draft),library);assert.ok(parsed.unresolved.some(x=>x.path==='/program/plan/0/sessions/0/exercises/0'));
 assert.doesNotThrow(()=>applyWorkoutImportMappings(parsed.draft,{["/program/plan/0/sessions/0/exercises/0"]:''},library));
 const path='/program/plan/0/sessions/0/exercises/0',mapped=applyWorkoutImportMappings(parsed.draft,{[path]:'bench'},library);
 assert.equal(mapped.program.plan[0].sessions[0].exercises[0].exerciseName,'Bench Press');
 const validation=validateMappedWorkoutImport(mapped,library);assert.equal(validation.counts.error,0,JSON.stringify(validation.findings));
});
test('invalid blocks remain visible as validation errors and are not silently repaired',()=>{
 const draft=hybrid(1);draft.program.plan[0].sessions[0].blocks[0].exerciseIndexes=[0];
 const parsed=parseChatGPTWorkoutImport(envelope(draft),library);assert.ok(parsed.validation.findings.some(x=>x.code==='INVALID_WORKOUT_BLOCK'||x.code==='INVALID_SUPERSET'));
 assert.throws(()=>prepareBlocks([{id:'bad',type:'Metcon',name:'Missing score'}],[ ],library),/Metcon|movements|scoring/i);
});
test('import helper is pure and returns an unapproved draft; it performs no athlete/program writes',()=>{
 const draft=hybrid(1),result=parseChatGPTWorkoutImport(envelope(draft),library);
 assert.equal(result.draft.status,'draft');assert.equal(result.draft.athleteId,null);assert.equal(result.draft.sourceProgramId,null);
 assert.equal(Object.hasOwn(result,'assignment'),false);assert.equal(Object.hasOwn(result,'savedProgram'),false);
});
test('documented six-week hybrid JSON remains importable and keeps its no-baseline warnings',()=>{
 const json=readFileSync(new URL('../docs/examples/chatgpt-hybrid-6-week-v1.json',import.meta.url),'utf8');
 const result=parseChatGPTWorkoutImport(json,library);
 assert.equal(result.draft.program.plan.length,6);assert.equal(result.unresolved.length,0);assert.equal(result.validation.counts.error,0);
 assert.ok(result.validation.findings.some(f=>f.code==='MISSING_REFERENCE_1RM'),'example should explain that no estimated weight is invented without a baseline');
});
