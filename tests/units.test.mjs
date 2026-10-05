import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateToPounds,toPounds} from '../server/units.mjs';
test('pounds migration converts all load snapshots exactly once and preserves other fields',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE records(kind TEXT,id TEXT,body TEXT);');
  const item={load:60,increment:2.5,reps:8,sets:3};
  const values=[['program',{sessions:[{exercises:[item]}]}],['assignment',{plan:[{sessions:[{exercises:[item]}]}]}],['log',{exercises:[{target:item,sets:[{load:60,reps:8,rpe:7},{load:0,reps:8,rpe:6}]}]}]];
  for(const [kind,record] of values)db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind,kind,JSON.stringify(record));
  migrateToPounds(db);
  const first=db.prepare('SELECT body FROM records ORDER BY kind').all();
  const p=JSON.parse(db.prepare("SELECT body FROM records WHERE kind='program'").get().body).sessions[0].exercises[0];
  assert.equal(p.load,132.25);assert.equal(p.increment,5.5);assert.equal(p.reps,8);assert.equal(p.sets,3);
  const log=JSON.parse(db.prepare("SELECT body FROM records WHERE kind='log'").get().body).exercises[0];
  assert.equal(log.target.load,132.25);assert.equal(log.sets[0].load,132.25);assert.equal(log.sets[1].load,0);assert.equal(log.sets[0].rpe,7);
  migrateToPounds(db);assert.deepEqual(db.prepare('SELECT body FROM records ORDER BY kind').all(),first);
  assert.equal(toPounds(0),0);
  // The original 500 kg input limit must still fit the pounds-based fields.
  assert.equal(toPounds(500),1102.25);
  assert.ok(toPounds(500)<=1200);
  db.close();
});
