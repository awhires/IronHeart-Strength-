import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretMetconWhiteboard} from '../shared/metcon-whiteboard.mjs';
import {prepareProgram} from '../shared/prescriptions.mjs';
import {metconKey,recordBlockScores} from '../shared/workout-blocks.mjs';

const library=[
  {id:'thruster',name:'Thruster'},
  {id:'pull-up',name:'Pull-up'},
  {id:'burpee',name:'Burpee'},
];

test('whiteboard draft interprets benchmark, rep scheme, library movements, and pound targets',()=>{
  const result=interpretMetconWhiteboard('FRAN\n21-15-9\nThruster — 95 lb\nPull-up\nFor Time',library);
  assert.equal(result.metcon.name,'FRAN');
  assert.equal(result.metcon.scoreType,'For Time');
  assert.deepEqual(result.metcon.repScheme,[21,15,9]);
  assert.deepEqual(result.metcon.movements.map(x=>x.exerciseId),['thruster','pull-up']);
  assert.equal(result.metcon.movements[0].load,95);
  assert.deepEqual(result.unresolved,[]);
});

test('AMRAP and EMOM whiteboards preserve time prescriptions for review',()=>{
  const amrap=interpretMetconWhiteboard('AMRAP 12 minutes\n10 Burpee',library).metcon;
  assert.equal(amrap.scoreType,'AMRAP');
  assert.equal(amrap.durationSeconds,720);
  const emom=interpretMetconWhiteboard('EMOM 10 min\nEvery 60 seconds\n10 Burpee',library).metcon;
  assert.equal(emom.scoreType,'EMOM');
  assert.equal(emom.durationSeconds,600);
  assert.equal(emom.intervalSeconds,60);
});

test('interpreted draft fits the existing validated program/block model',()=>{
  const {metcon}=interpretMetconWhiteboard('AMRAP 12 minutes\n10 Burpee',library);
  const session={name:'AMRAP 12',day:1,exercises:[],blocks:[{id:'block-1',type:'Metcon',metcon}]};
  const program=prepareProgram({name:'AMRAP 12 program',goal:'Metcon benchmark',modality:'metcon',weeks:1,description:'',sessions:[session],plan:[{week:1,sessions:[session]}]},library);
  assert.equal(program.plan[0].sessions[0].blocks[0].metcon.durationSeconds,720);
  const fiveWeeks=prepareProgram({name:'Five week metcon',goal:'Conditioning',modality:'metcon',weeks:5,description:'',sessions:[session],plan:Array.from({length:5},(_,i)=>({week:i+1,sessions:[session]}))},library);
  assert.equal(fiveWeeks.plan.length,5);
  const fiveWeekStrength=prepareProgram({name:'Five week strength',goal:'Strength',weeks:5,description:'',sessions:[{name:'Day 1',day:1,exercises:[{exerciseId:'thruster',sets:3,reps:5,loadMode:'fixed',load:100,loadUnit:'lbs'}]}]},library);
  assert.equal(fiveWeekStrength.weeks,5);
  assert.throws(()=>prepareProgram({name:'Thirteen week strength',goal:'Strength',weeks:13,description:'',sessions:[{name:'Day 1',day:1,exercises:[{exerciseId:'thruster',sets:3,reps:5,loadMode:'fixed',load:100,loadUnit:'lbs'}]}]},library),/supported block length/);
});

test('unmatched whiteboard lines are returned for coach mapping, never silently dropped',()=>{
  const result=interpretMetconWhiteboard('For Time\n10 Unknown Movement\n10 Burpee',library);
  assert.deepEqual(result.unresolved,['10 Unknown Movement']);
  assert.equal(result.metcon.movements.length,1);
});

test('weekly MetCon programs support multiple days and multiple scored MetCons per day',()=>{
  const fran=interpretMetconWhiteboard('FRAN\n21-15-9\nThruster — 95 lb\nPull-up\nFor Time',library).metcon;
  const amrap=interpretMetconWhiteboard('AMRAP 12\n10 Burpee',library).metcon;
  const monday={name:'Monday · MetCons',day:1,exercises:[],blocks:[{id:'monday-a',type:'Metcon',metcon:{...fran,benchmark:true}},{id:'monday-b',type:'Metcon',metcon:amrap}]};
  const tuesday={name:'Tuesday · MetCon',day:2,exercises:[],blocks:[{id:'tuesday-a',type:'Metcon',metcon:amrap}]};
  const plan=Array.from({length:2},(_,i)=>({week:i+1,sessions:[monday,tuesday]}));
  const program=prepareProgram({name:'Two day conditioning',goal:'Metcon benchmark',modality:'metcon',weeks:2,description:'',sessions:[monday,tuesday],plan},library);
  assert.equal(program.plan[0].sessions.length,2);
  assert.deepEqual(program.plan[0].sessions[0].blocks.map(b=>b.metcon.scoreType),['For Time','AMRAP']);
  assert.equal(program.plan[0].sessions[0].blocks[0].metcon.benchmark,true);
  const score=recordBlockScores([{blockId:'monday-a',score:{rx:'RX',timeSeconds:300}},{blockId:'monday-b',score:{rx:'RX',rounds:4,reps:2}}],program.plan[0].sessions[0].blocks);
  assert.equal(score[0].metcon.benchmark,true);
  assert.equal(metconKey(score[0].metcon),metconKey({...score[0].metcon,benchmark:false}));
});
