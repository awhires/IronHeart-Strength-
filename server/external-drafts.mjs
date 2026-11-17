import {createHash,randomUUID} from 'node:crypto';
import {parseChatGPTWorkoutImport,chatGPTWorkoutImportEnvelope} from '../shared/chatgpt-workout-import.mjs';
import {validateDraft} from '../shared/ai/validate.mjs';

export const INBOX_MAX_BYTES=500_000;
const error=(status,message,findings)=>Object.assign(new Error(message),{status,...(findings?{findings}:{})});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const serialize=value=>JSON.stringify(stable(value));
const hash=value=>createHash('sha256').update(serialize(value)).digest('hex');
const unapproved=draft=>({...structuredClone(draft),status:'draft',validationFindings:[]});
const summary=row=>({id:row.id,name:JSON.parse(row.draft_json).program.name,status:row.status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,savedProgramId:row.saved_program_id,reviewPath:`/?draft=${encodeURIComponent(row.id)}`});

export function createExternalDraftInbox({db,library}){
  // Only the inbox is migrated, including an earlier local prototype if present.
  db.exec(`CREATE TABLE IF NOT EXISTS external_drafts(
    id TEXT PRIMARY KEY,coach_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL,draft_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT,saved_program_id TEXT,
    UNIQUE(coach_id,request_key));`);
  const columns=new Set(db.prepare('PRAGMA table_info(external_drafts)').all().map(c=>c.name));
  for(const [name,type] of [['revision','INTEGER NOT NULL DEFAULT 1'],['updated_at','TEXT'],['saved_program_id','TEXT']])if(!columns.has(name))db.exec(`ALTER TABLE external_drafts ADD COLUMN ${name} ${type}`);
  const coach=id=>{if(!db.prepare("SELECT id FROM users WHERE id=? AND role='coach'").get(id))throw error(403,'Coach access required.');};
  const byKey=db.prepare('SELECT * FROM external_drafts WHERE coach_id=? AND request_key=?');
  const owned=(coachId,id)=>{coach(coachId);const row=db.prepare('SELECT * FROM external_drafts WHERE coach_id=? AND id=?').get(coachId,id);if(!row)throw error(404,'Draft not found.');return row;};
  const parse=input=>{
    if(Buffer.byteLength(JSON.stringify(input)||'')>INBOX_MAX_BYTES)throw error(413,'Draft exceeds the 500,000-byte inbox limit.');
    try{const parsed=parseChatGPTWorkoutImport(JSON.stringify(input?.format?input:chatGPTWorkoutImportEnvelope(input?.draft)),library());if(Buffer.byteLength(JSON.stringify(parsed.draft))>INBOX_MAX_BYTES)throw error(413,'Normalized draft exceeds the 500,000-byte inbox limit.');return parsed;}
    catch(e){throw error(e.status||422,e.message,e.findings);}
  };
  const detail=row=>{const draft=JSON.parse(row.draft_json),validation=validateDraft(draft,library(),{});return {...summary(row),draft,requirements:{},validation};};
  const revision=(row,value)=>{if(!Number.isInteger(value)||value!==row.revision)throw error(409,'This draft changed in another review. Your edits are still on screen. Reopen the saved draft before approving or saving.');};
  const matchingReview=(row,input)=>{
    revision(row,input?.inbox?.revision);
    if(serialize(unapproved(input?.review?.draft))!==serialize(JSON.parse(row.draft_json)))throw error(409,'Save your draft edits before approving this revision.');
    if(Object.keys(input.requirements||{}).length||input.programming)throw error(400,'Inbox reviews must use their saved program requirements.');
  };
  return {
    create(coachId,input,requestKey){
      coach(coachId);
      if(typeof requestKey!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey))throw error(400,'Provide an Idempotency-Key of 8–128 letters, numbers, dots, underscores, colons, or hyphens.');
      const parsed=parse(input),draft=unapproved(parsed.draft),payloadHash=hash(input);
      const prior=byKey.get(coachId,requestKey);
      if(prior){if(prior.payload_hash!==payloadHash)throw error(409,'This idempotency key was already used for a different draft.');return {...detail(prior),duplicate:true};}
      if(db.prepare('SELECT COUNT(*) AS count FROM external_drafts WHERE coach_id=?').get(coachId).count>=1000)throw error(429,'Draft inbox is full. Contact support before submitting more drafts.');
      const id=randomUUID(),now=new Date().toISOString(),status=parsed.validation.findings.length?'needs_review':'draft';
      db.prepare('INSERT INTO external_drafts(id,coach_id,request_key,payload_hash,draft_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(coach_id,request_key) DO NOTHING').run(id,coachId,requestKey,payloadHash,JSON.stringify(draft),status,now,now);
      const saved=byKey.get(coachId,requestKey);
      if(saved.payload_hash!==payloadHash)throw error(409,'This idempotency key was already used for a different draft.');
      return {...detail(saved),duplicate:saved.id!==id};
    },
    list(coachId){coach(coachId);return db.prepare('SELECT * FROM external_drafts WHERE coach_id=? ORDER BY created_at DESC LIMIT 100').all(coachId).map(summary);},
    get(coachId,id){return detail(owned(coachId,id));},
    update(coachId,id,input){
      const row=owned(coachId,id);revision(row,input?.revision);
      if(row.saved_program_id)throw error(409,'This draft has already been saved as a program. Submit a new draft to create another program.');
      const parsed=parse({draft:input.draft}),draft=unapproved(parsed.draft);
      if(serialize(draft)===serialize(JSON.parse(row.draft_json)))return detail(row);
      const result=db.prepare('UPDATE external_drafts SET draft_json=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND coach_id=? AND revision=? AND saved_program_id IS NULL').run(JSON.stringify(draft),parsed.validation.findings.length?'needs_review':'draft',new Date().toISOString(),id,coachId,row.revision);
      if(!result.changes)throw error(409,'Draft revision changed. Reopen the saved draft.');
      return detail(owned(coachId,id));
    },
    checkReview(coachId,input){const row=owned(coachId,input?.inbox?.id);matchingReview(row,input);if(row.saved_program_id)throw error(409,'This draft has already been saved as a program.');},
    saveApproved(coachId,input,save){
      db.exec('BEGIN IMMEDIATE');
      try{
        const row=owned(coachId,input?.inbox?.id);matchingReview(row,input);
        if(row.saved_program_id){const record=db.prepare("SELECT body FROM records WHERE kind='program' AND id=?").get(row.saved_program_id);if(!record)throw error(409,'The saved program is no longer available.');db.exec('COMMIT');return JSON.parse(record.body);}
        const result=save();
        db.prepare("UPDATE external_drafts SET saved_program_id=?,status='saved',updated_at=? WHERE id=? AND coach_id=? AND revision=?").run(result.id,new Date().toISOString(),row.id,coachId,row.revision);
        db.exec('COMMIT');return result;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
}
