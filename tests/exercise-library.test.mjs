import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {openStore} from '../server/store.mjs';
import {exercises} from '../server/seed.mjs';
import {additionalExercises,LIBRARY_UPDATE,missingLibraryExercises} from '../shared/exercise-library.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';

test('expanded catalog includes requested variants and skips duplicate names and aliases',()=>{
  assert.equal(additionalExercises.length,49);assert.equal(exercises.length,61);
  assert.equal(new Set(exercises.map(e=>e.id)).size,exercises.length);
  assert.equal(missingLibraryExercises(exercises).length,0);
  const existing=[{id:'custom',name:'Incline Barbell Press',video:'custom-video'},{id:'other',name:'Face Pulls'}];
  const before=structuredClone(existing),missing=missingLibraryExercises(existing);
  assert.ok(!missing.some(e=>['incline-barbell','face-pull'].includes(e.id)));assert.deepEqual(existing,before);
});

test('phone catalog upgrade preserves custom edits and workouts, and does not resurrect deletions',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const api=createLocalDemo(storage);await api('demo','POST',{role:'coach'});
  const key='iron-heart-phone-preview-v1',old=JSON.parse(values.get(key));
  old.exercises=old.exercises.filter(e=>!additionalExercises.some(x=>x.id===e.id));
  old.exercises.push({id:'my-fly',name:'Incline Fly',region:'Upper body',equipment:'Dumbbell',pattern:'Push',cues:'My custom cue',video:''});
  delete old.libraryUpdates;storage.setItem(key,JSON.stringify(old));
  const data=await createLocalDemo(storage)('data');
  const stored=JSON.parse(values.get(key));assert.deepEqual(stored.assignments,old.assignments);assert.deepEqual(stored.logs,old.logs);
  assert.equal(data.exercises.find(e=>e.id==='my-fly').cues,'My custom cue');assert.ok(!data.exercises.some(e=>e.id==='incline-fly'));
  await api('delete','POST',{kind:'exercise',id:'pec-deck'});
  assert.ok(!(await createLocalDemo(storage)('data')).exercises.some(e=>e.id==='pec-deck'));
});

test('SQLite catalog update runs once and preserves custom exercise IDs and data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'iron-heart-library-')),path=join(dir,'test.sqlite');let store;
  try{
    store=openStore(path,true);
    store.db.prepare('DELETE FROM metadata WHERE key=?').run(LIBRARY_UPDATE);
    for(const e of additionalExercises)store.db.prepare("DELETE FROM records WHERE kind='exercise' AND id=?").run(e.id);
    store.put('exercise',{id:'coach-custom',name:'Dumbbell Bench Press',cues:'Keep this cue',video:''});
    const programs=store.all('program');store.db.close();store=openStore(path,true);
    assert.ok(!store.get('exercise','db-bench'));assert.equal(store.get('exercise','coach-custom').cues,'Keep this cue');assert.deepEqual(store.all('program'),programs);
    store.db.prepare("DELETE FROM records WHERE kind='exercise' AND id='pec-deck'").run();
    store.db.close();store=openStore(path,true);assert.equal(store.get('exercise','pec-deck'),null);
  }finally{store?.db.close();if(resolve(dir).startsWith(resolve(tmpdir())+ '\\'))rmSync(dir,{recursive:true,force:true});}
});
