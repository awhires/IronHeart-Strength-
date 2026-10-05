import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {trackingExercises,missingTrackingExercises,trackingProfile,exerciseCategory,expandBlocks,convertDistance,matchExercise,setSummary} from '../shared/tracking.mjs';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import {exerciseVolume} from '../shared/volume-stats.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
import {createScanService} from '../server/ai/scan.mjs';
import {createOpenAIProvider} from '../server/ai/openai.mjs';
import {reviewScan} from '../shared/scan-workout.mjs';
import {validateApiBase} from '../shared/api-connection.mjs';
const library=[...exercises,...missingTrackingExercises(exercises)];
const workout=entry=>prepareTrackerWorkout({sessionName:'Test',workoutDate:'2026-10-04',exercises:[entry]},library);
const blocks=[{count:5,reps:1,load:210},{count:3,reps:3,load:160}];
const scanned={sessionName:'Journal bench',notes:'',warnings:[],exercises:[{exerciseName:'BP',notes:'',blocks:blocks.map(b=>({...b,loadUnit:'lbs',rpe:null})),complex:[]}]};
test('grouped blocks expand to eight sets and 2490 lb, edits/deletes do not double count',()=>{
 const log=workout({exerciseId:'bench',blocks});assert.equal(log.exercises[0].sets.length,8);assert.equal(log.exercises[0].setBlocks.length,2);assert.equal(exerciseVolume(log,'bench').volume,2490);
 const edited=workout({exerciseId:'bench',blocks:[{...blocks[0],load:215},blocks[1]]});assert.equal(exerciseVolume(edited,'bench').volume,2515);
 assert.equal(exerciseVolume(workout({exerciseId:'bench',blocks:[blocks[1]]}),'bench').volume,1440);
 assert.throws(()=>expandBlocks([{count:31}]));assert.throws(()=>workout({exerciseId:'bench',blocks,sets:[{reps:5}]}));
});
test('Olympic library, aliases and exact complex display retain base association',()=>{
 assert.equal(missingTrackingExercises(library).length,0);assert.equal(library.filter(e=>e.name==='Front Squat').length,1);assert.equal(exerciseCategory(library.find(e=>e.id==='front-squat')),'Olympic Weightlifting');
 for(const name of ['Clean','Power Clean','Snatch','Power Snatch','Front Squat','Overhead Squat','Box Clean','Box Power Clean','Box Snatch','Box Power Snatch'])assert.ok(library.some(e=>e.name===name));
 for(const [alias,id] of [['PC','power-clean'],['BP','bench'],['BS','squat'],['FS','front-squat'],['OHS','overhead-squat'],['RDL','rdl']])assert.equal(matchExercise(alias,library).id,id);
 assert.equal(matchExercise('P',library),null);assert.equal(matchExercise('Clean',[{id:'a',name:'Clean'},{id:'b',name:'Clean'}]),null);
 const log=workout({exerciseId:'power-clean',blocks:[{count:3,load:185}],complex:[{exerciseId:'power-clean',reps:2,modifier:'pause'},{exerciseId:'power-clean',reps:1}]});
 assert.equal(log.exercises[0].complexText,'2 pause Power Clean + 1 Power Clean');assert.equal(log.exercises[0].sets.length,3);assert.equal(exerciseVolume(log,'power-clean').volume,1665);
 const mixed=workout({exerciseId:'power-clean',blocks:[{count:3,load:185}],complex:[{exerciseId:'power-clean',reps:1},{exerciseId:'front-squat',reps:1}]});assert.equal(exerciseVolume(mixed,'power-clean').volume,null);
});
test('Core and loaded holds/carries use relevant metrics without forced reps or fabricated volume',()=>{
 for(const [id,set] of [['plank',{durationSeconds:30}],['pushup-plank',{durationSeconds:30}],['weighted-plank',{load:25,durationSeconds:30}],['l-sit',{durationSeconds:10}],['back-rack-hold',{load:405,durationSeconds:30}],...['suitcase-db','suitcase-kb','farmer-db','farmer-kb'].map(id=>[id,{load:60,distance:40,distanceUnit:'m',durationSeconds:45}])]){
 const log=workout({exerciseId:id,blocks:[{count:3,...set}]});assert.equal(log.exercises[0].sets[0].reps,undefined);assert.equal(exerciseVolume(log,id).volume,null);assert.ok(setSummary(log.exercises[0].sets[0]).length>0);
 }
 for(const id of ['hanging-leg-raise','hanging-knee-raise'])assert.equal(workout({exerciseId:id,sets:[{reps:10}]}).exercises[0].sets[0].reps,10);
 assert.throws(()=>workout({exerciseId:'back-rack-hold',sets:[{load:405}]}));
});
test('cardio modalities, pace, distance conversions and multiple intervals preserve raw measurements',()=>{
 const cases=[['treadmill',{distance:3,distanceUnit:'mi',durationSeconds:1800,speedMph:6,incline:2}],['stair-stepper',{level:7,durationSeconds:600}],['skierg',{distance:2,distanceUnit:'km',durationSeconds:480,paceSeconds:120}],['rowerg',{distance:2,distanceUnit:'km',durationSeconds:460,paceSeconds:115}],['outdoor-running',{distance:3,distanceUnit:'mi',durationSeconds:1800,paceSeconds:600}]];
 for(const [id,set] of cases){const log=workout({exerciseId:id,sets:[set]});for(const [k,v] of Object.entries(set))assert.equal(log.exercises[0].sets[0][k],v);assert.equal(exerciseVolume(log,id).volume,null);}
 assert.ok(setSummary(cases[3][1],'erg').includes('1:55 / 500 m'));
 assert.equal(convertDistance(1,'mi','km'),1.609344);assert.ok(Math.abs(convertDistance(1.609344,'km','mi')-1)<1e-10);
 const intervals=[{rounds:6,work:{durationSeconds:120,speedMph:9},recovery:{durationSeconds:60}},{rounds:2,work:{distance:1,distanceUnit:'km'},recovery:{durationSeconds:90}}];
 assert.deepEqual(workout({exerciseId:'treadmill',sets:[cases[0][1]],intervals}).exercises[0].intervals,intervals);
 const erg=[{rounds:5,work:{distance:500,distanceUnit:'m',paceSeconds:110},recovery:{durationSeconds:120}}];assert.deepEqual(workout({exerciseId:'rowerg',sets:[cases[3][1]],intervals:erg}).exercises[0].intervals,erg);
 assert.throws(()=>workout({exerciseId:'treadmill',sets:[{durationSeconds:60}],intervals:[{rounds:1,work:{},recovery:{}}]}));
});
test('mock image extraction returns review only; corrections go through ordinary authenticated journal save',async()=>{
 const disk=new Map(),api=createLocalDemo({getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)});await api('demo','POST',{role:'athlete'});const before=structuredClone((await api('data')).logs);
 let seen;const svc=createScanService({config:{enabled:true,requestsPerHour:6},provider:{generateProgramDraft:async(a,b,task)=>{seen=task;return structuredClone(scanned);}}});
 const draft=await svc.scan({image:'data:image/png;base64,aGVsbG8='},{userId:'jordan',library});assert.equal(draft.requiresReview,true);assert.ok(seen.image);assert.deepEqual((await api('data')).logs,before);
 draft.workout.exercises[0].blocks[0].load=215;const saved=await api('tracker','POST',draft.workout);assert.equal(exerciseVolume(saved,'bench').volume,2515);
 const complex=reviewScan({...scanned,exercises:[{exerciseName:'PC',notes:'',blocks:[{count:3,reps:null,load:185,loadUnit:'lbs',rpe:null}],complex:[{exerciseName:'PC',reps:2,modifier:'pause'},{exerciseName:'PC',reps:1,modifier:''}]}]},library);assert.equal(workout(complex.workout.exercises[0]).exercises[0].complexText,'2 pause Power Clean + 1 Power Clean');
 const unresolved=reviewScan({...scanned,exercises:[{...scanned.exercises[0],exerciseName:'P'}]},library);assert.equal(unresolved.workout.exercises[0].exerciseId,'');assert.throws(()=>workout(unresolved.workout.exercises[0]));
 await assert.rejects(svc.scan({image:'https://example.com/photo'},{userId:'jordan',library}));
});
test('OpenAI scan reuses secure adapter image input and schema with no tools or stored response',async()=>{
 let payload;const p=createOpenAIProvider({apiKey:'server-test-secret',fetchImpl:async(url,opts)=>{payload=JSON.parse(opts.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(scanned)}]}]}));}});
 const svc=createScanService({config:{requestsPerHour:6},provider:p});await svc.scan({image:'data:image/png;base64,aGVsbG8='},{userId:'athlete',library});assert.equal(payload.input[0].content[1].type,'input_image');assert.equal(payload.store,false);assert.equal(payload.tools,undefined);assert.ok(!JSON.stringify(payload).includes('server-test-secret'));
});
test('API address accepts private debug LAN or HTTPS and rejects credentials/public cleartext',()=>{
 assert.equal(validateApiBase('http://192.168.1.2:4173',{preview:true}),'http://192.168.1.2:4173');assert.equal(validateApiBase('https://example.com'),'https://example.com');
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com?key=secret','javascript:alert(1)','http://192.168.1.2:4173'])assert.throws(()=>validateApiBase(url));
});

import {newPrescription,prepareItems,prescribedSets,prescriptionText,recordPerformance} from '../shared/prescriptions.mjs';
import {generateBlock} from '../server/progression.mjs';
test('varied programmed blocks preserve targets, assigned logging and coach-owned progression',()=>{
 const target={...newPrescription('bench'),sets:6,reps:3,loadMode:'fixed',load:200,setBlocks:[{sets:3,reps:3,load:200},{sets:3,reps:2,load:205}]};
 const [saved]=prepareItems([target],library);assert.deepEqual(saved.setBlocks,target.setBlocks);const sets=prescribedSets(saved);assert.equal(sets.length,6);assert.equal(sets[5].load,205);assert.equal(sets[5].reps,2);assert.ok(prescriptionText(saved).includes('3 × 2'));
 const performance=recordPerformance([{exerciseId:'bench',sets:sets.map(s=>({reps:s.reps,load:s.load,rpe:7}))}],[saved]);assert.equal(exerciseVolume({exercises:performance},'bench').volume,3030);
 const generated=generateBlock([{name:'Bench',day:1,exercises:[saved]}],4);assert.deepEqual(generated[1].sessions[0].exercises[0].setBlocks,target.setBlocks);
 assert.throws(()=>prepareItems([{...target,sets:4}],library));assert.throws(()=>prepareItems([{...target,setBlocks:[null]}],library));
});
