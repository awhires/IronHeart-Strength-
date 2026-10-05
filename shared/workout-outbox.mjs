// Persistent workout payloads only; authentication remains in memory.
export function createWorkoutOutbox(storage,namespace){
 const key=`iron-heart-workout-outbox-v1:${namespace}`;
 const read=()=>{const v=storage.getItem(key);return v?JSON.parse(v):[];};
 const write=rows=>storage.setItem(key,JSON.stringify(rows));
 return {
 list:owner=>read().filter(r=>r.owner===owner),
 enqueue(owner,path,body){if(!owner)throw Error('Sign in before saving a workout.');const rows=read(),payload=JSON.stringify(body);let row=rows.find(r=>r.owner===owner&&r.path===path&&JSON.stringify(r.body)===payload);if(!row){row={owner,path,body:structuredClone(body),clientRequestId:crypto.randomUUID(),createdAt:new Date().toISOString()};write([...rows,row]);}return row;},
 remove(id){write(read().filter(r=>r.clientRequestId!==id));}
 };
}
