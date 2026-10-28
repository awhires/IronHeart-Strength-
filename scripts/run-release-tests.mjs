import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scope=process.argv[2];
if(!['automated','browser'].includes(scope))throw new Error('Usage: node scripts/run-release-tests.mjs <automated|browser>');

// These are preserved development tests for the deliberately unfinished external
// Draft Inbox/MCP integration. They are excluded from release verification only.
const excluded=new Set(scope==='browser'
  ?['external-drafts.browser.mjs']
  :['external-drafts-api.test.mjs','mcp-drafts.test.mjs']);
const folder=join(root,'tests',scope==='browser'?'ui':'');
const suffix=scope==='browser'?'.browser.mjs':'.test.mjs';
const files=(await readdir(folder,{withFileTypes:true}))
  .filter(entry=>entry.isFile()&&entry.name.endsWith(suffix))
  .sort((a,b)=>a.name.localeCompare(b.name));
const selected=files.filter(entry=>!excluded.has(entry.name)).map(entry=>join(folder,entry.name));
const omitted=files.filter(entry=>excluded.has(entry.name)).map(entry=>entry.name);
if(!selected.length)throw new Error(`No ${scope} release tests found.`);
console.log(`Iron Heart ${scope} release suite: ${selected.length} test files.`);
console.log(omitted.length?`Explicitly excluded unfinished MCP/external-drafts tests: ${omitted.join(', ')}`:'No unfinished MCP/external-drafts tests found.');
const env=scope==='browser'?{...process.env,IH_UI_TEST_SERVER:'true',VITE_API_URL:'',VITE_API_BASE_URL:''}:process.env;
const child=spawn(process.execPath,['--test','--test-concurrency=1',...selected],{cwd:root,stdio:'inherit',env});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{if(signal){console.error(`Test runner stopped by ${signal}.`);process.exitCode=1;}else process.exitCode=code??1;});
