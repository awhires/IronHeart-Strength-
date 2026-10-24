import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('390px coach Program Editor exposes six load methods with only relevant fields and preserves the choice',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-load-methods-')),base='http://127.0.0.1:4269';
  const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4269',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
  t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});
  const response=await page.request.post(base+'/api/programs',{data:{name:'Universal loading QA',goal:'Strength',weeks:1,description:'',sessions:[{name:'Bench day',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:null,loadMode:'athlete_selected',rest:120,rpe:null,effortMode:'none',increment:5,notes:''}]}]}});
  assert.equal(response.status(),200,await response.text());
  await page.goto(base);await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Programs',exact:true}).click();
  const card=page.locator('.program-card').filter({hasText:'Universal loading QA'});
  await card.getByRole('button',{name:'Edit program',exact:true}).click();let editor=page.getByRole('dialog'),method=editor.getByLabel('Load Method exercise 1',{exact:true});
  assert.deepEqual(await method.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['fixed','percentage','bodyweight','athlete_selected','previous_performance','none']);
  await method.selectOption('percentage');assert.equal(await editor.getByLabel('Percentage exercise 1',{exact:true}).count(),1);assert.equal(await editor.getByLabel('Reference Exercise 1',{exact:true}).count(),1);assert.equal(await editor.getByLabel('Added external load (optional) exercise 1',{exact:true}).count(),0);
  await method.selectOption('bodyweight');await editor.getByLabel('Added external load (optional) exercise 1',{exact:true}).fill('25');assert.equal(await editor.getByLabel('Percentage exercise 1',{exact:true}).count(),0);
  await method.selectOption('previous_performance');assert.equal(await editor.getByLabel('Change from previous performance exercise 1',{exact:true}).count(),1);assert.equal(await editor.getByLabel('Added external load (optional) exercise 1',{exact:true}).count(),0);
  await editor.getByLabel('Change from previous performance exercise 1',{exact:true}).fill('-5');await editor.getByRole('button',{name:'Save program',exact:true}).click();await editor.waitFor({state:'hidden'});
  await card.getByRole('button',{name:'Edit program',exact:true}).click();editor=page.getByRole('dialog');assert.equal(await editor.getByLabel('Load Method exercise 1',{exact:true}).inputValue(),'previous_performance');assert.equal(await editor.getByLabel('Change from previous performance exercise 1',{exact:true}).inputValue(),'-5');
  await editor.getByLabel('Load Method exercise 1',{exact:true}).selectOption('fixed');assert.equal(await editor.getByLabel('Percentage exercise 1',{exact:true}).count(),0);
  await editor.getByLabel('Load Method exercise 1',{exact:true}).selectOption('athlete_selected');assert.equal(await editor.getByLabel('Change from previous performance exercise 1',{exact:true}).count(),0);
  await editor.getByLabel('Load Method exercise 1',{exact:true}).selectOption('none');assert.equal(await editor.getByLabel('Percentage exercise 1',{exact:true}).count(),0);
});
