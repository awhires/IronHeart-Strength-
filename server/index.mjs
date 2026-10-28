import {sessionRecommendations,withAthleteRecommendations} from '../shared/adaptive-prescriptions.mjs';
import {propagateProgram} from '../shared/program-sync.mjs';
import {prepareStrengthGoal,prepareStrengthPR} from '../shared/strength-progress.mjs';
import {discoverable,confirmSchedule,proposeSchedule,moveWorkout,validDate,weekdayDate,scheduleRows} from '../shared/program-schedule.mjs';
import {repeatProgramInstance,completedProgram,benchmarkDefinitions,analyzeTrainingQuestion} from '../shared/phase3.mjs';
import {prepareBenchmark,benchmarkAttemptSignature} from '../shared/benchmark-attempts.mjs';
import {workoutReceipts} from './workout-receipts.mjs';
import {recordBlockScores,referencesExercise} from '../shared/workout-blocks.mjs';
import {createScanService} from './ai/scan.mjs';
import http from 'node:http';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { openStore, verifyPassword, hashPassword } from './store.mjs';
import { periodize, recommend } from './progression.mjs';
import {prepareProgram,prepareSession,prepareItems,recordPerformance,normalizeData} from '../shared/prescriptions.mjs';
import {createDraftSaveService} from '../shared/ai/save-service.mjs';
import {createGenerationService,generationConfig,validateGenerationInput} from './ai/generation.mjs';
import {createStagedGenerationService} from './ai/staged.mjs';
import {createGenerationJobs} from './ai/generation-jobs.mjs';
import {GenerationError} from './ai/openai.mjs';
import {createTrainingAnswerService} from './ai/training-answers.mjs';
import {FIELDS} from '../shared/tracking.mjs';
import {refreshAssignmentRunningPaces} from '../shared/automatic-running-pace.mjs';
const draftSaves=createDraftSaveService(randomUUID);
const checked=fn=>{try{return fn();}catch(e){throw Object.assign(e,{status:400});}};

const production=process.argv.includes('--production');
const lanPreview=process.argv.includes('--lan-preview');
const testServer=process.argv.includes('--test-server');
const uiTestServer=testServer&&process.env.IH_UI_TEST_SERVER==='true';
if(production&&lanPreview)throw Error('LAN preview cannot run in production.');
// Browser/API regression tests must exercise the current source against their
// isolated loopback API, never a stale dist bundle with a production URL baked in.
if(uiTestServer){process.env.VITE_API_URL='';process.env.VITE_API_BASE_URL='';}
if(process.env.AI_TEST_FIXTURE&&!process.argv.includes('--test-server'))throw Error('AI_TEST_FIXTURE is allowed only with --test-server.');
const testProvider=process.env.AI_TEST_FIXTURE?{name:'test-fixture',model:'fixture',generateProgramDraft:async(request,context,task={})=>{const fixture=JSON.parse(await readFile(process.env.AI_TEST_FIXTURE,'utf8'));const stage=task.schema?.properties?.trainingDays?'outline':task.schema?.properties?.sessions?`week:${context.requested_week}`:'legacy';if(fixture.delayStage===stage&&fixture.delayMs)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,fixture.delayMs);task.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(task.signal.reason);},{once:true});});if(fixture.testUsage)task.onUsage?.(fixture.testUsage);if(fixture.testTiming)task.onTiming?.(fixture.testTiming);return stage==='outline'?fixture.outline:stage.startsWith('week:')?fixture.weeks?.[context.requested_week-1]:fixture;}}:undefined;
const generation=createGenerationService({config:generationConfig(),provider:testProvider,production});
const staged=createStagedGenerationService({config:generationConfig(),provider:testProvider,...(process.argv.includes('--test-server')&&process.env.AI_TEST_DEADLINE_MS?{deadlineMs:Number(process.env.AI_TEST_DEADLINE_MS)}:{})});
const qaConfig=generationConfig();
const trainingAnswers=createTrainingAnswerService({apiKey:qaConfig.provider==='openai'&&qaConfig.enabled?qaConfig.apiKey:'',model:qaConfig.model,timeoutMs:Math.min(qaConfig.timeoutMs,30000),requestsPerHour:qaConfig.requestsPerHour});
const scanner=createScanService();
const demo=process.env.DEMO_MODE === 'true' || (!production && process.env.DEMO_MODE !== 'false');
if (production && demo) throw new Error('Demo mode cannot run in production. Use a separate production database.');
const store=openStore(process.env.DB_PATH || `./data/${demo?'demo':'iron-heart'}.sqlite`,demo);
const {db,all,get,put,addUser}=store;
const generationJobs=createGenerationJobs({db,staged,config:generationConfig(),library:()=>all('exercise'),athleteFor:id=>db.prepare("SELECT id,sport FROM users WHERE id=? AND role='athlete'").get(id)});
const workoutReceipt=workoutReceipts(store);
if (!demo && db.prepare("SELECT id FROM users WHERE email LIKE '%@ironheart.demo' LIMIT 1").get()) throw new Error('Demo database cannot be used in production.');
const publicUser = u => ({id:u.id,email:u.email,name:u.name,role:u.role,sport:u.sport});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const str=(x,min=1,max=200)=>typeof x==='string' && x.trim().length>=min && x.length<=max;
const num=(x,min,max)=>Number.isFinite(x) && x>=min && x<=max;
function assign(program,athleteId,startDate,resolvePaces=true) {
  const assignment={id:randomUUID(),athleteId,programId:program.id,name:program.name,startDate,weeks:program.weeks,goal:program.goal,coachNotes:program.coachNotes,progressionInstructions:program.progressionInstructions,aiProvenance:program.aiProvenance,progressionOptions:program.progressionOptions,repeatable:program.repeatable!==false,benchmarkType:program.benchmarkType||'none',
    description:program.description,modality:program.modality,level:program.level,plan:program.plan?structuredClone(program.plan):Array.from({length:program.weeks},(_,i)=>({week:i+1,sessions:program.sessions.map(s=>({...s,exercises:s.exercises.map(e=>periodize(e,i+1,program.weeks))}))}))};
  return resolvePaces?refreshAssignmentRunningPaces(assignment,{logs:all('log'),definitions:all('benchmark'),library:all('exercise')},all('log')).assignment:assignment;
}
function refreshRunningForAthlete(athleteId){
 const logs=all('log'),context={logs,definitions:all('benchmark'),library:all('exercise')};
 for(const assignment of all('assignment').filter(a=>a.athleteId===athleteId)){
  const refreshed=refreshAssignmentRunningPaces(assignment,context,logs);
  if(refreshed.changed)put('assignment',refreshed.assignment,athleteId);
 }
}
function saveLogAndRefresh(log,athleteId){const saved=put('log',log,athleteId);refreshRunningForAthlete(athleteId);return saved;}
if(demo&&!db.prepare("SELECT value FROM metadata WHERE key='demo-assigned'").get()){
  const date=new Date();date.setDate(date.getDate()-((date.getDay()+6)%7));
  const dateOnly=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if(!all('assignment').length)for(const id of ['jordan','maya','marcus','sofia'])put('assignment',assign(get('program','strength-foundations'),id,dateOnly),id);
  db.prepare('INSERT INTO metadata VALUES(?,?)').run('demo-assigned','yes');
}
let vite;
if(!production&&(!testServer||uiTestServer)){const {createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/android/**','**/data/**','**/output/**','**/tmp/**']}},appType:'spa'});if(uiTestServer)await vite.warmupRequest('/src/main.jsx');}
const rate=new Map();
function limit(req){const key=req.socket.remoteAddress;const now=Date.now();const old=rate.get(key);const value=old&&old.until>now?old:{count:0,until:now+60000};value.count++;rate.set(key,value);if(rate.size>10000)for(const [k,v] of rate)if(v.until<now)rate.delete(k);if(value.count>30)fail(429,'Too many attempts. Try again in a minute.');}
const allowed=(process.env.ALLOWED_ORIGINS||'https://localhost,http://localhost').split(',');
async function body(req,maxBytes=200000){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>maxBytes)fail(413,'Request is too large.');}try{return raw?JSON.parse(raw):{};}catch{fail(400,'Invalid JSON.');}}
function tokenHash(token){return createHash('sha256').update(token).digest('hex');}
function session(res,user,native){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),user.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`ihs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${production?'; Secure':''}`);return {user:publicUser(user),...(native?{token}:{})};}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/')){
    if(vite)return vite.middlewares(req,res);
    try{const path=resolve('dist','.'+decodeURIComponent(url.pathname));if(path!==resolve('dist')&&!path.startsWith(resolve('dist')+'/')&&!path.startsWith(resolve('dist')+'\\'))throw Error();let data;let extension=extname(path);try{data=await readFile(path);}catch{if(extension){res.writeHead(404);return res.end('Not found');}data=await readFile('dist/index.html');extension='.html';}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extension]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}return;
  }
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const origin=req.headers.origin;
    const ownOrigin=`${production?'https':'http'}://${req.headers.host}`;
    if(origin && origin!==ownOrigin && !allowed.includes(origin))fail(403,'Origin not allowed.');
    if(origin&&allowed.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const b=['POST','PUT','DELETE'].includes(req.method)?await body(req,url.pathname==='/api/ai/workout-scan'?5700000:200000):{};
    let result;
    const route=url.pathname;
    if(route==='/api/health'){result={service:'iron-heart',ok:true,aiAvailable:generation.status().available};}
    else if(route==='/api/config'){result={demo};}
    else if(route==='/api/login'&&req.method==='POST'){
      limit(req);const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email||'').toLowerCase());
      if(!str(b.password,1,200)||!u||!verifyPassword(b.password,u.password))fail(401,'Email or password is incorrect.');result=session(res,u,b.native===true);
    }else if(route==='/api/demo'&&req.method==='POST'){
      if(!demo)fail(404,'Not found');limit(req);const u=db.prepare('SELECT * FROM users WHERE id=?').get(b.role==='athlete'?'jordan':'coach');result=session(res,u,b.native===true);
    }else if(route==='/api/redeem'&&req.method==='POST'){
      limit(req);const inv=db.prepare('SELECT * FROM invites WHERE token=? AND expires>?').get(tokenHash(String(b.code||'')),Date.now());
      if(!inv)fail(400,'Invitation is invalid or expired.');if(!str(b.password,12,200))fail(400,'Choose a password of at least 12 characters.');
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(b.password),inv.user_id);db.prepare('DELETE FROM invites WHERE user_id=?').run(inv.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(inv.user_id);result=session(res,db.prepare('SELECT * FROM users WHERE id=?').get(inv.user_id),b.native===true);
    }else{
      const token=req.headers.authorization?.replace(/^Bearer /,'')||req.headers.cookie?.match(/(?:^|; )ihs_session=([^;]+)/)?.[1];
      const u=token&&db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(tokenHash(token),Date.now());
      if(!u)fail(401,'Please sign in.');const coach=()=>{if(u.role!=='coach')fail(403,'Coach access required.');};
      const owned=id=>{const a=get('assignment',id);if(!a)fail(404,'Program not found.');if(u.role!=='coach'&&a.athleteId!==u.id)fail(403,'This program belongs to another athlete.');return a;};
      if(route==='/api/me')result=publicUser(u);
      else if(route==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token));res.setHeader('Set-Cookie','ihs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');result={ok:true};}
      else if(route==='/api/data'&&req.method==='GET'){const assignments=all('assignment').filter(a=>u.role==='coach'||a.athleteId===u.id),programs=all('program'),discover=u.role==='athlete'?programs.filter(p=>discoverable(p,u.id)).map(({discover,...p})=>p):[],athleteLogs=u.role==='athlete'?all('log').filter(l=>l.athleteId===u.id):[],savedBenchmarks=all('benchmark').filter(x=>u.role==='coach'?x.coachId===u.id:assignments.some(a=>a.programId===x.programId)||athleteLogs.some(l=>l.benchmarkId===x.id));result={user:publicUser(u),demo,exercises:all('exercise'),programs:u.role==='coach'?programs:[],discover,athletes:u.role==='coach'?db.prepare("SELECT id,name,email,role,sport FROM users WHERE role='athlete'").all():[],assignments,strengthGoals:all('strengthGoal').filter(g=>u.role==='coach'||g.athleteId===u.id),strengthPRs:all('strengthPR').filter(p=>u.role==='coach'||p.athleteId===u.id),logs:u.role==='coach'?all('log'):athleteLogs,benchmarks:benchmarkDefinitions(u.role==='coach'?programs:[],assignments),savedBenchmarks};}
      else if(route==='/api/benchmarks'&&req.method==='POST'){coach();const program=get('program',b.programId);if(!program)fail(404,'Program not found.');const definition=checked(()=>prepareBenchmark(b,program,all('exercise'),{id:randomUUID(),coachId:u.id,createdAt:new Date().toISOString()}));result=put('benchmark',definition,u.id);}
      else if(route==='/api/ask-ai'&&req.method==='POST'){
        const athleteId=u.role==='coach'?b.athleteId:u.id;
        if(typeof athleteId!=='string'||!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(athleteId))fail(400,'Choose an athlete to ask about.');
        if(u.role==='coach'&&!db.prepare("SELECT id FROM records WHERE kind='assignment' AND owner=? LIMIT 1").get(athleteId))fail(403,'Choose an athlete you coach.');
        const ownLogs=all('log').filter(l=>l.athleteId===athleteId);
        const analysis=checked(()=>analyzeTrainingQuestion({question:b.question,logs:ownLogs,library:all('exercise'),assignments:all('assignment').filter(a=>a.athleteId===athleteId),timeZone:b.timeZone||'UTC'}));
        if(!trainingAnswers.available&&!analysis.deterministic)fail(503,'Ask AI is unavailable. Configure the existing OpenAI provider on the server.');
        result=analysis.deterministic?{...analysis,provider:'verified-workout-history'}:await trainingAnswers.answer({userId:u.id,question:b.question,analysis});
      }
      else if(route==='/api/strength-goal'&&req.method==='POST'){const athleteId=b.athleteId||u.id;if(u.role!=='coach'&&athleteId!==u.id)fail(403,'Access denied.');if(!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(athleteId))fail(404,'Athlete not found.');result=put('strengthGoal',checked(()=>prepareStrengthGoal(b,all('exercise'),athleteId)),athleteId);}
      else if(route==='/api/strength-pr'&&req.method==='POST'){if(u.role!=='athlete')fail(403,'Athlete access required.');if(b.athleteId&&b.athleteId!==u.id)fail(403,'Access denied.');if(b.id){const previous=get('strengthPR',b.id);if(!previous||previous.athleteId!==u.id)fail(404,'Manual PR not found.');}result=put('strengthPR',checked(()=>prepareStrengthPR(b,all('exercise'),u.id)),u.id);}
      else if(route==='/api/enrollment-preview'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Athlete access required.');let a;if(b.assignmentId)a=owned(b.assignmentId);else{const p=get('program',b.programId);if(!p||!discoverable(p,u.id))fail(404,'Program unavailable.');a=assign(p,u.id,b.startDate);}result=checked(()=>proposeSchedule(a,b));
      }
      else if(route==='/api/enroll'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Athlete access required.');let a;if(b.assignmentId)a=owned(b.assignmentId);else{const p=get('program',b.programId);if(!p||!discoverable(p,u.id))fail(404,'Program unavailable.');const existing=all('assignment').find(x=>x.athleteId===u.id&&x.programId===p.id);if(existing)fail(409,'This program is already in My Programs. Open that assignment.');a={...assign(p,u.id,b.startDate),enrollment:{source:'discover',status:'pending'}};}result=put('assignment',checked(()=>confirmSchedule(a,b,all('log'))),u.id);
      }
      else if(route==='/api/move-workout'&&req.method==='POST'){const a=owned(b.id);result=put('assignment',checked(()=>moveWorkout(a,b,all('log'))),a.athleteId);}
      else if(route==='/api/programs'&&req.method==='POST'){coach();const library=all('exercise'),prepared=checked(()=>prepareProgram(b,library)),id=b.id||randomUUID(),previous=b.id?get('program',b.id):null;if(b.id&&!previous)fail(404,'Template not found.');const linked=previous?all('assignment').filter(a=>a.programId===id):[],logs=linked.length?all('log'):[],sync={assignments:linked.length,updated:0,completed:0,personalized:0,progression:0,conflicts:[]};db.exec('BEGIN');try{const saved=put('program',{...prepared,id});for(const a of linked){const oldPlan=assign(previous,a.athleteId,a.startDate,false).plan,newPlan=assign(saved,a.athleteId,a.startDate,false).plan;const changed=propagateProgram(a,oldPlan,newPlan,logs,previous.progressionOptions,saved.progressionOptions,previous,saved);const next=refreshAssignmentRunningPaces({...changed.assignment,repeatable:saved.repeatable!==false,benchmarkType:saved.benchmarkType||'none'},{logs,definitions:all('benchmark'),library:all('exercise')},logs).assignment;if(JSON.stringify(next)!==JSON.stringify(a))put('assignment',next,a.athleteId);sync.updated+=changed.summary.updated;sync.completed+=changed.summary.completed;sync.personalized+=changed.summary.personalized;sync.progression+=changed.summary.progression;sync.conflicts.push(...changed.summary.conflictDetails.map(item=>({athleteId:a.athleteId,assignmentId:a.id,...item})));}db.exec('COMMIT');result={...saved,sync};}catch(error){db.exec('ROLLBACK');throw error;}}
      else if(route==='/api/ai/workout-scan'&&req.method==='POST'){limit(req);result=await scanner.scan(b,{userId:u.id,library:all('exercise')});}
      else if(route==='/api/ai/status'&&req.method==='GET'){coach();result=generation.status();}
      else if(route==='/api/ai/program-draft'&&req.method==='POST'){
        coach();const library=all('exercise');const input=validateGenerationInput(b,library);
        const athlete=input.athleteId?db.prepare("SELECT id,sport FROM users WHERE id=? AND role='athlete'").get(input.athleteId):null;
        const controller=new AbortController(),onClose=()=>{if(!res.writableEnded)controller.abort(new GenerationError('CLIENT_CANCELED','Generation canceled because the connection closed.',499));};res.once('close',onClose);
        try{result=await generation.generateProgramDraft(input,{coachId:u.id,library,athlete,signal:controller.signal});}finally{res.off('close',onClose);}
      }
      else if(route==='/api/ai/jobs'&&req.method==='GET'){coach();result=generationJobs.list(u.id);}
      else if(route==='/api/ai/jobs'&&req.method==='POST'){coach();result=generationJobs.create(u.id,b,req.headers['idempotency-key']);}
      else if(route.startsWith('/api/ai/jobs/')){
        coach();const match=route.match(/^\/api\/ai\/jobs\/([\w-]+)(?:\/(next|retry|resume|cancel))?$/);
        if(!match)fail(404,'Generation job not found.');
        const [,jobId,action]=match;
        if(req.method==='GET'&&!action)result=generationJobs.get(u.id,jobId);
        else if(req.method==='POST'&&action==='cancel')result=generationJobs.cancel(u.id,jobId);
        else if(req.method==='POST'&&['next','retry','resume'].includes(action)){
          const controller=new AbortController(),onClose=()=>{if(!res.writableEnded)controller.abort(new GenerationError('CLIENT_DISCONNECTED','The phone connection closed.',499));};
          res.once('close',onClose);
          try{result=await generationJobs.run(u.id,jobId,action,req.headers['idempotency-key'],{signal:controller.signal});}finally{res.off('close',onClose);}
        }else fail(404,'Generation job endpoint not found.');
      }
      else if(route==='/api/ai/approve'&&req.method==='POST'){coach();result=checked(()=>draftSaves.approve(b,all('exercise'),u.id));}
      else if(route==='/api/ai/programs'&&req.method==='POST'){coach();result=checked(()=>draftSaves.save(b,all('exercise'),u.id,p=>put('program',prepareProgram(p,all('exercise')))));}
      else if(route==='/api/delete'&&req.method==='POST'){
        if(b.kind==='athlete'){coach();if(!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.id))fail(404,'Athlete not found.');db.prepare('DELETE FROM records WHERE owner=?').run(b.id);db.prepare('DELETE FROM users WHERE id=?').run(b.id);result={ok:true};}
        else {
        if(!['program','assignment','exercise','log','strengthPR'].includes(b.kind))fail(400,'Invalid record type.');const record=get(b.kind,b.id);if(!record)fail(404,'Record not found.');
        if(b.kind==='log'||b.kind==='strengthPR'){if(u.role!=='coach'&&record.athleteId!==u.id)fail(403,'Access denied.');if(b.kind==='strengthPR'&&u.role!=='athlete')fail(403,'Only the athlete can change their manual PR.');}
        else coach();
        if(b.kind==='exercise'&&[...all('program'),...all('assignment'),...all('log'),...all('strengthGoal')].map(r=>r.exerciseId?{exercises:[r]}:r).some(r=>referencesExercise(r,b.id)))fail(409,'This exercise is in use. Remove it from programs and assignments first; exercises in workout history must be kept.');
        db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(b.kind,b.id);if(b.kind==='log')refreshRunningForAthlete(record.athleteId);result={ok:true};
        }
      }
      else if(route==='/api/session-status'&&req.method==='POST'){coach();const a=owned(b.id);const s=a.plan.find(w=>w.week===b.week)?.sessions[b.session];if(!s||typeof b.cancelled!=='boolean')fail(400,'Invalid session.');s.cancelled=b.cancelled;result=put('assignment',a,a.athleteId);}
      else if(route==='/api/reschedule'&&req.method==='POST'){coach();const a=owned(b.id);const w=a.plan.find(w=>w.week===b.week);if(!w?.sessions[b.session]||!Number.isInteger(b.day)||!num(b.day,0,6))fail(400,'Choose a valid weekday.');if(a.schedule)result=put('assignment',checked(()=>moveWorkout(a,{week:b.week,session:b.session,targetDate:weekdayDate(a,b.week,b.session,b.day)},all('log'))),a.athleteId);else{w.sessions[b.session].day=b.day;result=put('assignment',a,a.athleteId);}}
      else if(route==='/api/exercises'&&req.method==='POST'){coach();if(!str(b.name)||!str(b.region)||!str(b.equipment)||!str(b.pattern)||!str(b.cues,0,2000)|| (b.video!==''&&!/^[\w-]{11}$/.test(b.video))||(b.trackingType!==undefined&&!Object.hasOwn(FIELDS,b.trackingType)))fail(400,'Enter exercise details, choose a supported measurement profile, and use a valid YouTube video URL or ID.');result=put('exercise',{...(b.id?get('exercise',b.id):{}),id:b.id||randomUUID(),name:b.name,region:b.region,equipment:b.equipment,pattern:b.pattern,cues:b.cues,video:b.video,...(b.trackingType?{trackingType:b.trackingType}:{})});}
      else if(route==='/api/athletes'&&req.method==='POST'){coach();if(!str(b.name)||!str(b.email)||!/^\S+@\S+\.\S+$/.test(b.email)||!str(b.sport))fail(400,'Enter name, email, and sport.');if(db.prepare('SELECT id FROM users WHERE email=?').get(b.email.toLowerCase()))fail(409,'This email already has an account.');const id=randomUUID();addUser(id,b.email,b.name,'athlete',randomBytes(24).toString('hex'),b.sport);const code=randomBytes(24).toString('hex');db.prepare('INSERT INTO invites VALUES(?,?,?)').run(tokenHash(code),id,Date.now()+7*86400000);result={id,code};}
      else if(route==='/api/invite'&&req.method==='POST'){coach();if(!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.athleteId))fail(404,'Athlete not found.');const code=randomBytes(24).toString('hex');db.prepare('DELETE FROM invites WHERE user_id=?').run(b.athleteId);db.prepare('INSERT INTO invites VALUES(?,?,?)').run(tokenHash(code),b.athleteId,Date.now()+7*86400000);result={code};}
      else if(route==='/api/assign'&&req.method==='POST'){coach();const p=get('program',b.programId);if(!p||!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.athleteId))fail(400,'Choose an athlete and program.');if(!validDate(b.startDate))fail(400,'Choose a start date.');const a=assign(p,b.athleteId,b.startDate);if(b.requireSetup===true||b.requireSetup==='on')a.enrollment={source:'coach',status:'pending'};result=put('assignment',a,b.athleteId);}
      else if(route==='/api/repeat-program'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Athlete access required.');const source=owned(b.assignmentId),program=get('program',source.programId);
        if(program?.repeatable===false||source.repeatable===false)fail(403,'Your coach has not enabled repeating this program.');
        if(!validDate(b.startDate))fail(400,'Choose a valid start date.');
        const logs=all('log').filter(l=>l.athleteId===u.id),otherAssignments=all('assignment').filter(a=>a.athleteId===u.id&&a.id!==source.id);if(otherAssignments.some(a=>a.programId===source.programId&&!completedProgram(a,logs)))fail(409,'This athlete already has an active attempt of this program. Finish it before starting another.');const id=randomUUID(),next=repeatProgramInstance(source,{id,startDate:b.startDate},logs);
        if(source.schedule){const availableDays=source.schedule.availableDays||[0,1,2,3,4,5,6],preferences=source.schedule.preferences||{};next.schedule=proposeSchedule({...next,schedule:undefined},{startDate:b.startDate,availableDays,preferences});}
        const dates=new Set(scheduleRows(next).map(r=>r.date));for(const other of otherAssignments.filter(a=>a.enrollment?.status!=='pending'&&!completedProgram(a,logs)))for(const row of scheduleRows(other))if(dates.has(row.date))fail(409,`Repeating this program conflicts with ${other.name} on ${row.date}. Choose another start date.`);
        result=put('assignment',next,u.id);
      }
      else if(route==='/api/assignment'&&req.method==='PUT'){coach();const a=owned(b.id);const week=a.plan.find(w=>w.week===b.week);if(!week||!week.sessions[b.session])fail(400,'Session not found.');Object.assign(week.sessions[b.session],checked(()=>prepareSession({...week.sessions[b.session],exercises:b.exercises,...(b.blocks!==undefined?{blocks:b.blocks}:{})},all('exercise'))));week.sessions[b.session].prescriptionRevision=(week.sessions[b.session].prescriptionRevision||0)+1;const logs=all('log');result=put('assignment',refreshAssignmentRunningPaces(a,{logs,definitions:all('benchmark'),library:all('exercise')},logs).assignment,a.athleteId);}
      else if(route==='/api/tracker'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Sign in as an athlete to journal a workout.');
        const receipt=workoutReceipt(u.id,route,b);
        if(receipt.result)result=receipt.result;
        else{
          let repeatOfLogId;
          if(b.repeatOfLogId!==undefined){const original=get('log',b.repeatOfLogId);if(!original||original.athleteId!==u.id)fail(404,'Original workout was not found.');repeatOfLogId=original.id;}
          const benchmark=b.benchmarkId?get('benchmark',b.benchmarkId):null;
          if(b.benchmarkId&&(!benchmark||!all('assignment').some(a=>a.athleteId===u.id&&a.programId===benchmark.programId)))fail(403,'Benchmark is not available to this athlete.');
          const attemptId=b.repeatAttemptId||b.benchmarkAttemptId;
          if(b.repeatAttemptId&&!repeatOfLogId||b.benchmarkId&&!attemptId||attemptId&&(typeof attemptId!=='string'||!/^[\w-]{16,100}$/.test(attemptId)))fail(400,'Invalid workout attempt ID.');
          const attemptHash=attemptId?createHash('sha256').update(JSON.stringify(receipt.payload)).digest('hex'):null;
          const duplicate=attemptId?all('log').find(l=>l.athleteId===u.id&&l.attemptId===attemptId):null;
          if(duplicate){if(duplicate.repeatOfLogId!==repeatOfLogId||duplicate.benchmarkId!==benchmark?.id||duplicate.attemptHash!==attemptHash)fail(409,'This attempt ID belongs to a different workout.');result=duplicate;}
          else{
            if(b.assessmentMaximal!==undefined&&(typeof b.assessmentMaximal!=='boolean'||benchmark?.scoring?.protocol!=='six_minute_max_run'))fail(400,'Maximal effort confirmation requires a six-minute running assessment.');
            const {repeatOfLogId:_source,repeatAttemptId:_repeat,benchmarkAttemptId:_benchmarkAttempt,benchmarkId:_benchmarkId,assessmentMaximal:_maximal,...payload}=receipt.payload;
            const workout=checked(()=>prepareTrackerWorkout(payload,all('exercise')));
            const signature=benchmark?benchmarkAttemptSignature(workout.exercises,workout.blocks,benchmark.scoring):null;
            result=receipt.commit(()=>saveLogAndRefresh({...workout,id:randomUUID(),athleteId:u.id,createdAt:new Date().toISOString(),...(repeatOfLogId?{repeatOfLogId}:{}),...(benchmark?{benchmarkId:benchmark.id,benchmarkSignature:signature,...(benchmark.scoring.protocol==='six_minute_max_run'?{assessmentMaximal:b.assessmentMaximal===true}:{})}:{}),...(attemptId?{attemptId,attemptHash}:{})},u.id));
          }
        }
      }
      else if(route==='/api/log'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Sign in as an athlete to record a workout.');const receipt=workoutReceipt(u.id,route,b);if(receipt.result)result=receipt.result;else{const a=owned(b.assignmentId);if(a.enrollment?.status==='pending')fail(409,'Confirm your program schedule before logging.');const w=a.plan.find(w=>w.week===b.week);const s=w?.sessions[b.session];if(!s||s.cancelled)fail(400,'Session not found or removed from calendar.');const skippedWorkout=b.status==='skipped';if(!skippedWorkout&&(!num(b.readiness,1,5)||!Number.isInteger(b.readiness)||typeof b.pain!=='boolean'||!str(b.notes||'',0,2000)))fail(400,'Check workout feedback.');
        if(b.prescriptionRevision!==undefined&&b.prescriptionRevision!==(s.prescriptionRevision||0))fail(409,'Coach updated this workout while it was open. Your entered results are still on this screen; copy them before refreshing.');
        if(!Array.isArray(b.exercises)||b.exercises.length!==s.exercises.length)fail(400,'Log every exercise.');
        const blockResults=checked(()=>recordBlockScores(skippedWorkout?(s.blocks||[]).filter(x=>x.type==='Metcon').map(x=>({blockId:x.id,skipped:true,skipReason:b.skipReason})):b.blockResults,s.blocks));
        if(skippedWorkout&&typeof(b.skipReason??'')!=='string'||(b.skipReason||'').length>500)fail(400,'Skip reason must be 500 characters or fewer.');
        const recorded=checked(()=>recordPerformance(skippedWorkout?s.exercises.map(e=>({exerciseId:e.exerciseId,skipped:true,skipReason:b.skipReason})):b.exercises,s.exercises,all('exercise')));
        if(all('log').some(l=>l.assignmentId===a.id&&l.week===b.week&&l.session===b.session))fail(409,'This session is already recorded.');
        const finalBlocks=skippedWorkout?(s.blocks||[]).filter(x=>x.type==='Metcon').map(x=>({blockId:x.id,skipped:true,skipReason:b.skipReason||''})):blockResults;
        const skippedCount=recorded.filter(e=>e.status==='skipped').length+finalBlocks.filter(e=>e.status==='skipped').length,totalCount=recorded.length+finalBlocks.length,partialCount=recorded.filter(e=>e.status==='partially_completed').length+finalBlocks.filter(e=>e.status==='partially_completed').length;
        const status=skippedWorkout||totalCount>0&&skippedCount===totalCount?'skipped':skippedCount||partialCount?'partially_completed':'completed';
        const assessmentBenchmark=all('benchmark').find(definition=>definition.programId===a.programId&&definition.week===b.week&&definition.sessionIndex===b.session&&definition.scoring?.protocol==='six_minute_max_run');
        if(b.assessmentMaximal!==undefined&&(typeof b.assessmentMaximal!=='boolean'||!assessmentBenchmark))fail(400,'Maximal-effort confirmation is only available for a saved six-minute running benchmark.');
        const assessmentFields=assessmentBenchmark?{benchmarkId:assessmentBenchmark.id,benchmarkSignature:benchmarkAttemptSignature(recorded,s.blocks||[],assessmentBenchmark.scoring),assessmentMaximal:b.assessmentMaximal===true}:{};
        result=receipt.commit(()=>saveLogAndRefresh({id:randomUUID(),athleteId:u.id,assignmentId:a.id,week:b.week,session:b.session,sessionName:s.name,createdAt:new Date().toISOString(),prescriptionRevision:s.prescriptionRevision||0,status,...assessmentFields,...(skippedWorkout?{skipReason:b.skipReason||''}:{readiness:b.readiness,pain:b.pain,notes:b.notes||''}),exercises:recorded,...(sessionRecommendations(a,b.week,b.session,all('log'),all('exercise'),undefined,all('strengthPR')).some(rows=>rows.length)?{recommendations:sessionRecommendations(a,b.week,b.session,all('log'),all('exercise'),undefined,all('strengthPR')),recommendationsComputedAt:new Date().toISOString()}:{}),...(s.blocks?{blocks:structuredClone(s.blocks)}:{}),...(finalBlocks.length?{blockResults:finalBlocks}:{})},u.id));}
      }
      else if(route==='/api/log-edit'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Sign in as an athlete to edit workout results.');
        const existing=get('log',b.id);if(!existing)fail(404,'Workout history was not found.');if(existing.athleteId!==u.id)fail(403,'Access denied.');
        const currentVersion=existing.updatedAt||existing.createdAt;if(b.expectedUpdatedAt!==currentVersion)fail(409,'This workout was edited elsewhere. Refresh history before making another correction.');
        if(typeof(b.skipReason??'')!=='string'||(b.skipReason||'').length>500)fail(400,'Skip reason must be 500 characters or fewer.');
        let recorded,blockResults=[],status;
        if(existing.source==='tracker'){
          if(existing.assignmentId)fail(400,'Workout source is invalid.');
          const updated=checked(()=>prepareTrackerWorkout({sessionName:existing.sessionName,workoutDate:existing.workoutDate,notes:b.notes??existing.notes??'',exercises:b.exercises,blockResults:b.blockResults},all('exercise'),existing.workoutDate));
          if(JSON.stringify(updated.exercises.map(e=>e.target||null))!==JSON.stringify(existing.exercises.map(e=>e.target||null)))fail(409,'Saved prescriptions cannot be changed while correcting actual workout results.');if((updated.blockResults||[]).some(row=>{const original=(existing.blocks||[]).find(block=>block.id===row.blockId&&block.type==='Metcon')?.metcon||(existing.blockResults||[]).find(block=>block.blockId===row.blockId)?.metcon;return !original||JSON.stringify(row.metcon)!==JSON.stringify(original);}))fail(409,'Saved Metcon prescriptions cannot be changed while correcting results.');recorded=updated.exercises;blockResults=updated.blockResults||[];status=b.status==='skipped'?'skipped':updated.status;
        }else{
          const a=owned(existing.assignmentId);if(a.athleteId!==u.id)fail(403,'Access denied.');
          const targets=(existing.exercises||[]).map(e=>e.target);if(targets.some(t=>!t))fail(409,'This older workout does not have a complete prescription snapshot and cannot be safely edited.');
          const skipped=b.status==='skipped';recorded=checked(()=>recordPerformance(skipped?targets.map(t=>({exerciseId:t.exerciseId,skipped:true,skipReason:b.skipReason})):b.exercises,targets,all('exercise')));
          blockResults=checked(()=>recordBlockScores(skipped?(existing.blocks||[]).filter(x=>x.type==='Metcon').map(x=>({blockId:x.id,skipped:true,skipReason:b.skipReason})):b.blockResults,existing.blocks||[]));
          const skippedCount=recorded.filter(e=>e.status==='skipped').length+blockResults.filter(e=>e.status==='skipped').length,totalCount=recorded.length+blockResults.length,partialCount=recorded.filter(e=>e.status==='partially_completed').length+blockResults.filter(e=>e.status==='partially_completed').length;
          status=skipped||totalCount>0&&skippedCount===totalCount?'skipped':skippedCount||partialCount?'partially_completed':'completed';
        }
        const now=new Date().toISOString(),snapshot={exercises:existing.exercises,blockResults:existing.blockResults||[],status:existing.status||'completed',notes:existing.notes||'',readiness:existing.readiness,pain:existing.pain,updatedAt:existing.updatedAt||null};
        if(b.assessmentMaximal!==undefined&&(typeof b.assessmentMaximal!=='boolean'||!existing.assessmentProtocol&&!(existing.benchmarkId&&get('benchmark',existing.benchmarkId)?.scoring?.protocol==='six_minute_max_run')))fail(400,'Maximal effort confirmation requires a six-minute running assessment.');
        const next={...existing,...(b.assessmentMaximal!==undefined?{assessmentMaximal:b.assessmentMaximal}:{}),status,exercises:recorded,blockResults,...(existing.blocks?{blocks:existing.blocks}:{}),...(existing.source==='tracker'?{notes:b.notes??existing.notes??''}:{...(status==='skipped'?{skipReason:b.skipReason||''}:{readiness:b.readiness??existing.readiness,pain:b.pain??existing.pain,notes:b.notes??existing.notes??''})}),editHistory:[...(existing.editHistory||[]),{editedAt:now,editorId:u.id,previous:snapshot}].slice(-50),updatedAt:now};
        result=saveLogAndRefresh(next,u.id);
      }
      else if(route==='/api/recommendations'&&req.method==='GET'){coach();const a=owned(url.searchParams.get('id'));const week=a.plan.find(w=>w.week===Number(url.searchParams.get('week')));if(!week)fail(400,'Week not found.');result=week.sessions.flatMap((s,si)=>s.exercises.map((e,ei)=>{const history=all('log').filter(l=>l.athleteId===a.athleteId&&l.source!=='tracker').sort((x,y)=>x.createdAt.localeCompare(y.createdAt)).flatMap(l=>l.exercises.filter(x=>x.exerciseId===e.exerciseId).map(x=>({...x,pain:l.pain,readiness:l.readiness})));return {session:si,index:ei,exerciseId:e.exerciseId,current:e.load,...recommend(e,history)};}));}
      else if(route==='/api/account'&&req.method==='DELETE'){if(u.role!=='athlete')fail(400,'Coach account removal requires administrator maintenance.');db.prepare('DELETE FROM records WHERE owner=?').run(u.id);db.prepare('DELETE FROM users WHERE id=?').run(u.id);res.setHeader('Set-Cookie','ihs_session=; HttpOnly; Path=/; Max-Age=0');result={ok:true};}
      else fail(404,'Not found.');
    }
    res.end(JSON.stringify(route==='/api/data'?withAthleteRecommendations(normalizeData(result)):result));
  }catch(error){if(res.destroyed)return;res.writeHead(error.status||500);res.end(JSON.stringify({error:error.status?error.message:'Something went wrong. Please try again.',...(error.findings?{findings:error.findings}:{}),...(error instanceof GenerationError?{code:error.code,...(error.diagnostics?{diagnostics:error.diagnostics}:{})}:{})}));if(!error.status)console.error(error);}
});
// The explicit development mode overrides stale HOST/PORT values from local env files.
// Production and ordinary local development retain their existing bind defaults.
const port=lanPreview?4173:Number(process.env.PORT||4173);
const host=lanPreview?'0.0.0.0':process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Iron Heart Strength: http://${host}:${port} (${demo?'local demo':'live'})`));
