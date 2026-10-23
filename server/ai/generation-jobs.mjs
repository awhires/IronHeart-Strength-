import {createHash,randomUUID} from 'node:crypto';
import {GenerationError} from './openai.mjs';
import {generationConfig,validateGenerationInput} from './generation.mjs';
import {validateDraft} from '../../shared/ai/validate.mjs';

const error=(code,message,status=409)=>new GenerationError(code,message,status);
const keyValid=key=>typeof key==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(key);
const MAX_JOBS_PER_COACH=100,MAX_ATTEMPTS_PER_STAGE=3,MAX_ATTEMPTS_PER_JOB=20,MAX_JOB_BYTES=2_000_000;
const hour=3_600_000;
const parsed=row=>row?{...row,body:JSON.parse(row.body)}:null;

export function createGenerationJobs({db,staged,config=generationConfig(),library,athleteFor,now=Date.now,newId=randomUUID}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS ai_generation_jobs(
    id TEXT PRIMARY KEY,coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,request_hash TEXT NOT NULL,body TEXT NOT NULL,
    status TEXT NOT NULL,active_token TEXT,lease_until INTEGER,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
    UNIQUE(coach_id,request_key));
    CREATE INDEX IF NOT EXISTS ai_generation_jobs_owner ON ai_generation_jobs(coach_id,updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_one_active_coach ON ai_generation_jobs(coach_id) WHERE status='running';
    CREATE TABLE IF NOT EXISTS ai_generation_attempts(
      job_id TEXT NOT NULL REFERENCES ai_generation_jobs(id) ON DELETE CASCADE,
      attempt_key TEXT NOT NULL,stage TEXT NOT NULL,week INTEGER,
      status TEXT NOT NULL,reason TEXT,started_at INTEGER NOT NULL,ended_at INTEGER,metadata TEXT,
      PRIMARY KEY(job_id,attempt_key));
    CREATE INDEX IF NOT EXISTS ai_generation_attempts_rate ON ai_generation_attempts(started_at);
  `);
  // A new server process has no surviving provider workers. Mark only unfinished
  // attempts retryable; compare-and-swap tokens prevent a late worker from writing.
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare("UPDATE ai_generation_attempts SET status='interrupted',reason='SERVER_RESTART',ended_at=? WHERE status='running'").run(now());
    db.prepare("UPDATE ai_generation_jobs SET status='interrupted',active_token=NULL,lease_until=NULL,updated_at=? WHERE status='running'").run(now());
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const controllers=new Map();
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  const rowFor=(coachId,id)=>parsed(db.prepare('SELECT * FROM ai_generation_jobs WHERE id=? AND coach_id=?').get(id,coachId));
  const requireJob=(coachId,id)=>{const row=rowFor(coachId,id);if(!row)throw error('JOB_NOT_FOUND','Generation job not found.',404);return row;};
  const attempts=id=>db.prepare('SELECT attempt_key,stage,week,status,reason,started_at,ended_at,metadata FROM ai_generation_attempts WHERE job_id=? ORDER BY started_at, rowid').all(id).map(a=>({key:a.attempt_key,stage:a.stage,week:a.week,status:a.status,reason:a.reason||null,startedAt:a.started_at,endedAt:a.ended_at,metadata:a.metadata?JSON.parse(a.metadata):null}));
  const stageOf=job=>job.body.outline?'week':'outline';
  const weekOf=job=>job.body.failedWeek||job.body.weeks.length+1;
  const assemble=job=>({schemaVersion:2,status:'draft',athleteId:job.body.input.athleteId||null,sourceProgramId:null,originalRequest:job.body.input.request,assumptions:job.body.outline.assumptions,questions:job.body.outline.questions,validationFindings:[],program:{...job.body.outline.program,plan:structuredClone(job.body.weeks)}});
  const finalDraft=(job,exerciseLibrary)=>{
    if(job.status!=='complete'||!job.body.outline||job.body.weeks.length!==job.body.outline.program.weeks)return null;
    const draft=assemble(job),validation=validateDraft(draft,exerciseLibrary,job.body.input.requirements);
    if(!validation.canApprove)return null;
    draft.validationFindings=validation.findings;
    draft.status=validation.findings.length?'needs_review':'draft';
    return {generationId:job.id,draft,requirements:job.body.input.requirements,...(job.body.input.programming?{programming:job.body.input.programming}:{}),validation,metadata:{provider:'staged',generatedAt:new Date(job.updated_at).toISOString(),stageAttempts:attempts(job.id).length}};
  };
  const view=(job,exerciseLibrary)=>({
    id:job.id,status:job.status,createdAt:job.created_at,updatedAt:job.updated_at,
    prompt:job.body.input.request,requirements:job.body.input.requirements,
    requestedWeeks:job.body.outline?.program.weeks??job.body.input.requirements.programWeeks??null,
    requestedSessionsPerWeek:job.body.outline?.trainingDays.length??job.body.input.requirements.trainingDaysPerWeek??null,
    outline:job.body.outline,validatedWeeks:job.body.weeks,completedWeeks:job.body.weeks.map(w=>w.week),
    nextStage:job.status==='complete'||job.status==='cancelled'?null:stageOf(job),
    nextWeek:job.status==='complete'||job.status==='cancelled'||!job.body.outline?null:weekOf(job),
    lastFailure:job.body.lastFailure||null,attempts:attempts(job.id),
    ...(job.status==='complete'?{completeDraft:finalDraft(job,exerciseLibrary)}:{})
  });
  const update=(job,patch)=>{
    const body=patch.body??job.body,json=JSON.stringify(body);
    if(Buffer.byteLength(json)>MAX_JOB_BYTES)throw error('JOB_TOO_LARGE','Generation job exceeded its storage limit.',413);
    db.prepare('UPDATE ai_generation_jobs SET body=?,status=?,active_token=?,lease_until=?,updated_at=? WHERE id=? AND coach_id=?').run(json,patch.status??job.status,patch.activeToken??null,patch.leaseUntil??null,now(),job.id,job.coach_id);
  };
  function get(coachId,id){return view(requireJob(coachId,id),library());}
  function list(coachId){
    return db.prepare('SELECT * FROM ai_generation_jobs WHERE coach_id=? ORDER BY updated_at DESC LIMIT 20')
      .all(coachId).map(row=>{const job=parsed(row);return {id:job.id,status:job.status,updatedAt:job.updated_at,prompt:job.body.input.request,programName:job.body.outline?.program.name||null,requestedWeeks:job.body.outline?.program.weeks??job.body.input.requirements.programWeeks??null,completedWeeks:job.body.weeks.map(week=>week.week)};});
  }
  function create(coachId,input,requestKey){
    if(!keyValid(requestKey))throw error('INVALID_IDEMPOTENCY_KEY','Use a unique 8–128 character Idempotency-Key.',400);
    const exerciseLibrary=library(),validated=validateGenerationInput(input,exerciseLibrary);
    if(validated.athleteId&&!athleteFor(validated.athleteId))throw error('INVALID_REQUEST','The selected athlete is unavailable.',400);
    const hash=createHash('sha256').update(JSON.stringify(validated)).digest('hex');
    return tx(()=>{
      const prior=parsed(db.prepare('SELECT * FROM ai_generation_jobs WHERE coach_id=? AND request_key=?').get(coachId,requestKey));
      if(prior){if(prior.request_hash!==hash)throw error('IDEMPOTENCY_CONFLICT','That key was used for a different request.');return view(prior,exerciseLibrary);}
      const count=db.prepare('SELECT count(*) AS n FROM ai_generation_jobs WHERE coach_id=?').get(coachId).n;
      if(count>=MAX_JOBS_PER_COACH)throw error('JOB_LIMIT','Too many stored generation jobs. Contact support to archive old jobs.',429);
      const id=newId(),stamp=now(),body={input:validated,outline:null,weeks:[],failedWeek:null,lastFailure:null};
      db.prepare('INSERT INTO ai_generation_jobs VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,coachId,requestKey,hash,JSON.stringify(body),'pending',null,null,stamp,stamp);
      return view(requireJob(coachId,id),exerciseLibrary);
    });
  }
  function cancel(coachId,id){
    const value=tx(()=>{
      const job=requireJob(coachId,id);
      if(job.status==='complete')throw error('JOB_COMPLETE','A completed draft cannot be canceled.');
      if(job.status==='cancelled')return view(job,library());
      if(job.active_token)db.prepare("UPDATE ai_generation_attempts SET status='cancelled',reason='EXPLICIT_CANCEL',ended_at=? WHERE job_id=? AND status='running'").run(now(),id);
      update(job,{status:'cancelled'});
      return get(coachId,id);
    });
    controllers.get(id)?.abort(error('EXPLICIT_CANCEL','Generation was canceled by the coach.',499));
    return value;
  }
  async function run(coachId,id,operation,attemptKey,{signal=null}={}){
    if(!keyValid(attemptKey))throw error('INVALID_IDEMPOTENCY_KEY','Use a unique 8–128 character Idempotency-Key.',400);
    if(!staged.status().available)throw error('NOT_CONFIGURED','Live AI generation is not configured on this server.',503);
    const exerciseLibrary=library();
    const claim=tx(()=>{
      const job=requireJob(coachId,id);
      const prior=db.prepare('SELECT * FROM ai_generation_attempts WHERE job_id=? AND attempt_key=?').get(id,attemptKey);
      if(prior)return {duplicate:true};
      if(job.status==='cancelled'||job.status==='complete')throw error('JOB_NOT_ACTIVE','This generation job is no longer active.');
      if(job.status==='running')throw error('GENERATION_BUSY','This generation job already has an active attempt.',429);
      if(db.prepare("SELECT id FROM ai_generation_jobs WHERE coach_id=? AND status='running' LIMIT 1").get(coachId))throw error('GENERATION_BUSY','This coach already has an active generation attempt.',429);
      if(db.prepare("SELECT count(*) AS n FROM ai_generation_jobs WHERE status='running'").get().n>=2)throw error('GENERATION_BUSY','The AI provider already has two active generation attempts.',429);
      if(operation==='next'&&!['pending','ready'].includes(job.status)||operation==='retry'&&job.status!=='failed'||operation==='resume'&&!['interrupted','ready','pending'].includes(job.status))throw error('INVALID_JOB_STATE','Use Next, Retry, or Resume for the job’s current state.');
      const stage=stageOf(job),week=stage==='week'?weekOf(job):null;
      const stageAttempts=db.prepare('SELECT count(*) AS n FROM ai_generation_attempts WHERE job_id=? AND stage=? AND week IS ?').get(id,stage,week).n;
      const totalAttempts=db.prepare('SELECT count(*) AS n FROM ai_generation_attempts WHERE job_id=?').get(id).n;
      if(stageAttempts>=MAX_ATTEMPTS_PER_STAGE||totalAttempts>=MAX_ATTEMPTS_PER_JOB)throw error('ATTEMPT_LIMIT','This job reached its safe retry limit.',429);
      const recent=db.prepare('SELECT count(*) AS n FROM ai_generation_attempts WHERE started_at>?').get(now()-hour).n;
      if(recent>=(config.stagedCallsPerHour??12))throw error('GENERATION_RATE_LIMIT','The hourly staged AI call limit has been reached. Resume later.',429);
      const token=newId(),stamp=now();
      db.prepare('INSERT INTO ai_generation_attempts VALUES(?,?,?,?,?,?,?,?,?)').run(id,attemptKey,stage,week,'running',null,stamp,null,null);
      update(job,{status:'running',activeToken:token,leaseUntil:stamp+170000+10000,body:{...job.body,lastFailure:null}});
      return {stage,week,token,body:job.body};
    });
    if(claim.duplicate)return get(coachId,id);
    const controller=new AbortController(),onDisconnect=()=>controller.abort(error('CLIENT_DISCONNECTED','The phone connection closed; the saved job can be resumed.',499));
    if(signal?.aborted)onDisconnect();else signal?.addEventListener('abort',onDisconnect,{once:true});
    controllers.set(id,controller);
    try{
      const input=claim.body.input,athlete=input.athleteId?athleteFor(input.athleteId):null;
      const ctx={coachId,library:exerciseLibrary,athlete,signal:controller.signal};
      const result=claim.stage==='outline'?await staged.generateOutline(input,ctx):await staged.generateWeek(input,{...ctx,outline:claim.body.outline,previousWeeks:claim.body.weeks.slice(0,claim.week-1),week:claim.week});
      tx(()=>{
        const current=requireJob(coachId,id);
        if(current.status!=='running'||current.active_token!==claim.token)return;
        const body={...current.body,failedWeek:null,lastFailure:null};
        if(claim.stage==='outline')body.outline=result.outline;
        else if(claim.week===body.weeks.length+1)body.weeks=[...body.weeks,result.week];
        else if(claim.week===body.weeks.length)body.weeks=[...body.weeks.slice(0,-1),result.week];
        else throw error('JOB_CONFLICT','A prior week changed during generation.');
        let status='ready';
        if(body.outline&&body.weeks.length===body.outline.program.weeks){
          const validation=validateDraft(assemble({...current,body}),exerciseLibrary,input.requirements);
          if(validation.canApprove)status='complete';
          else{status='failed';body.failedWeek=claim.week;body.lastFailure={code:'FINAL_VALIDATION_FAILED',stage:'week',week:claim.week};}
        }
        update(current,{status,body});
        db.prepare('UPDATE ai_generation_attempts SET status=?,reason=?,ended_at=?,metadata=? WHERE job_id=? AND attempt_key=?').run(status==='failed'?'failed':'completed',status==='failed'?'FINAL_VALIDATION_FAILED':null,now(),JSON.stringify(result.metadata),id,attemptKey);
      });
      return get(coachId,id);
    }catch(cause){
      const code=controller.signal.reason?.code==='EXPLICIT_CANCEL'?'EXPLICIT_CANCEL':controller.signal.reason?.code==='CLIENT_DISCONNECTED'?'CLIENT_DISCONNECTED':cause instanceof GenerationError?cause.code:'PROVIDER_UNAVAILABLE';
      tx(()=>{
        const current=requireJob(coachId,id);
        if(current.status!=='running'||current.active_token!==claim.token)return;
        const interrupted=code==='CLIENT_DISCONNECTED',status=interrupted?'interrupted':'failed';
        const body={...current.body,failedWeek:claim.stage==='week'?claim.week:null,lastFailure:{code,stage:claim.stage,week:claim.week,...(cause?.metadata?.validation?.findings?{findings:cause.metadata.validation.findings}:{})}};
        update(current,{status,body});
        db.prepare('UPDATE ai_generation_attempts SET status=?,reason=?,ended_at=?,metadata=? WHERE job_id=? AND attempt_key=?').run(status,code,now(),cause?.metadata?JSON.stringify(cause.metadata):null,id,attemptKey);
      });
      if(code==='EXPLICIT_CANCEL')throw error('EXPLICIT_CANCEL','Generation was canceled by the coach.',499);
      if(code==='CLIENT_DISCONNECTED')throw error('CLIENT_DISCONNECTED','The phone connection closed; the saved job can be resumed.',499);
      if(cause instanceof GenerationError)throw cause;
      throw error('PROVIDER_UNAVAILABLE','The AI provider is unavailable. Try again later.',502);
    }finally{signal?.removeEventListener('abort',onDisconnect);if(controllers.get(id)===controller)controllers.delete(id);}
  }
  return {create,get,list,run,cancel};
}
