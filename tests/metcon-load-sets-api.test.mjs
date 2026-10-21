import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Load Metcon sets and reps survive coach edit, storage reload and athlete retrieval',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'iron-heart-load-metcon-')),port='4198';
 const child=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:port,HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 t.after(async()=>{if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 const request=async(path,method='GET',body,token)=>{const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const coach=(await request('demo','POST',{role:'coach',native:true})).data.token,athlete=(await request('demo','POST',{role:'athlete',native:true})).data.token;
 const metcon={name:'Strength',scoreType:'Load',repScheme:[],movements:[{exerciseId:'bench',sets:2,reps:5,loadUnit:'lbs'}],notes:''};
 const created=await request('programs','POST',{name:'Load test',goal:'Strength',modality:'metcon',weeks:1,description:'',sessions:[{name:'Bench 3RM',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:100}],blocks:[{id:'strength-event',type:'Strength',exerciseIndexes:[0]},{id:'load-event',type:'Metcon',metcon}]}]},coach);
 assert.equal(created.status,200,JSON.stringify(created.data));
 const edited=structuredClone(created.data);edited.sessions[0].blocks[1].metcon.movements[0].sets=3;
 const saved=await request('programs','POST',edited,coach);assert.equal(saved.status,200,JSON.stringify(saved.data));
 const coachReload=(await request('data','GET',null,coach)).data.programs.find(p=>p.id===saved.data.id);
 assert.equal(coachReload.sessions[0].blocks[1].metcon.movements[0].sets,3);assert.equal(coachReload.sessions[0].blocks[1].metcon.movements[0].reps,5);
 const assigned=await request('assign','POST',{programId:saved.data.id,athleteId:'jordan',startDate:'2026-10-19'},coach);assert.equal(assigned.status,200,JSON.stringify(assigned.data));
 const athleteReload=(await request('data','GET',null,athlete)).data.assignments.find(a=>a.id===assigned.data.id);
 assert.equal(athleteReload.plan[0].sessions[0].blocks[1].metcon.movements[0].sets,3);assert.equal(athleteReload.plan[0].sessions[0].blocks[1].metcon.movements[0].reps,5);
});
