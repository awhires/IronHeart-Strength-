import {workoutDate} from '../../shared/volume-stats.mjs';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFixture} from '../../shared/ai/fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('physical-phone state regressions: progression, adaptive actuals and AI review',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-phone-')),fixture=join(dir,'ai.json'),base='http://127.0.0.1:4220';await writeFile(fixture,JSON.stringify(createFixture()));
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4220',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_TEST_FIXTURE:fixture,AI_REQUESTS_PER_HOUR:'30'},stdio:['ignore','pipe','pipe']});let output='',browser;
 server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<200&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const setup=async()=>{const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(12000);await page.request.post(base+'/api/demo',{data:{role:'coach'}});return {context,page};};
 const navigate=async(page,name)=>{await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();};
 await t.test('no-RPE bench and accessories, grouped loads and AI percentage/selected targets open usable controls',async()=>{
  const {context,page}=await setup();const data=(await(await page.request.get(base+'/api/data')).json());const lat=data.exercises.find(e=>e.name==='Lat Pulldown').id;
  const raw={name:'Phone failure shapes',goal:'Strength',weeks:4,description:'',sessions:[{name:'Phone test',day:4,exercises:[{exerciseId:'bench',sets:2,reps:5,load:100,rpe:null,effortMode:'none',rest:90,setBlocks:[{sets:1,reps:5,load:100},{sets:1,reps:3,load:110}]},{exerciseId:lat,sets:3,reps:8,load:null,loadMode:'athlete_selected',rpe:null,effortMode:'none',rest:90},{exerciseId:'leg-extension',sets:3,reps:8,load:null,loadMode:'percentage',percent1RM:70,rpe:8,rest:90}]}]};
  const res=await page.request.post(base+'/api/programs',{data:raw});assert.equal(res.status(),200);const p=await res.json();await page.goto(base);await navigate(page,'Programs');await page.locator('.program-card').filter({hasText:raw.name}).getByRole('button',{name:/Edit/}).click();await page.getByRole('button',{name:/Generate following weeks/}).click();
  for(const [i,name] of ['Bench Press','Lat Pulldown','Leg Extension'].entries()){const select=page.getByLabel(`Method for ${name} session 1 exercise ${i+1}`,{exact:true});assert.equal(await select.isEnabled(),true);await select.selectOption(i===0?'repetition':'adaptive');}
  await page.getByLabel('Coach-selected weekly increase (%)',{exact:true}).fill('5');await page.getByRole('button',{name:'Preview Weeks 2–4',exact:true}).click();await page.getByRole('button',{name:'Apply generated weeks',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Save program/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()).programs.find(x=>x.id===p.id);assert.deepEqual(saved.plan[1].sessions[0].exercises[0].setBlocks.map(b=>b.load),[105,115]);assert.equal(saved.plan[1].sessions[0].exercises[1].adaptiveProgression.maxPercent,10);assert.equal(saved.plan[1].sessions[0].exercises[2].load,null);await context.close();
 });
 await t.test('athlete recommendation pre-fills actual weight, manual override persists without rewriting percentage',async()=>{
  const {context,page}=await setup();const now=new Date(),date=workoutDate({createdAt:now.toISOString()}),day=now.getDay();
  const e={exerciseId:'bench',sets:2,reps:5,rest:120,load:null,loadMode:'percentage',percent1RM:75,rpe:8,reference1RM:{exerciseId:'bench',value:250,unit:'lbs',type:'tested',date},adaptiveProgression:{version:1,enabled:true,minPercent:5,maxPercent:10}};
  const p=await(await page.request.post(base+'/api/programs',{data:{name:'Adaptive phone test',goal:'Strength',weeks:1,description:'',sessions:[{name:'Adaptive athlete session',day,exercises:[e]}]}})).json();const a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate:date}})).json();assert.ok(a.id);
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.locator('.training-session').filter({hasText:'Adaptive athlete session'}).getByRole('button').first().click();
  const dialog=page.getByRole('dialog');await dialog.getByText('Athlete recommendation',{exact:true}).waitFor();assert.equal(await page.getByLabel('Bench Press row 1 Load',{exact:true}).inputValue(),'190');await page.getByLabel('Bench Press row 1 Load',{exact:true}).fill('175');await page.getByLabel('Bench Press row 1 Reps',{exact:true}).fill('5');await page.getByLabel('Bench Press row 1 RPE (optional)',{exact:true}).fill('8');await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()),log=saved.logs.find(l=>l.assignmentId===a.id);assert.equal(log.exercises[0].sets[0].load,175);assert.equal(log.exercises[0].target.percent1RM,75);assert.equal(log.exercises[0].target.load,null);assert.equal(log.recommendations[0][0].load,190);assert.equal(saved.assignments.find(x=>x.id===a.id).plan[0].sessions[0].exercises[0].load,null);await context.close();
 });
 await t.test('Previous Performance ± pre-fills from actual results, honors override, and resolves the next week',async()=>{
  const {context,page}=await setup(),date=workoutDate({createdAt:new Date().toISOString()}),day=new Date().getDay();
  const baseTarget={exerciseId:'bench',loadUnit:'lbs',effortMode:'none',rpe:null,rest:null,increment:5};
  const weeks=[{sets:3,reps:8,load:null,loadMode:'athlete_selected'},{sets:3,reps:10,load:null,loadMode:'previous_performance',loadDelta:-5},{sets:4,reps:6,load:null,loadMode:'previous_performance',loadDelta:15}];
  const p=await(await page.request.post(base+'/api/programs',{data:{name:'Previous actual workflow',goal:'Strength',weeks:3,description:'',plan:weeks.map((e,i)=>({week:i+1,sessions:[{name:'Lunge progression',day,exercises:[{...baseTarget,...e}]}]}))}})).json();
  const a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate:date}})).json();assert.ok(a.id);
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});
  assert.equal((await page.request.post(base+'/api/log',{data:{assignmentId:a.id,week:1,session:0,readiness:3,pain:false,notes:'Week one',exercises:[{exerciseId:'bench',sets:[40,40,40].map(load=>({load,loadUnit:'lbs',reps:8,rpe:null}))}]}})).status(),200);
  await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W2',exact:true}).click();await page.locator('.training-session').filter({hasText:'Lunge progression'}).getByRole('button').first().click();
  const dialog=page.getByRole('dialog'),load=dialog.getByLabel('Bench Press row 1 Load',{exact:true});assert.equal(await load.inputValue(),'35');assert.equal(await dialog.getByLabel('Bench Press row 1 Reps',{exact:true}).inputValue(),'10');await dialog.getByText('Recommendation details',{exact:true}).click();assert.match(await dialog.innerText(),/Previous actual performance/);
  await dialog.getByLabel('Bench Press row 1 Load',{exact:true}).fill('30');await dialog.getByLabel('Bench Press row 1 Reps',{exact:true}).fill('10');
  await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'W3',exact:true}).click();await page.locator('.training-session').filter({hasText:'Lunge progression'}).getByRole('button').first().click();
  assert.equal(await page.getByLabel('Bench Press row 1 Load',{exact:true}).inputValue(),'45');assert.equal(await page.getByLabel('Bench Press row 1 Reps',{exact:true}).inputValue(),'6');
  const data=(await(await page.request.get(base+'/api/data')).json()),saved=data.assignments.find(x=>x.id===a.id);assert.equal(data.logs.find(l=>l.assignmentId===a.id&&l.week===2).exercises[0].sets[0].load,30);assert.equal(saved.plan[1].sessions[0].exercises[0].loadMode,'previous_performance');await context.close();
 });
 await t.test('rolling Week 1 evidence reaches Week 2 API and mobile prefill; max-rep editor survives save',async()=>{
  const {context,page}=await setup(),now=new Date(),date=workoutDate({createdAt:now.toISOString()});
  const athlete=await(await page.request.post(base+'/api/athletes',{data:{name:'Rolling Athlete',email:'rolling@example.test',sport:'Strength'}})).json();assert.ok(athlete.id);
  const e={exerciseId:'bench',sets:3,reps:8,load:100,rest:90,rpe:null,effortMode:'none'};
  const p=await(await page.request.post(base+'/api/programs',{data:{name:'Rolling phone',goal:'Strength',weeks:3,description:'',progressionOptions:{method:'westside',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10}}},plan:[1,2,3].map(week=>({week,sessions:[{name:'Rolling session',day:now.getDay(),exercises:[e]}]}))}})).json();assert.ok(p.id);
  await page.goto(base);await navigate(page,'Programs');await page.locator('.program-card').filter({hasText:'Rolling phone'}).getByRole('button',{name:/Edit/}).click();
  await page.getByLabel('Exercise 1 row 1 Rep mode',{exact:true}).selectOption('max');assert.equal(await page.getByLabel('Exercise 1 row 1 Reps',{exact:true}).count(),0);
  await page.getByRole('dialog').getByRole('button',{name:/Save program/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const updated=(await(await page.request.get(base+'/api/data')).json()).programs.find(x=>x.id===p.id);assert.equal(updated.plan[0].sessions[0].exercises[0].repMode,'max');assert.equal(updated.plan[0].sessions[0].exercises[0].reps,null);
  const a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:athlete.id,startDate:date}})).json();assert.ok(a.id);
  const redeemed=await page.request.post(base+'/api/redeem',{data:{code:athlete.code,password:'Temporary-test-only-123'}});assert.equal(redeemed.status(),200);
  const result=await page.request.post(base+'/api/log',{data:{assignmentId:a.id,week:1,session:0,readiness:3,pain:false,notes:'',exercises:[{exerciseId:'bench',sets:[135,145,155].map(load=>({load,reps:8}))}]}});assert.equal(result.status(),200);
  const data=await(await page.request.get(base+'/api/data')).json(),saved=data.assignments.find(x=>x.id===a.id),recommendation=saved.recommendations['2:0'][0][0];assert.equal(recommendation.status,'recommended');assert.equal(recommendation.baseline.load,155);assert.equal(recommendation.load,165);assert.equal(saved.plan[1].sessions[0].exercises[0].load,100);
  await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W2',exact:true}).click();await page.locator('.training-session').getByRole('button').first().click();
  assert.equal(await page.getByLabel('Bench Press row 1 Load',{exact:true}).inputValue(),'165');await context.close();
 });
 await t.test('actual phone shapes: selected-load Week 2 prefill, qualifying reason, reps, master edit and max reps',async()=>{
  const {context,page}=await setup(),date=workoutDate({createdAt:new Date().toISOString()}),day=new Date().getDay();
  const target=(exerciseId,sets,reps)=>({exerciseId,sets,reps,load:null,loadMode:'athlete_selected',rpe:7,rest:90,increment:5});
  const session=()=>({name:'Physical phone session',day,exercises:[target('bench',5,5),target('lat-pulldown',4,6),target('leg-extension',3,12)]});
  const raw={name:'Phone Week 2 proof',goal:'Strength',weeks:4,description:'',progressionOptions:{method:'westside',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10},'0:1:lat-pulldown':{mode:'adaptive',minPercent:5,maxPercent:10},'0:2:leg-extension':{mode:'adaptive',minPercent:5,maxPercent:10}}},plan:[1,2,3,4].map(week=>({week,sessions:[session()]}))};raw.plan[2].sessions[0].exercises[0]={...target('bench',3,null),repMode:'max',load:50,loadMode:'fixed'};
  const p=await(await page.request.post(base+'/api/programs',{data:raw})).json(),a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate:date}})).json();
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});
  const finished=await page.request.post(base+'/api/log',{data:{assignmentId:a.id,week:1,session:0,readiness:4,pain:false,notes:'',exercises:[['bench',5,5,180,9],['lat-pulldown',4,6,150,8],['leg-extension',3,12,70,7]].map(([exerciseId,count,reps,load,rpe])=>({exerciseId,sets:Array.from({length:count},()=>({load,loadUnit:'lbs',reps,rpe}))}))}});assert.equal(finished.status(),200);
  const data=(await(await page.request.get(base+'/api/data')).json()),assignment=data.assignments.find(x=>x.id===a.id),recommendations=assignment.recommendations['2:0'];
  assert.equal(recommendations[0][0].status,'recommended');assert.equal(recommendations[1][0].status,'recommended');assert.match(recommendations[2][0].reason,/qualifying performance/i);
  await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W2',exact:true}).click();await page.locator('.training-session').filter({hasText:'Physical phone session'}).getByRole('button').first().click();
  const dialog=page.getByRole('dialog');assert.match(await dialog.innerText(),/Not enough qualifying performance data/);assert.match(await dialog.innerText(),new RegExp(`5 × 5 @ ${recommendations[0][0].load} lb`));
  for(const [name,reps,weight] of [['Bench Press','5',String(recommendations[0][0].load)],['Lat Pulldown','6',String(recommendations[1][0].load)],['Leg Extension','12','']]){
   assert.equal(await dialog.getByLabel(`${name} row 1 Reps`,{exact:true}).inputValue(),reps);
   assert.equal(await dialog.getByLabel(`${name} row 1 Load`,{exact:true}).inputValue(),weight);
  }
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});
  const edited=structuredClone(p);edited.plan[1].sessions[0].exercises[0].reps=6;const response=await page.request.post(base+'/api/programs',{data:edited});assert.equal(response.status(),200);
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.reload();await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W2',exact:true}).click();await page.locator('.training-session').filter({hasText:'Physical phone session'}).getByRole('button').first().click();
  assert.equal(await page.getByLabel('Bench Press row 1 Reps',{exact:true}).inputValue(),'6');
  const reloaded=(await(await page.request.get(base+'/api/data')).json()).assignments.find(x=>x.id===a.id);assert.equal(reloaded.plan[0].sessions[0].exercises[0].reps,5);assert.equal(reloaded.plan[1].sessions[0].exercises[0].reps,6);
  await page.reload();await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W3',exact:true}).click();await page.locator('.training-session').filter({hasText:'Physical phone session'}).getByRole('button').first().click();assert.equal(await page.getByLabel('Bench Press row 1 Reps',{exact:true}).inputValue(),'');
  await context.close();
 });
 await t.test('progression-only coach edit rejects an open stale workout and preserves entered actuals',async()=>{
  const {context,page}=await setup(),date=workoutDate({createdAt:new Date().toISOString()}),day=new Date().getDay();
  const exercise={exerciseId:'bench',sets:3,reps:5,load:null,loadMode:'athlete_selected',rpe:7,rest:90,increment:5};
  const raw={name:'Open form revision proof',goal:'Strength',weeks:4,description:'',progressionOptions:{method:'westside',rules:{}},plan:[1,2,3,4].map(week=>({week,sessions:[{name:'Revision session',day,exercises:[structuredClone(exercise)]}]}))};
  const p=await(await page.request.post(base+'/api/programs',{data:raw})).json(),a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate:date}})).json();
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.getByRole('button',{name:'W2',exact:true}).click();await page.locator('.training-session').filter({hasText:'Revision session'}).getByRole('button').first().click();
  const dialog=page.getByRole('dialog'),load=dialog.getByLabel('Bench Press row 1 Load',{exact:true}),reps=dialog.getByLabel('Bench Press row 1 Reps',{exact:true}),rpe=dialog.getByLabel('Bench Press row 1 RPE (optional)',{exact:true});await load.fill('177');await reps.fill('4');await rpe.fill('8');
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});const changed=structuredClone(p);changed.progressionOptions={method:'westside',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10}}};assert.equal((await page.request.post(base+'/api/programs',{data:changed})).status(),200);await page.request.post(base+'/api/demo',{data:{role:'athlete'}});
  await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await dialog.getByText(/updated this workout while it was open/i).waitFor();assert.equal(await dialog.isVisible(),true);assert.equal(await load.inputValue(),'177');assert.equal(await reps.inputValue(),'4');assert.equal(await rpe.inputValue(),'8');
  const data=await(await page.request.get(base+'/api/data')).json(),updated=data.assignments.find(x=>x.id===a.id);assert.equal(updated.plan[1].sessions[0].prescriptionRevision,1);assert.equal(data.logs.some(l=>l.assignmentId===a.id&&l.week===2),false);await context.close();
 });
 const generate=async(page)=>{await page.goto(base);await navigate(page,'AI Program Builder');await page.getByLabel('Your coaching request',{exact:true}).fill('Create a six-week Jiu-Jitsu strength program.');await page.getByRole('button',{name:'Generate Draft',exact:true}).click();await page.getByRole('heading',{name:'AI Draft Review',exact:true}).waitFor();};
 await t.test('six-week request returning only Week 1 shows actionable error and cannot be approved',async()=>{
  const {context,page}=await setup(),draft=createFixture();draft.program.weeks=6;draft.program.plan=draft.program.plan.slice(0,1);draft.program.plan[0].sessions[0].exercises[0].exerciseId=null;await writeFile(fixture,JSON.stringify(draft));await generate(page);
  assert.match(await page.locator('.ai-review:visible').innerText(),/Received 1 of 6 requested weeks/);assert.match(await page.locator('.ai-review:visible').innerText(),/Expected 6 complete weeks; received 1/);assert.equal(await page.getByRole('button',{name:'Approve this revision',exact:true}).isEnabled(),false);assert.match(await page.locator('.ai-review:visible').innerText(),/needs a library match/);await context.close();
 });
 await t.test('missing max and open questions require explicit acknowledgement, then real API approval and save work',async()=>{
  const {context,page}=await setup(),draft=createFixture('percentage');draft.program.weeks=6;draft.program.plan=Array.from({length:6},(_,i)=>({...structuredClone(draft.program.plan[0]),week:i+1}));for(const w of draft.program.plan)w.sessions[0].exercises[0].reference1RM=null;draft.questions=['Which reference maximum should be used?'];await writeFile(fixture,JSON.stringify(draft));await generate(page);
  const approve=page.getByRole('button',{name:'Approve this revision',exact:true});assert.equal(await approve.isEnabled(),false);await page.getByLabel('I reviewed the warnings and accept these draft choices.',{exact:true}).check();assert.equal(await approve.isEnabled(),true);await approve.click();await page.getByRole('button',{name:'Save as new program',exact:true}).click();await page.getByRole('button',{name:'Program saved',exact:true}).waitFor();const saved=(await(await page.request.get(base+'/api/data')).json()).programs.find(p=>p.aiProvenance?.acceptedWarningCodes?.includes('OPEN_QUESTIONS'));assert.ok(saved);assert.equal(saved.plan.length,6);assert.equal(saved.plan[0].sessions[0].exercises[0].load,null);await context.close();
 });
});
