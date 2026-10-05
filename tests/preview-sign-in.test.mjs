import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDemo} from '../src/local-demo.mjs';

test('phone preview selects existing and newly created athletes and preserves scoped data',async()=>{
  const disk=new Map(),storage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},api=createLocalDemo(storage);
  assert.ok((await api('config')).previewAthletes.some(a=>a.id==='jordan'));
  await api('demo','POST',{role:'athlete',athleteId:'maya'});
  const data=await api('data');assert.equal(data.user.id,'maya');assert.ok(data.assignments.every(a=>a.athleteId==='maya'));assert.deepEqual(data.athletes,[]);
  await assert.rejects(api('athletes','POST',{name:'No',email:'no@example.com'}),/Coach view/);
  await api('logout','POST');await assert.rejects(api('data'));
  await api('demo','POST',{role:'coach'});
  const athlete=await api('athletes','POST',{name:'My test athlete',email:'test@example.com'});
  await api('logout','POST');assert.ok((await api('config')).previewAthletes.some(a=>a.id===athlete.id));
  await api('demo','POST',{role:'athlete',athleteId:athlete.id});
  assert.equal((await createLocalDemo(storage)('data')).user.id,athlete.id);
  await assert.rejects(api('demo','POST',{role:'athlete',athleteId:'missing'}));
  assert.equal((await api('data')).user.id,athlete.id);
});
