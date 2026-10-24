import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('390px Cardio Progress switches distance units in bests, fixed duration and history',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-cardio-units-')),port='4239';
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:port,HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const base=`http://127.0.0.1:${port}`;
 await page.goto(base);await page.request.post(base+'/api/demo',{data:{role:'athlete'}});
 for(const [i,distance] of [2840.02,6694.87,1775.83].entries()){
  const response=await page.request.post(base+'/api/tracker',{data:{sessionName:`Distance QA ${i+1}`,workoutDate:`2026-10-${String(i+21).padStart(2,'0')}`,exercises:[{exerciseId:'outdoor-running',sets:[{distance,distanceUnit:'m',durationSeconds:900+i*60,completed:true}]}]}});
  assert.equal(response.status(),200,await response.text());
 }
 await page.reload();await page.getByRole('button',{name:'Progress',exact:true}).last().click();await page.getByRole('button',{name:'Cardio & Hybrid',exact:true}).click();
 await page.getByRole('heading',{name:'Exercise Progress'}).waitFor();await page.locator('.volume-page select').nth(1).selectOption('outdoor-running');
 const section=title=>page.locator('section.panel').filter({has:page.getByRole('heading',{name:title,exact:true})});
 const bests=section('Personal bests by distance'),history=section('Session history');
 for(const [unit,expected,notExpected] of [['mi',['1.76 mi','4.16 mi','1.10 mi'],'2,840.02 m'],['km',['2.84 km','6.69 km','1.78 km'],'1.76 mi']]){
  await page.getByLabel('Display units').selectOption(unit);
  const bestsText=await bests.innerText(),[personalBests,fixedDuration]=bestsText.split('Distance in a fixed duration');
  for(const value of expected){const pattern=new RegExp(value.replace('.','\\.'));assert.match(personalBests,pattern);assert.match(fixedDuration,pattern);assert.match(await history.innerText(),pattern);}
  assert.ok(!(await bests.innerText()).includes(notExpected));assert.ok(!(await history.innerText()).includes(notExpected));
  assert.match(await history.innerText(),unit==='mi'?/\s\/ mi/:/\s\/ km/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);await context.close();
});
