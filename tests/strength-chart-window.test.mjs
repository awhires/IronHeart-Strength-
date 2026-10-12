import test from 'node:test';import assert from 'node:assert/strict';
import {strengthMonthWindow,strengthWindowPoints} from '../shared/strength-chart-window.mjs';
import {strengthProgress,NSCA_PERCENT,strengthAxis} from '../shared/strength-progress.mjs';
test('five-month window centers the local current month, including late-month dates',()=>{
 const w=strengthMonthWindow(new Date(2026,9,31,23,59));assert.deepEqual(w.map(m=>m.label),['Aug','Sep','Oct','Nov','Dec']);assert.deepEqual(w.map(m=>m.current),[false,false,true,false,false]);assert.deepEqual(w.map(m=>m.future),[false,false,false,true,true]);assert.equal(w[2].key,'2026-10');
});
test('centered month window handles both year boundaries and leap years',()=>{
 assert.deepEqual(strengthMonthWindow(new Date(2027,0,1)).map(m=>m.key),['2026-11','2026-12','2027-01','2027-02','2027-03']);assert.deepEqual(strengthMonthWindow(new Date(2026,11,31)).map(m=>m.key),['2026-10','2026-11','2026-12','2027-01','2027-02']);assert.equal(strengthMonthWindow(new Date(2028,1,29))[2].fullLabel,'Feb 2028');
});
test('chart maps historical estimates to their months without filling future months or changing calculations',()=>{
 const logs=['2026-07','2026-08','2026-10','2026-11'].map((month,i)=>({id:month,athleteId:'a',workoutDate:month+'-05',exercises:[{exerciseId:'bench',sets:[{load:100+i*10,reps:5,rpe:9}]}]}));const stats=strengthProgress(logs,'bench','a',[{id:'bench',name:'Bench Press'}]),before=structuredClone(stats),w=strengthMonthWindow(new Date(2026,9,15)),points=strengthWindowPoints(stats.monthly,w);
 assert.deepEqual(points.map(p=>[p.month,p.windowIndex]),[['2026-08',0],['2026-10',2]]);assert.deepEqual(stats,before);assert.equal(points[1].estimates[1],120/NSCA_PERCENT[5]);assert.equal(points[1].performance.kind,'actual');assert.equal(points[1].kind,'estimate');assert.equal(strengthAxis(points.map(p=>p.estimates[1])).max,120/.87+100);assert.deepEqual(strengthWindowPoints([],w),[]);
});
