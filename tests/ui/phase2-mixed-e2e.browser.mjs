// Run after pnpm build. Exercises the coach MetCon Builder through athlete
// logging, history correction, progress, and refresh of an already-open plan.
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('Phase 2 mixed Strength + Metcon builder, athlete logging, skip/edit, progress and opened-program sync',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-phase2-mixed-')),base='http://127.0.0.1:4239';
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4239',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const coachContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),coachPage=await coachContext.newPage(),errors=[];coachPage.setDefaultTimeout(12000);coachPage.on('pageerror',e=>errors.push(e.message));
 await coachPage.goto(base);await coachPage.getByRole('button',{name:'Coach view',exact:true}).click();await coachPage.getByRole('button',{name:'Open navigation',exact:true}).click();await coachPage.getByRole('button',{name:'MetCon Builder',exact:true}).click();
 const studio=coachPage.locator('.metcon-studio');await studio.getByLabel('Program name',{exact:true}).fill('Phase 2 Mixed E2E');
 await coachPage.getByRole('button',{name:'Add strength work',exact:true}).click();
 const strength=coachPage.getByRole('region',{name:'Optional strength block'});
 async function addLibraryExercise(name){
  await strength.getByRole('button',{name:'Add from exercise library',exact:true}).click();
  const picker=coachPage.getByRole('region',{name:'Exercise library selector'});await picker.getByLabel('Search exercises',{exact:true}).fill(name);
  await picker.getByRole('button',{name:new RegExp(name,'i')}).click();
 }
 await addLibraryExercise('Front Squat');await addLibraryExercise('Walking Lunges');
 const effortLabels=await strength.locator('select').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-label')));assert.ok(effortLabels.includes('Effort exercise 1'),`Expected strength effort control; found: ${JSON.stringify(effortLabels)}. Page errors: ${errors.join('; ')}`);
 const frontSets=coachPage.getByLabel('Exercise 1 row 1 Sets',{exact:true}),frontReps=coachPage.getByLabel('Exercise 1 row 1 Reps',{exact:true});
 await frontSets.fill('5');await frontReps.fill('3');await coachPage.getByLabel('Effort exercise 1',{exact:true}).selectOption({label:'None'});
 await coachPage.getByLabel('Exercise 2 row 1 Sets',{exact:true}).fill('3');await coachPage.getByLabel('Exercise 2 row 1 Reps',{exact:true}).fill('12');await coachPage.getByLabel('Effort exercise 2',{exact:true}).selectOption({label:'None'});
 await coachPage.getByLabel('Workout / benchmark name',{exact:true}).fill('12-minute AMRAP');await coachPage.getByLabel('Score type',{exact:true}).selectOption('AMRAP');
 await coachPage.getByLabel('Workout duration (M:SS)',{exact:true}).fill('12:00');assert.equal(await coachPage.getByLabel('Result scoring',{exact:true}).inputValue(),'rounds_reps');
 await coachPage.getByRole('button',{name:'+ Add movement from library',exact:true}).click();
 const movementPicker=coachPage.getByRole('region',{name:'Exercise library selector'});await movementPicker.getByLabel('Search exercises',{exact:true}).fill('Burpees');await movementPicker.getByRole('button',{name:/Burpees/i}).click();
 await coachPage.getByRole('button',{name:'Save MetCon program',exact:true}).click();await coachPage.getByRole('status').filter({hasText:'MetCon program saved'}).waitFor();
 const template=coachPage.locator('.metcon-template-row').filter({hasText:'Phase 2 Mixed E2E'});await template.getByRole('button',{name:'Assign',exact:true}).click();
 const assignDialog=coachPage.getByRole('dialog');await assignDialog.locator('select[name="athleteId"]').selectOption('jordan');
 const today=new Date(),localDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 await assignDialog.locator('input[name="startDate"]').fill(localDate);const setup=assignDialog.getByRole('checkbox');if(await setup.isChecked())await setup.uncheck();
 await assignDialog.getByRole('button',{name:'Assign & schedule',exact:true}).click();await assignDialog.waitFor({state:'hidden'});
 const coachApi=await browser.newContext(),login=await coachApi.request.post(base+'/api/demo',{data:{role:'coach',native:true}}),coachToken=(await login.json()).token;
 const api=async(path,method='GET',data)=>coachApi.request.fetch(`${base}/api/${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${coachToken}`},...(data?{data}:{})});
 let data=await(await api('data')).json(),program=data.programs.find(p=>p.name==='Phase 2 Mixed E2E'),assignment=data.assignments.find(a=>a.athleteId==='jordan'&&a.programId===program.id);
 assert.ok(program&&assignment,'Coach saved and assigned the MetCon Builder program.');
 assert.deepEqual(program.sessions[0].blocks.map(b=>b.type),['Strength','Metcon']);assert.equal(program.sessions[0].exercises[0].exerciseId,'front-squat');assert.equal(program.sessions[0].exercises[0].sets,5);assert.equal(program.sessions[0].exercises[0].reps,3);
 assert.equal(program.sessions[0].exercises[1].exerciseId,'walking-lunge');assert.equal(program.sessions[0].exercises[1].sets,3);assert.equal(program.sessions[0].exercises[1].reps,12);
 assert.equal(program.sessions[0].blocks[1].metcon.scoreType,'AMRAP');assert.equal(program.sessions[0].blocks[1].metcon.durationSeconds,720);assert.equal(program.sessions[0].blocks[1].metcon.scoreMode,'rounds_reps');
 const athleteContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),athletePage=await athleteContext.newPage();athletePage.setDefaultTimeout(12000);athletePage.on('pageerror',e=>errors.push(e.message));
 await athletePage.request.post(base+'/api/demo',{data:{role:'athlete'}});await athletePage.goto(base);await athletePage.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await athletePage.getByLabel('Current program',{exact:true}).selectOption(assignment.id);await athletePage.getByRole('button',{name:'W1',exact:true}).click();
 const event=()=>athletePage.locator('.calendar-event').filter({hasText:'12-minute AMRAP'});
 await event().click();let workout=athletePage.getByRole('dialog');
 const frontLogger=workout.locator('.repeated-set-logger').first();await frontLogger.locator('.repeated-set-individual summary').click();const strengthRows=frontLogger.locator('.repeated-set-row');assert.equal(await strengthRows.count(),5,'one actual logging row per prescribed strength set');for(let i=0;i<5;i++){const row=strengthRows.nth(i);assert.equal(await row.getByRole('spinbutton',{name:/ Reps$/}).count(),1);assert.equal(await row.getByRole('spinbutton',{name:/ Load$/}).count(),1);assert.equal(await row.getByRole('spinbutton',{name:/ RPE \(optional\)$/}).count(),1);assert.equal(await row.getByLabel('Set '+(i+1)+' completed',{exact:true}).isChecked(),false);}
 const scoreField=name=>workout.locator('label.field').filter({hasText:name}).locator('input');
 assert.equal(await frontLogger.locator('input[aria-label="Completed rounds"]').count(),0);assert.equal(await frontLogger.locator('select[aria-label="RX / scaled"]').count(),0);
 assert.equal(await scoreField('Completed rounds').count(),1);assert.equal(await scoreField('Additional reps').count(),1);assert.equal(await workout.locator('label.field').filter({hasText:'RX / scaled'}).locator('select').count(),1);assert.equal(await scoreField('Completion time (M:SS)').count(),0);assert.equal(await scoreField('Heaviest load achieved').count(),0);

 async function fillIndividualSets(logger,count,reps,loadStart){
  if(!(await logger.locator('.repeated-set-individual').evaluate(el=>el.open)))await logger.locator('.repeated-set-individual summary').click();const rows=logger.locator('.repeated-set-row');assert.equal(await rows.count(),count);
  for(let i=1;i<=count;i++){const row=rows.nth(i-1);assert.equal(await row.getByRole('spinbutton',{name:/ Reps$/}).count(),1,'each actual set has its own reps input');assert.equal(await row.getByRole('spinbutton',{name:/ Load$/}).count(),1,'each actual set has its own load input');assert.equal(await row.getByRole('spinbutton',{name:/ RPE \(optional\)$/}).count(),1,'each actual set supports optional RPE');await row.getByLabel(`Set ${i} completed`,{exact:true}).check();await row.getByRole('spinbutton',{name:/ Reps$/}).fill(String(reps));await row.getByRole('spinbutton',{name:/ Load$/}).fill(String(loadStart+(i-1)*5));if(i%2===0)await row.getByRole('spinbutton',{name:/ RPE \(optional\)$/}).fill('8');}
 }
 await fillIndividualSets(frontLogger,5,3,185);
 await workout.getByRole('button',{name:'Skip exercise',exact:true}).nth(1).click();
 await scoreField('Completed rounds').fill('5');await scoreField('Additional reps').fill('14');await workout.locator('label.field').filter({hasText:'RX / scaled'}).locator('select').selectOption('RX');

 // Coach changes the master after the athlete has opened and entered results.
 const changed=structuredClone(program),front=changed.plan[0].sessions[0].exercises[0];front.sets=6;front.reps=3;delete front.setBlocks;
 const sync=await api('programs','POST',changed);assert.equal(sync.status(),200,await sync.text());
 await workout.getByRole('button',{name:'Complete workout',exact:true}).click();await workout.getByRole('alert').filter({hasText:/coach updated this workout/i}).waitFor();
 assert.equal(await workout.getByLabel('Front Squat row 1 Load',{exact:true}).inputValue(),'185','Stale-submit rejection retains the athlete’s entered set values.');
 await athletePage.keyboard.press('Escape');await athletePage.reload();await athletePage.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await athletePage.getByLabel('Current program',{exact:true}).selectOption(assignment.id);
 // The one-week template remains one week; the updated exercise prescription is what must refresh.
 await athletePage.getByRole('button',{name:'W1',exact:true}).click();await event().click();workout=athletePage.getByRole('dialog');await workout.getByText(/Target:\s*6\s*×\s*3/).waitFor();
 const refreshedLogger=workout.locator('.repeated-set-logger').first();await fillIndividualSets(refreshedLogger,6,3,195);
 await workout.getByRole('button',{name:'Skip exercise',exact:true}).nth(1).click();await scoreField('Completed rounds').fill('5');await scoreField('Additional reps').fill('14');await workout.locator('label.field').filter({hasText:'RX / scaled'}).locator('select').selectOption('RX');
 await workout.getByRole('button',{name:'Complete workout',exact:true}).click();await athletePage.getByRole('status').filter({hasText:'Partial workout saved'}).waitFor();
 data=await(await api('data')).json();let log=data.logs.find(l=>l.assignmentId===assignment.id&&l.week===1&&l.session===0);assert.ok(log);const originalId=log.id,originalDate=log.createdAt;assert.equal(log.status,'partially_completed');assert.equal(log.exercises[0].sets.length,6);assert.equal(log.exercises[0].sets[0].reps,3);assert.equal(log.exercises[0].sets[0].load,195);assert.equal(log.exercises[1].status,'skipped');assert.equal(log.blockResults[0].score.rounds,5);assert.equal(log.blockResults[0].score.reps,14);
 assert.equal((await api('data')).status(),200);

 // Reopen the original partial log and correct actual data in place.
 await event().click();const history=athletePage.getByRole('dialog');await history.getByRole('button',{name:'Resume / edit workout',exact:true}).click();workout=athletePage.getByRole('dialog');
 const editScore=name=>workout.locator('label.field').filter({hasText:name}).locator('input');await workout.getByLabel('Front Squat row 1 Load',{exact:true}).fill('210');await editScore('Completed rounds').fill('6');await editScore('Additional reps').fill('2');
 await workout.getByRole('button',{name:'Save corrections',exact:true}).click();await athletePage.getByRole('status').filter({hasText:'Workout corrections saved'}).waitFor();
 data=await(await api('data')).json();log=data.logs.find(l=>l.id===originalId);assert.equal(data.logs.filter(l=>l.assignmentId===assignment.id&&l.week===1&&l.session===0).length,1);assert.equal(log.createdAt,originalDate);assert.equal(log.assignmentId,assignment.id);assert.equal(log.status,'partially_completed');assert.equal(log.exercises[0].sets[0].load,210);assert.equal(log.exercises[1].status,'skipped');assert.equal(log.blockResults[0].score.rounds,6);assert.equal(log.blockResults[0].score.reps,2);

 await athletePage.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Progress',exact:true}).click();await athletePage.getByLabel('Strength exercise',{exact:true}).selectOption('front-squat');assert.ok(await athletePage.locator('.strength-data-point').count()>0,'Actual Front Squat sets feed Strength Progress.');
 await athletePage.getByRole('button',{name:'Volume, cardio & Metcon analytics',exact:true}).click();await athletePage.locator('.volume-page select').first().selectOption('metcon');await athletePage.getByRole('heading',{name:'Metcon benchmarks',exact:true}).waitFor();await athletePage.getByText(/6 rounds \+ 2 reps/).first().waitFor();
 assert.deepEqual(errors,[]);await coachApi.close();await athleteContext.close();await coachContext.close();
});
