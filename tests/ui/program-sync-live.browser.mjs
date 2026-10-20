import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {newPrescription} from '../../shared/prescriptions.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('coach program editor Save reaches both existing athletes on reopened mobile Training screens',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-live-sync-browser-')),base='http://127.0.0.1:4227',server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4227',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const apiContext=await browser.newContext(),apiPage=await apiContext.newPage(),apiReq=apiPage.request;const coachLogin=await apiReq.post(base+'/api/demo',{data:{role:'coach',native:true}}),coachToken=(await coachLogin.json()).token;const req=(path,method='GET',data,token=coachToken)=>apiReq.fetch(`${base}/api/${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(data?{data}:{})});const coachData=await(await req('data')).json();
 const athletes=[];for(const [i,name] of ['Browser Sync A','Browser Sync B'].entries()){const email=`browser-sync-${i}@example.test`,created=await req('athletes','POST',{name,email,sport:'Strength'});assert.equal(created.status(),200,await created.text());const details=await created.json(),joined=await apiReq.post(base+'/api/redeem',{data:{code:details.code,password:'strong-test-password-123',native:true}});assert.equal(joined.status(),200);const login=await joined.json();athletes.push({name,email,password:'strong-test-password-123',id:login.user.id,token:login.token});}
 const exercise=(id,reps=5)=>({...newPrescription(id),sets:3,reps,loadMode:'athlete_selected',effortMode:'rpe',rpe:7});
 const makePlan=weeks=>Array.from({length:weeks},(_,i)=>({week:i+1,sessions:[{name:`Upper ${i+1}`,day:1,exercises:[exercise('bench'),exercise('lat-pulldown')]},{name:`Lower ${i+1}`,day:3,exercises:[exercise('squat')]}]}));
 const initial=coachData.programs[0];const programResult=await req('programs','POST',{...initial,id:undefined,name:'Browser live sync program',goal:'Strength',weeks:4,description:'Four week start',plan:makePlan(4)});assert.equal(programResult.status(),200);const program=await programResult.json(),assignments=[];
 for(const athlete of athletes){const assigned=await req('assign','POST',{programId:program.id,athleteId:athlete.id,startDate:'2026-10-05',requireSetup:true});assert.equal(assigned.status(),200);const a=await assigned.json(),started=await req('enroll','POST',{assignmentId:a.id,startDate:'2026-10-05',availableDays:[1,3],preferences:{}},athlete.token);assert.equal(started.status(),200,await started.text());assignments.push(await started.json());}
 // Set an athlete-specific field on one future session; the subsequent master
 // change must preserve that field while applying unrelated edits around it.
 const personal=structuredClone(assignments[0].plan[2].sessions[0].exercises);personal[0].reps=6;assert.equal((await req('assignment','PUT',{id:assignments[0].id,week:3,session:0,exercises:personal})).status(),200);
 const newExercise=coachData.exercises.find(e=>!['bench','lat-pulldown'].includes(e.id)&&(!e.trackingType||e.trackingType==='strength'));assert.ok(newExercise,'seed library has an additional strength exercise');
 const athleteScreens=[];for(let i=0;i<athletes.length;i++){const athlete=athletes[i],context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByLabel('Email address',{exact:true}).fill(athlete.email);await page.getByLabel('Password',{exact:true}).fill(athlete.password);await page.getByRole('button',{name:/^Sign in/}).click();await page.getByRole('navigation',{name:'Athlete navigation'}).waitFor();await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(assignments[i].id);await page.getByRole('button',{name:'W3',exact:true}).waitFor();athleteScreens.push({context,page,errors});}
 const coachContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const coachPage=await coachContext.newPage();coachPage.setDefaultTimeout(12000);
 await coachPage.request.post(base+'/api/demo',{data:{role:'coach'}});
 await coachPage.goto(base);
 await coachPage.getByRole('button',{name:'Open navigation',exact:true}).click();
 await coachPage.getByRole('button',{name:'Programs',exact:true}).click();
 const card=coachPage.locator('.program-card').filter({hasText:program.name});
 await card.getByRole('button',{name:'Edit program',exact:true}).click();
 const dialog=coachPage.getByRole('dialog');
 await dialog.getByLabel('Block length').selectOption('6');
 await dialog.getByRole('button',{name:'Week 3',exact:true}).click();
 await dialog.getByLabel('Exercise 1 row 1 Reps',{exact:true}).fill('7');
 await dialog.getByLabel('Exercise 1 row 1 Sets',{exact:true}).fill('4');
 await dialog.getByRole('button',{name:'Add from exercise library',exact:true}).click();
 const picker=dialog.getByRole('region',{name:'Exercise library selector'});
 await picker.getByLabel('Search exercises',{exact:true}).fill(newExercise.name);
 await picker.locator('.journal-result').filter({hasText:newExercise.name}).click();
 await dialog.getByRole('button',{name:'Save program',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await coachPage.getByRole('status').filter({hasText:/Program saved/}).waitFor();
 await assertToastConflicts(coachPage);
 for(let i=0;i<athletes.length;i++){
  const {context,page,errors}=athleteScreens[i];await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});await page.getByRole('button',{name:'W6',exact:true}).waitFor();await page.getByRole('button',{name:'W3',exact:true}).click();const session=page.locator('.training-session').filter({hasText:'Upper 3'});await session.getByText(newExercise.name,{exact:false}).waitFor();const current=await(await req('data','GET',undefined,athletes[i].token)).json(),persisted=current.assignments.find(a=>a.id===assignments[i].id);assert.equal(persisted.weeks,6);assert.equal(persisted.plan[2].sessions[0].exercises[0].sets,4);assert.equal(persisted.plan[2].sessions[0].exercises[0].reps,i===0?6:7);assert.ok(errors.length===0,errors.join('\n'));await context.close();
 }
 await coachContext.close();await apiContext.close();
 async function assertToastConflicts(page){await page.getByRole('status').filter({hasText:/Preserved .*athlete-specific change/i}).waitFor();}
});
