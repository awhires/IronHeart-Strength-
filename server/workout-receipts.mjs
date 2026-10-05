import {createHash} from 'node:crypto';
export function workoutReceipts(store){
 const {db,get}=store;
 db.exec('CREATE TABLE IF NOT EXISTS workout_receipts(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,log_id TEXT NOT NULL,PRIMARY KEY(user_id,request_id))');
 return function begin(user,path,body){
  const {clientRequestId,...payload}=body;
  if(clientRequestId==null)return {payload,commit:fn=>fn()};
  if(typeof clientRequestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(clientRequestId))throw Object.assign(Error('Invalid workout request ID.'),{status:400});
  const hash=createHash('sha256').update(path+JSON.stringify(payload)).digest('hex');
  const old=db.prepare('SELECT * FROM workout_receipts WHERE user_id=? AND request_id=?').get(user,clientRequestId);
  if(old){if(old.request_hash!==hash)throw Object.assign(Error('This save ID belongs to a different workout.'),{status:409});const result=get('log',old.log_id);if(!result)throw Object.assign(Error('This workout was deleted. Start a new workout to redo it.'),{status:410});return {payload,result};}
  return {payload,commit(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.prepare('INSERT INTO workout_receipts VALUES(?,?,?,?)').run(user,clientRequestId,hash,result.id);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
 };
}
