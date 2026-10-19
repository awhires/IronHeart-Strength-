import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('360px athlete Progress adds, edits and deletes manual PR records without workout changes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-manual-pr-ui-')),base='http://127.0.0.1:4224',server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4224',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let output='',browser;
 server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<200&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});const context=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-18T12:00:00'));
 await page.request.post(base+'/api/demo',{data:{role:'athlete',athleteId:'jordan'}});const before=(await(await page.request.get(base+'/api/data')).json()).logs;
 await page.goto(base);await page.getByRole('button',{name:'Goals & Progress',exact:true}).last().click();await page.getByLabel('Strength exercise',{exact:true}).selectOption('bench');
 await page.getByRole('button',{name:'+ Add Max / PR',exact:true}).click();await page.getByLabel('Exercise',{exact:true}).selectOption('bench');await page.getByLabel('Rep Max',{exact:true}).selectOption('1');await page.getByLabel('Weight (lb)',{exact:true}).fill('225');await page.getByRole('button',{name:'Save manual PR',exact:true}).click();
 const row=page.locator('.manual-pr-row');await row.getByText('1RM · 225 lb',{exact:true}).waitFor();assert.equal(await page.locator('.manual-pr-point').count(),1);
 await row.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Weight (lb)',{exact:true}).fill('230');await page.getByRole('button',{name:'Update manual PR',exact:true}).click();await row.getByText('1RM · 230 lb',{exact:true}).waitFor();
 page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'Delete',exact:true}).click();await page.getByText(/No manual max or PR entered/).waitFor();
 const after=(await(await page.request.get(base+'/api/data')).json()).logs;assert.deepEqual(after,before);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
});
