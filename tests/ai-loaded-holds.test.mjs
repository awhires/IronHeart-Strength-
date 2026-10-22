import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {trackingExercises,trackingProfile} from '../shared/tracking.mjs';
import {prepareProgram,prescriptionText,recordPerformance} from '../shared/prescriptions.mjs';
import {recommendAthleteLoad,sessionRecommendations} from '../shared/adaptive-prescriptions.mjs';
import {exerciseVolume} from '../shared/volume-stats.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {validateDraft,validateDraftStructure} from '../shared/ai/validate.mjs';
import {approveReview,createReview} from '../shared/ai/draft-state.mjs';
import {toIronHeartProgram} from '../shared/ai/convert.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';

const library=[...exercises,...trackingExercises];
const loadedHold=()=>({exerciseId:'back-rack-hold',exerciseName:'Back Rack Barbell Hold',trackingType:'loadedTimed',sets:4,rest:90,metrics:{durationSeconds:30,load:null,loadUnit:'lbs',distance:null,distanceUnit:null,rpe:null},loadMode:'percentage',percent1RM:80,referenceExerciseId:'squat',referenceExerciseName:'Barbell Back Squat',notes:'',progressionInstructions:''});

test('AI v2 represents a loaded hold as duration sets with a reference-lift percentage',()=>{
 const draft=createFixture();draft.schemaVersion=2;
 for(const week of draft.program.plan)for(const session of week.sessions){session.exercises=[loadedHold()];session.blocks=[];}
 assert.deepEqual(validateDraftStructure(draft),[]);
 assert.equal(validateDraft(draft,library).canApprove,true,JSON.stringify(validateDraft(draft,library).findings));
 const approved=approveReview(createReview(draft),library,{}, {coachId:'coach',warningsReviewed:true});
 const program=toIronHeartProgram(approved,library),target=program.plan[0].sessions[0].exercises[0];
 assert.equal(target.trackingType,'loadedTimed');assert.equal(target.metrics.durationSeconds,30);assert.equal(target.metrics.load,undefined);assert.equal(target.percent1RM,80);assert.equal(target.referenceExerciseId,'squat');
 assert.match(prescriptionText(target),/4 × 0:30.*80% of Barbell Back Squat 1RM/);
});

test('loaded-hold athlete recommendation resolves from current Back Squat evidence and preserves target on partial logging',()=>{
 const target=prepareProgram({name:'Hold test',goal:'Strength',weeks:1,description:'',sessions:[{name:'Hold day',day:4,exercises:[loadedHold()]}]},library).sessions[0].exercises[0];
 const logs=[{id:'squat-log',athleteId:'jordan',workoutDate:'2026-10-15',createdAt:'2026-10-15T18:00:00Z',readiness:4,pain:false,exercises:[{exerciseId:'squat',sets:[{load:300,loadUnit:'lbs',reps:1,rpe:8}]}]}];
 const recommendation=recommendAthleteLoad(target,{athleteId:'jordan',library,logs,today:'2026-10-22',date:'2026-10-22'});
 assert.equal(recommendation.status,'recommended');assert.equal(recommendation.load,240);assert.equal(recommendation.loadUnit,'lbs');assert.equal(recommendation.baseline.exerciseId,'squat');
 const assignment={id:'hold-assignment',athleteId:'jordan',startDate:'2026-10-22',plan:[{week:1,sessions:[{name:'Hold day',day:4,exercises:[target]}]}]};assert.equal(sessionRecommendations(assignment,1,0,logs,library,'2026-10-22')[0][0].load,240,'the assigned athlete recommendation pipeline resolves the reference-lift percentage');
 const withoutEvidence=recommendAthleteLoad(target,{athleteId:'jordan',library,logs:[],today:'2026-10-22'});assert.equal(withoutEvidence.status,'needs_baseline');assert.equal(withoutEvidence.load,undefined);
 const saved=recordPerformance([{exerciseId:target.exerciseId,actualSetGroups:true,sets:[{load:240,loadUnit:'lbs',durationSeconds:30,completed:true},{load:245,loadUnit:'lbs',durationSeconds:28,completed:true}]}],[target],library)[0];
 assert.equal(saved.status,'partially_completed');assert.equal(saved.target.metrics.load,null);assert.equal(saved.target.percent1RM,80);assert.deepEqual(saved.sets.map(s=>[s.load,s.durationSeconds]),[[240,30],[245,28]]);
});

test('explicit Exercise Library measurement profile survives save and reload',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};let api=createLocalDemo(storage);
 await api('demo','POST',{role:'coach'});
 const initial=await api('exercises','POST',{name:'Coach Hold Profile',region:'Isometric',equipment:'Barbell',pattern:'Hold',cues:'Brace safely.',video:'',trackingType:'loadedTimed'});
 const changed=await api('exercises','POST',{...initial,trackingType:'strength'});
 api=createLocalDemo(storage);const saved=(await api('data')).exercises.find(e=>e.id===changed.id);
 assert.equal(saved.trackingType,'strength');assert.equal(trackingProfile(saved),'strength');
 assert.equal(trackingProfile({exerciseId:'back-rack-hold',exerciseName:'Back Rack Barbell Hold',trackingType:'strength'}),'loadedTimed','legacy prescription metadata must not override a saved library profile default');
});

test('individual-set partial save keeps original prescription indexes and optional RPE',()=>{
 const target={exerciseId:'bench',sets:3,reps:5,load:100,loadUnit:'lbs',effortMode:'rpe',rpe:8,rest:120,setBlocks:[{sets:2,reps:5,load:100,loadUnit:'lbs',effortMode:'rpe',rpe:8},{sets:1,reps:3,load:140,loadUnit:'lbs',effortMode:'rpe',rpe:8}]};
 const actual=recordPerformance([{exerciseId:'bench',actualSetGroups:true,sets:[{prescriptionIndex:2,load:145,loadUnit:'lbs',reps:3,rpe:null,completed:true},{prescriptionIndex:0,load:105,loadUnit:'lbs',reps:5,rpe:8,completed:true}]}],[target],library)[0];
 assert.equal(actual.status,'partially_completed');assert.deepEqual(actual.sets.map(s=>[s.prescriptionIndex,s.reps,s.load,s.rpe]),[[2,3,145,null],[0,5,105,8]]);
});

test('phone preview saves only explicitly completed repeated sets and reports partial workout volume',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};let api=createLocalDemo(storage);
 await api('demo','POST',{role:'coach'});const program=await api('programs','POST',{name:'Partial sets test',goal:'Strength',weeks:1,description:'',sessions:[{name:'Bench test',day:4,exercises:[{exerciseId:'bench',sets:3,reps:5,load:100,loadUnit:'lbs',rest:120,rpe:8}]}]});
 const assignment=await api('assign','POST',{programId:program.id,athleteId:'jordan',startDate:'2026-10-19'});await api('demo','POST',{role:'athlete'});
 const saved=await api('log','POST',{assignmentId:assignment.id,week:1,session:0,prescriptionRevision:0,readiness:4,pain:false,notes:'',exercises:[{exerciseId:'bench',actualSetGroups:true,sets:[{prescriptionIndex:0,load:100,loadUnit:'lbs',reps:5,rpe:null,completed:true},{prescriptionIndex:1,load:105,loadUnit:'lbs',reps:5,rpe:8,completed:true}]}]});
 assert.equal(saved.status,'partially_completed');assert.equal(saved.exercises[0].status,'partially_completed');assert.deepEqual(saved.exercises[0].sets.map(s=>s.prescriptionIndex),[0,1]);assert.equal(saved.exercises[0].target.sets,3);assert.equal(exerciseVolume(saved,saved.exercises[0].exerciseId).validSets,2);
});
