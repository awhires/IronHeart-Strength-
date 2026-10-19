import test from 'node:test';
import assert from 'node:assert/strict';
import {propagateProgram} from '../shared/program-sync.mjs';
import {newPrescription} from '../shared/prescriptions.mjs';
import {scheduledDate,sessionKey} from '../shared/program-schedule.mjs';

const exercise=(id,reps=5,extra={})=>({...newPrescription(id),sets:3,reps,loadMode:'percentage',percentage:70,...extra});
const makePlan=(weeks=4)=>Array.from({length:weeks},(_,index)=>({week:index+1,sessions:[{name:`Day ${index+1}`,day:1,exercises:[exercise('bench')]}]}));

test('coach extension appends weeks and sessions while retaining assignment identity and athlete-selected dates',()=>{
 const oldPlan=makePlan(),newPlan=makePlan(6);newPlan[2].sessions.push({name:'New conditioning',day:3,exercises:[exercise('row-erg')]});
 const originalDates=Object.fromEntries(oldPlan.flatMap(w=>w.sessions.map((_,i)=>[sessionKey(w.week,i),`2026-10-${String(5+(w.week-1)*7).padStart(2,'0')}`])));
 const assigned={id:'keep-this-id',athleteId:'athlete-1',programId:'program-1',name:'Old title',weeks:4,startDate:'2026-10-05',progressionOptions:{method:'percent',rules:{}},plan:structuredClone(oldPlan),schedule:{version:1,startDate:'2026-10-05',availableDays:[1,3],preferences:{},dates:originalDates}};
 const updated={...assigned,name:'Updated title',goal:'Strength',weeks:6,description:'Updated description',progressionOptions:{method:'percent',rules:{}},plan:newPlan};
 const {assignment:after}=propagateProgram(assigned,oldPlan,newPlan,[],assigned.progressionOptions,updated.progressionOptions,assigned,updated);
 assert.equal(after.id,assigned.id);assert.equal(after.weeks,6);assert.equal(after.name,'Updated title');assert.equal(after.description,'Updated description');
 assert.deepEqual(after.plan.map(w=>w.week),[1,2,3,4,5,6]);assert.equal(after.plan[2].sessions.length,2);assert.equal(after.plan[4].sessions.length,1);
 for(const [key,date] of Object.entries(originalDates))assert.equal(after.schedule.dates[key],date);
 assert.ok(after.schedule.dates['5:0']);assert.ok(after.schedule.dates['6:0']);assert.ok(after.schedule.dates['3:1']);
 assert.equal(scheduledDate(after,5,0),after.schedule.dates['5:0']);
});

test('coach edits sync into uncompleted work, protect completed and personalized sessions, and revise changed prescriptions',()=>{
 const oldPlan=makePlan(),newPlan=structuredClone(oldPlan);
 newPlan[0].sessions[0].exercises[0].reps=8; // already completed
 newPlan[2].sessions[0].exercises=[exercise('bench',3,{percentage:75}),exercise('row-erg',10)];
 newPlan[3].sessions[0].exercises[0]={...exercise('bench',5,{loadMode:'previous_performance',loadDelta:10})};
 const assignment={id:'assignment-1',weeks:4,progressionOptions:{method:'percentage',rules:{}},plan:structuredClone(oldPlan)};
 assignment.plan[1].sessions[0].exercises[0].reps=9; // athlete-specific prescription
 const logs=[{assignmentId:assignment.id,week:1,session:0,id:'completed-log'}];
 const updated={...assignment,progressionOptions:{method:'percentage',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10}}}};
 const {assignment:after,summary}=propagateProgram(assignment,oldPlan,newPlan,logs,assignment.progressionOptions,updated.progressionOptions,assignment,updated);
 assert.equal(after.plan[0].sessions[0].exercises[0].reps,5);
 assert.equal(after.plan[1].sessions[0].exercises[0].reps,9);
 assert.deepEqual(after.plan[2].sessions[0].exercises.map(e=>e.exerciseId),['bench','row-erg']);
 assert.equal(after.plan[2].sessions[0].exercises[0].percentage,75);assert.equal(after.plan[2].sessions[0].prescriptionRevision,1);
 assert.equal(after.plan[3].sessions[0].exercises[0].loadMode,'previous_performance');assert.equal(after.plan[3].sessions[0].exercises[0].loadDelta,10);assert.equal(after.plan[3].sessions[0].prescriptionRevision,1);
 assert.deepEqual(after.progressionOptions,updated.progressionOptions);
 assert.equal(summary.completed,1);assert.equal(summary.personalized,1);assert.equal(summary.updated,2);
});

test('removed sessions are canceled in place while completed and personalized sessions are retained',()=>{
 const oldPlan=makePlan(4),newPlan=structuredClone(oldPlan);newPlan[2].sessions=[];newPlan[3].sessions=[];
 const assignment={id:'assignment-2',weeks:4,plan:structuredClone(oldPlan)};assignment.plan[3].sessions[0].exercises[0].reps=9;
 const {assignment:after}=propagateProgram(assignment,oldPlan,newPlan,[{assignmentId:assignment.id,week:3,session:0}],undefined,undefined,{weeks:4},{weeks:4});
 assert.equal(after.plan[2].sessions[0].cancelled,undefined);assert.equal(after.plan[3].sessions[0].cancelled,undefined);
 const clean={...assignment,plan:structuredClone(oldPlan)};const removed=propagateProgram(clean,oldPlan,newPlan,[],undefined,undefined,{weeks:4},{weeks:4}).assignment;
 assert.equal(removed.plan[2].sessions[0].cancelled,true);assert.equal(removed.plan[2].sessions[0].prescriptionRevision,1);
});
