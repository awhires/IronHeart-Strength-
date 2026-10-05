import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTime,formatTime} from '../shared/time.mjs';
import {cardioMetrics,cardioStats,comparableDistance} from '../shared/cardio-stats.mjs';
import {prepareMetcon,prepareMetconScore,prepareBlocks,recordBlockScores,metconKey,scoreFields} from '../shared/workout-blocks.mjs';
import {metconStats} from '../shared/metcon-stats.mjs';
import {prepareProgram,newPrescription,recordPerformance} from '../shared/prescriptions.mjs';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import {trackingExercises,setSummary,trackingProfile} from '../shared/tracking.mjs';
import {exercises} from '../server/seed.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const library=[...exercises,...trackingExercises];
const erg=trackingExercises.find(e=>e.id==='rowerg');
const m={name:'Annie',scoreType:'For Time',repScheme:[50,40,30,20,10],movements:[{exerciseId:'bench',reps:10,load:135,loadUnit:'lbs'}],notes:''};
const log=(id,distance,durationSeconds,extra={})=>({id,athleteId:'a',workoutDate:`2026-10-${String(id).padStart(2,'0')}`,exercises:[{exerciseId:'rowerg',sets:[{distance,distanceUnit:'m',durationSeconds,...extra}]}]});
test('M:SS parses duration and pace, preserves empty and rejects malformed seconds',()=>{
 assert.equal(parseTime('5:30'),330);assert.equal(parseTime('1:44'),104);assert.equal(parseTime('65:00'),3900);assert.equal(parseTime(''),null);assert.equal(parseTime(330),330);
 for(const v of ['1:60','1:4','-1:00','abc','1:02:03'])assert.throws(()=>parseTime(v));
 assert.equal(formatTime(330),'5:30');assert.equal(formatTime(104),'1:44');assert.equal(formatTime(59.9),'1:00');assert.equal(formatTime(null),'');
 assert.match(setSummary({durationSeconds:330,paceSeconds:104},'erg'),/5:30.*1:44 \/ 500 m/);
});
test('pace calculations use meters and seconds, convert mile and yard units',()=>{
 assert.equal(cardioMetrics({distance:500,distanceUnit:'m',durationSeconds:104},'erg').paceSeconds,104);
 assert.equal(cardioMetrics({distance:1,distanceUnit:'mi',durationSeconds:480},'running').paceSeconds,480);
 assert.equal(cardioMetrics({distance:100,distanceUnit:'yd',durationSeconds:90},'swimming').paceSeconds,90);
 assert.equal(cardioMetrics({distance:1,distanceUnit:'km',durationSeconds:300},'running').paceSeconds,300);
 assert.equal(cardioMetrics({distance:1,distanceUnit:'km'},'running').speed,null);
});
test('comparable distance does not mix one mile and five miles',()=>{
 assert.equal(comparableDistance(1609.344,1609),true);assert.equal(comparableDistance(1609,8046),false);assert.equal(comparableDistance(null,0),false);
});
test('cardio totals, distance PB, fixed-duration PB, trends and ownership',()=>{
 const logs=[log(1,2000,500),log(2,5000,1000),log(3,2000,480),{...log(4,2000,100),athleteId:'other'},log(5,2000,460)];
 const s=cardioStats(logs,erg,'a');assert.equal(s.sessions.length,4);assert.equal(s.totals.meters,11000);assert.equal(s.totals.seconds,2440);assert.equal(s.previous.id,3);assert.equal(s.best.id,5);assert.equal(s.comparable.length,3);assert.equal(s.status,'Improving');assert.equal(s.distanceBests.length,2);assert.equal(s.distanceBests[0].id,5);assert.ok(s.baselineChange>0);assert.equal(s.months.length,1);assert.ok(s.weeks.length);
 const fixed=cardioStats([log(1,1000,300),log(2,1200,300)],erg,'a');assert.equal(fixed.fixedDurationBests[0].meters,1200);
});
test('incline/interval differences and missing metrics do not invent improvements',()=>{
 const s=cardioStats([log(1,2000,500,{incline:2}),log(2,2000,480,{incline:5})],erg,'a');assert.equal(s.previous,null);assert.equal(s.status,'Not enough comparable data');
 const missing=cardioStats([log(1,2000,null),log(2,null,500)],erg,'a');assert.equal(missing.latest.speed,null);assert.equal(missing.best,null);
});
test('declining and maintaining are based on comparable normalized performance',()=>{
 assert.equal(cardioStats([log(1,2000,400),log(2,2000,500)],erg,'a').status,'Declining');
 assert.equal(cardioStats([log(1,2000,500),log(2,2000,501)],erg,'a').status,'Maintaining');
});
test('bike power, cadence and swimming profiles preserve appropriate metrics',()=>{
 for(const [name,type] of [['Stationary Bike','cycling'],['Swimming','swimming'],['Trail Run','running']])assert.equal(trackingProfile({name}),type);
 const custom=[{id:'bike',name:'Stationary Bike'}];const w=prepareTrackerWorkout({sessionName:'Ride',exercises:[{exerciseId:'bike',sets:[{durationSeconds:1200,distance:10,distanceUnit:'km',watts:200,cadence:85}]}]},custom);
 assert.equal(w.exercises[0].sets[0].watts,200);assert.equal(w.exercises[0].sets[0].cadence,85);
});
test('For Time named and custom metcons preserve scheme, loads and cap',()=>{
 const clean=prepareMetcon({...m,timeCapSeconds:600},library);assert.equal(clean.movements[0].load,135);assert.equal(clean.repScheme.length,5);
 assert.equal(prepareMetconScore({rx:'RX',timeSeconds:522,load:135,loadUnit:'lbs'},clean).timeSeconds,522);
 assert.throws(()=>prepareMetconScore({rx:'RX',timeSeconds:601},clean));assert.throws(()=>prepareMetconScore({rx:'RX'},clean));
 assert.equal(metconKey(clean),metconKey({...clean,name:'Custom identical benchmark'}));
});
for(const type of ['AMRAP','Rounds + Reps'])test(type+' requires duration and rounds plus reps',()=>{
 const clean=prepareMetcon({...m,scoreType:type,durationSeconds:720},library);assert.deepEqual(prepareMetconScore({rx:'RX',rounds:5,reps:14},clean),{rx:'RX',notes:'',rounds:5,reps:14});assert.throws(()=>prepareMetcon({...m,scoreType:type},library));assert.throws(()=>prepareMetconScore({rx:'RX',rounds:5},clean));
});
test('EMOM records completion, successful minutes, intervals and optional load',()=>{
 const clean=prepareMetcon({...m,scoreType:'EMOM',durationSeconds:600,workSeconds:40,restSeconds:20,movements:[{exerciseId:'rowerg',calories:10,minute:1}]},library);
 assert.equal(prepareMetconScore({rx:'RX',completed:false,successfulMinutes:8,load:100,loadUnit:'lbs'},clean).successfulMinutes,8);
 assert.deepEqual(scoreFields('EMOM'),['completed','successfulMinutes','load']);assert.throws(()=>prepareMetconScore({rx:'RX',successfulMinutes:8},clean));
});
test('Rounds for Time, Time Cap and load event have score-specific validation',()=>{
 assert.throws(()=>prepareMetcon({...m,scoreType:'Rounds for Time'},library));assert.equal(prepareMetcon({...m,scoreType:'Rounds for Time',rounds:5},library).rounds,5);
 const cap=prepareMetcon({...m,scoreType:'Time Cap',timeCapSeconds:600},library);assert.equal(prepareMetconScore({rx:'RX',completed:false,rounds:4,reps:10},cap).reps,10);assert.throws(()=>prepareMetconScore({rx:'RX',completed:true},cap));
 const load=prepareMetcon({...m,scoreType:'Load'},library);assert.equal(prepareMetconScore({rx:'RX',load:200,loadUnit:'lbs',reps:3,timeSeconds:30},load).load,200);assert.throws(()=>prepareMetconScore({rx:'RX'},load));
});
test('mixed session stores canonical exercises and ordered block indexes without duplication',()=>{
 const p=prepareProgram({name:'Mixed',goal:'Performance',weeks:4,sessions:[{name:'Day',day:1,exercises:[newPrescription('bench'),{exerciseId:'rowerg',trackingType:'erg',metrics:{durationSeconds:330,paceSeconds:104,distanceUnit:'m'}}],blocks:[{id:'s',type:'Strength',exerciseIndexes:[0]},{id:'m',type:'Metcon',metcon:m},{id:'c',type:'Cardio',exerciseIndexes:[1]}]}]},library);
 assert.equal(p.sessions[0].blocks[1].metcon.name,'Annie');assert.equal(p.sessions[0].exercises.length,2);
 const score=recordBlockScores([{blockId:'m',score:{rx:'RX',timeSeconds:522}}],p.sessions[0].blocks);p.sessions[0].blocks[1].metcon.name='Edited';assert.equal(score[0].metcon.name,'Annie');assert.throws(()=>recordBlockScores([],p.sessions[0].blocks));
 assert.throws(()=>prepareBlocks([{type:'Strength',exerciseIndexes:[0,0]}],[{}],library));
 const cardio=recordPerformance([{exerciseId:'rowerg',sets:[{durationSeconds:330,paceSeconds:104,distanceUnit:'m'}]}],[p.sessions[0].exercises[1]],library);assert.equal(cardio[0].sets[0].durationSeconds,330);
});
test('Metcon repeat comparisons separate structure, RX/scaled and actual loads',()=>{
 const clean=prepareMetcon(m,library);const logs=[600,550,520].map((timeSeconds,i)=>({id:String(i),athleteId:'a',workoutDate:`2026-10-0${i+1}`,exercises:[],blockResults:[{metcon:clean,score:{rx:'RX',timeSeconds}}]}));
 const s=metconStats(logs,'a',metconKey(clean));assert.equal(s.best.score.timeSeconds,520);assert.equal(s.previous.score.timeSeconds,550);assert.equal(s.improvement,30);assert.equal(s.status,'Improving');assert.equal(metconStats(logs,'other',metconKey(clean)).sessions.length,0);
 assert.notEqual(metconKey({...clean,repScheme:[21,15,9]}),metconKey(clean));assert.equal(metconStats(logs,'a',metconKey(clean),'Scaled').sessions.length,0);
});
test('phone preview saves, assigns, logs mixed blocks and preserves old history on edit',async()=>{
 const disk=new Map(),api=createLocalDemo({getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)});await api('demo','POST',{role:'coach'});
 const p=await api('programs','POST',{name:'Mixed test',goal:'Fitness',weeks:4,sessions:[{name:'Mixed day',day:1,exercises:[],blocks:[{id:'m',type:'Metcon',metcon:m}]}]});
 const a=await api('assign','POST',{programId:p.id,athleteId:'jordan',startDate:'2026-10-05'});assert.equal(a.plan[0].sessions[0].blocks[0].metcon.name,'Annie');
 await api('demo','POST',{role:'athlete'});const l=await api('log','POST',{assignmentId:a.id,week:1,session:0,exercises:[],blockResults:[{blockId:'m',score:{rx:'RX',timeSeconds:522}}],readiness:3,pain:false,notes:''});assert.equal(l.blockResults[0].score.timeSeconds,522);
 const j=await api('tracker','POST',{sessionName:'Metcon journal',exercises:[],blockResults:[{metcon:m,score:{rx:'RX',timeSeconds:510}}]});assert.equal(j.blockResults[0].metcon.name,'Annie');
 await api('demo','POST',{role:'coach'});await api('assignment','PUT',{id:a.id,week:1,session:0,exercises:[],blocks:[{id:'m',type:'Metcon',metcon:{...m,name:'Changed'}}]});assert.equal((await api('data')).logs.find(x=>x.id===l.id).blockResults[0].metcon.name,'Annie');
});
