// Run after pnpm build. PLAYWRIGHT_MODULE may point to a bundled Playwright installation.
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('desktop and mobile: library selector opens, filters and adds; M:SS and mixed blocks save',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-ui-'));
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4196',HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'ui.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 let browser;
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<100&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 await mkdir('output/qa',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await t.test(`${viewport.width}px`,async()=>{
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:4196');await page.getByRole('button',{name:'Coach view',exact:true}).click();await page.getByRole('button',{name:'Create program',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Add from exercise library',exact:true}).click();
   const picker=dialog.getByRole('region',{name:'Exercise library selector'});assert.equal(await picker.isVisible(),true);
   await picker.getByLabel('Category',{exact:true}).selectOption('Cardio');await picker.getByLabel('Search exercises',{exact:true}).fill('RowErg');await picker.getByRole('button',{name:/RowErg/}).click();
   assert.equal(await picker.count(),0);await dialog.getByLabel('Duration (M:SS)',{exact:true}).fill('5:30');await dialog.getByLabel('Pace (M:SS / 500 m)',{exact:true}).fill('1:44');
   await dialog.getByLabel('New block type').selectOption('Metcon');await dialog.getByRole('button',{name:'+ Add workout block',exact:true}).click();await dialog.getByLabel('Workout / benchmark name').fill('Annie test');await dialog.getByLabel('Shared rep scheme (optional)').fill('50-40-30-20-10');await dialog.getByRole('button',{name:'+ Add movement from library'}).click();await dialog.getByLabel('Search exercises',{exact:true}).fill('Bench Press');await dialog.getByRole('region',{name:'Exercise library selector'}).getByRole('button',{name:/Bench Press/}).first().click();
   await page.screenshot({path:`output/qa/mixed-builder-${viewport.width}.png`,fullPage:true});
   await dialog.getByRole('button',{name:'Save program',exact:true}).click();await dialog.waitFor({state:'hidden'});
   const data=await (await page.request.get('http://127.0.0.1:4196/api/data')).json();const p=data.programs.findLast(p=>p.sessions[0]?.blocks?.some(b=>b.type==='Metcon'));
   assert.equal(p.sessions[0].exercises[1].metrics.durationSeconds,330);assert.equal(p.sessions[0].exercises[1].metrics.paceSeconds,104);assert.equal(p.sessions[0].blocks[1].metcon.movements.length,1);assert.deepEqual(errors,[]);
   await context.close();
  });
 }
});
