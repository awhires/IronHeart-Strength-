import {missingConditioningExercises,missingSingleUnders} from '../shared/conditioning-library.mjs';
import {missingTrackingExercises} from '../shared/tracking.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { exercises, programs } from './seed.mjs';
import { migrateToPounds } from './units.mjs';
import {LIBRARY_UPDATE,missingLibraryExercises} from '../shared/exercise-library.mjs';
export function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password,salt,64).toString('hex'); }
export function verifyPassword(password, hash) { const [salt,value] = hash.split(':'); const actual = scryptSync(password,salt,64); return timingSafeEqual(actual,Buffer.from(value,'hex')); }
export function openStore(path, demo=false) {
  mkdirSync(dirname(path),{recursive:true});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,sport TEXT DEFAULT 'Strength training');
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT,body TEXT NOT NULL,PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT);
  `);
  const all = kind => db.prepare('SELECT body FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.body));
  const get = (kind,id) => { const r=db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind,id); return r ? JSON.parse(r.body):null; };
  const put = (kind,obj,owner=null) => {db.prepare('INSERT INTO records(kind,id,owner,body) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner,body=excluded.body').run(kind,obj.id,owner,JSON.stringify(obj));return obj;};
  if (!db.prepare("SELECT value FROM metadata WHERE key='library-seeded'").get()) {
    if (!all('exercise').length) exercises.forEach(e=>put('exercise',e));
    if (!all('program').length) programs.forEach(p=>put('program',p));
    db.prepare('INSERT INTO metadata VALUES(?,?)').run('library-seeded','yes');
  }
  const addUser = (id,email,name,role,password,sport='Strength training') => db.prepare('INSERT INTO users(id,email,name,role,password,sport) VALUES(?,?,?,?,?,?)').run(id,email.toLowerCase(),name,role,hashPassword(password),sport);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    if (demo) {
      addUser('coach','coach@ironheart.demo','Alex Morgan','coach',randomBytes(24).toString('hex'));
      [['jordan','Jordan Davis','Field sport'],['maya','Maya Chen','Powerlifting'],['marcus','Marcus Reed','Basketball'],['sofia','Sofia Rivera','General fitness']].forEach(([id,name,sport])=>addUser(id,`${id}@ironheart.demo`,name,'athlete',randomBytes(24).toString('hex'),sport));
    } else {
      if (!process.env.COACH_EMAIL || !process.env.COACH_PASSWORD || process.env.COACH_PASSWORD.length<12) throw new Error('Set COACH_EMAIL and a 12+ character COACH_PASSWORD to initialize the coach account.');
      addUser('coach',process.env.COACH_EMAIL,process.env.COACH_NAME || 'Head Coach','coach',process.env.COACH_PASSWORD);
    }
  }
  if(!db.prepare('SELECT value FROM metadata WHERE key=?').get(LIBRARY_UPDATE)){
    db.exec('BEGIN');
    try{missingLibraryExercises(all('exercise')).forEach(e=>put('exercise',e));db.prepare('INSERT INTO metadata VALUES(?,?)').run(LIBRARY_UPDATE,'yes');db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(!db.prepare('SELECT value FROM metadata WHERE key=?').get('tracking-library-v1')){db.exec('BEGIN');try{missingTrackingExercises(all('exercise')).forEach(e=>put('exercise',e));db.prepare('INSERT INTO metadata VALUES(?,?)').run('tracking-library-v1','yes');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  if(!db.prepare('SELECT value FROM metadata WHERE key=?').get('conditioning-library-v1')){db.exec('BEGIN');try{missingConditioningExercises(all('exercise')).forEach(e=>put('exercise',e));db.prepare('INSERT INTO metadata VALUES(?,?)').run('conditioning-library-v1','yes');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  if(!db.prepare('SELECT value FROM metadata WHERE key=?').get('single-unders-v1')){db.exec('BEGIN');try{missingSingleUnders(all('exercise')).forEach(e=>put('exercise',e));db.prepare('INSERT INTO metadata VALUES(?,?)').run('single-unders-v1','yes');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  migrateToPounds(db);
  return { db,all,get,put,addUser };
}
