import {discoverable,confirmSchedule,proposeSchedule,moveWorkout,validDate,weekdayDate} from '../shared/program-schedule.mjs';
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
import {GenerationError} from './ai/openai.mjs';
const draftSaves=createDraftSaveService(randomUUID);
const checked=fn=>{try{return fn();}catch(e){throw Object.assign(e,{status:400});}};

const production=process.argv.includes('--production');
const lanPreview=process.argv.includes('--lan-preview');
if(production&&lanPreview)throw Error('LAN preview cannot run in production.');
if(process.env.AI_TEST_FIXTURE&&!process.argv.includes('--test-server'))throw Error('AI_TEST_FIXTURE is allowed only with --test-server.');
const testProvider=process.env.AI_TEST_FIXTURE?{name:'test-fixture',model:'fixture',generateProgramDraft:async()=>JSON.parse(await readFile(process.env.AI_TEST_FIXTURE,'utf8'))}:undefined;
const generation=createGenerationService({config:generationConfig(),provider:testProvider,production});
const scanner=createScanService();
const demo=process.env.DEMO_MODE === 'true' || (!production && process.env.DEMO_MODE !== 'false');
if (production && demo) throw new Error('Demo mode cannot run in production. Use a separate production database.');
const store=openStore(process.env.DB_PATH || `./data/${demo?'demo':'iron-heart'}.sqlite`,demo);
const {db,all,get,put,addUser}=store;
const workoutReceipt=workoutReceipts(store);
if (!demo && db.prepare("SELECT id FROM users WHERE email LIKE '%@ironheart.demo' LIMIT 1").get()) throw new Error('Demo database cannot be used in production.');
const publicUser = u => ({id:u.id,email:u.email,name:u.name,role:u.role,sport:u.sport});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const str=(x,min=1,max=200)=>typeof x==='string' && x.trim().length>=min && x.length<=max;
const num=(x,min,max)=>Number.isFinite(x) && x>=min && x<=max;
function assign(program,athleteId,startDate) {
  return {id:randomUUID(),athleteId,programId:program.id,name:program.name,startDate,weeks:program.weeks,goal:program.goal,coachNotes:program.coachNotes,progressionInstructions:program.progressionInstructions,aiProvenance:program.aiProvenance,progressionOptions:program.progressionOptions,
    description:program.description,modality:program.modality,level:program.level,plan:program.plan?structuredClone(program.plan):Array.from({length:program.weeks},(_,i)=>({week:i+1,sessions:program.sessions.map(s=>({...s,exercises:s.exercises.map(e=>periodize(e,i+1,program.weeks))}))}))};
}
if(demo&&!db.prepare("SELECT value FROM metadata WHERE key='demo-assigned'").get()){
  const date=new Date();date.setDate(date.getDate()-((date.getDay()+6)%7));
  const dateOnly=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if(!all('assignment').length)for(const id of ['jordan','maya','marcus','sofia'])put('assignment',assign(get('program','strength-foundations'),id,dateOnly),id);
  db.prepare('INSERT INTO metadata VALUES(?,?)').run('demo-assigned','yes');
}
let vite;
if(!production&&!process.argv.includes('--test-server')){const {createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/android/**','**/data/**','**/output/**','**/tmp/**']}},appType:'spa'});}
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
    if(origin&&allowed.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');}
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
      else if(route==='/api/data'&&req.method==='GET')result={user:publicUser(u),demo,exercises:all('exercise'),programs:u.role==='coach'?all('program'):[],discover:u.role==='athlete'?all('program').filter(p=>discoverable(p,u.id)).map(({discover,...p})=>p):[],athletes:u.role==='coach'?db.prepare("SELECT id,name,email,role,sport FROM users WHERE role='athlete'").all():[],assignments:all('assignment').filter(a=>u.role==='coach'||a.athleteId===u.id),logs:all('log').filter(l=>u.role==='coach'||l.athleteId===u.id)};
      else if(route==='/api/enrollment-preview'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Athlete access required.');let a;if(b.assignmentId)a=owned(b.assignmentId);else{const p=get('program',b.programId);if(!p||!discoverable(p,u.id))fail(404,'Program unavailable.');a=assign(p,u.id,b.startDate);}result=checked(()=>proposeSchedule(a,b));
      }
      else if(route==='/api/enroll'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Athlete access required.');let a;if(b.assignmentId)a=owned(b.assignmentId);else{const p=get('program',b.programId);if(!p||!discoverable(p,u.id))fail(404,'Program unavailable.');const existing=all('assignment').find(x=>x.athleteId===u.id&&x.programId===p.id);if(existing)fail(409,'This program is already in My Programs. Open that assignment.');a={...assign(p,u.id,b.startDate),enrollment:{source:'discover',status:'pending'}};}result=put('assignment',checked(()=>confirmSchedule(a,b,all('log'))),u.id);
      }
      else if(route==='/api/move-workout'&&req.method==='POST'){const a=owned(b.id);result=put('assignment',checked(()=>moveWorkout(a,b,all('log'))),a.athleteId);}
      else if(route==='/api/programs'&&req.method==='POST'){coach();const prepared=checked(()=>prepareProgram(b,all('exercise')));const id=b.id||randomUUID();if(b.id&&!get('program',b.id))fail(404,'Template not found.');result=put('program',{...prepared,id});}
      else if(route==='/api/ai/workout-scan'&&req.method==='POST'){if(u.role!=='athlete')fail(403,'Athlete access required.');limit(req);result=await scanner.scan(b,{userId:u.id,library:all('exercise')});}
      else if(route==='/api/ai/status'&&req.method==='GET'){coach();result=generation.status();}
      else if(route==='/api/ai/program-draft'&&req.method==='POST'){
        coach();const library=all('exercise');const input=validateGenerationInput(b,library);
        const athlete=input.athleteId?db.prepare("SELECT id,sport FROM users WHERE id=? AND role='athlete'").get(input.athleteId):null;
        result=await generation.generateProgramDraft(input,{coachId:u.id,library,athlete});
      }
      else if(route==='/api/ai/approve'&&req.method==='POST'){coach();result=checked(()=>draftSaves.approve(b,all('exercise'),u.id));}
      else if(route==='/api/ai/programs'&&req.method==='POST'){coach();result=checked(()=>draftSaves.save(b,all('exercise'),u.id,p=>put('program',prepareProgram(p,all('exercise')))));}
      else if(route==='/api/delete'&&req.method==='POST'){
        if(b.kind==='athlete'){coach();if(!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.id))fail(404,'Athlete not found.');db.prepare('DELETE FROM records WHERE owner=?').run(b.id);db.prepare('DELETE FROM users WHERE id=?').run(b.id);result={ok:true};}
        else {
        if(!['program','assignment','exercise','log'].includes(b.kind))fail(400,'Invalid record type.');const record=get(b.kind,b.id);if(!record)fail(404,'Record not found.');
        if(b.kind==='log'){if(u.role!=='coach'&&record.athleteId!==u.id)fail(403,'Access denied.');}
        else coach();
        if(b.kind==='exercise'&&[...all('program'),...all('assignment'),...all('log')].some(r=>referencesExercise(r,b.id)))fail(409,'This exercise is in use. Remove it from programs and assignments first; exercises in workout history must be kept.');
        db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(b.kind,b.id);result={ok:true};
        }
      }
      else if(route==='/api/session-status'&&req.method==='POST'){coach();const a=owned(b.id);const s=a.plan.find(w=>w.week===b.week)?.sessions[b.session];if(!s||typeof b.cancelled!=='boolean')fail(400,'Invalid session.');s.cancelled=b.cancelled;result=put('assignment',a,a.athleteId);}
      else if(route==='/api/reschedule'&&req.method==='POST'){coach();const a=owned(b.id);const w=a.plan.find(w=>w.week===b.week);if(!w?.sessions[b.session]||!Number.isInteger(b.day)||!num(b.day,0,6))fail(400,'Choose a valid weekday.');if(a.schedule)result=put('assignment',checked(()=>moveWorkout(a,{week:b.week,session:b.session,targetDate:weekdayDate(a,b.week,b.session,b.day)},all('log'))),a.athleteId);else{w.sessions[b.session].day=b.day;result=put('assignment',a,a.athleteId);}}
      else if(route==='/api/exercises'&&req.method==='POST'){coach();if(!str(b.name)||!str(b.region)||!str(b.equipment)||!str(b.pattern)||!str(b.cues,0,2000)|| (b.video!==''&&!/^[\w-]{11}$/.test(b.video)))fail(400,'Enter exercise details and a valid YouTube video URL or ID.');result=put('exercise',{...(b.id?get('exercise',b.id):{}),id:b.id||randomUUID(),name:b.name,region:b.region,equipment:b.equipment,pattern:b.pattern,cues:b.cues,video:b.video,...(b.trackingType?{trackingType:b.trackingType}:{})});}
      else if(route==='/api/athletes'&&req.method==='POST'){coach();if(!str(b.name)||!str(b.email)||!/^\S+@\S+\.\S+$/.test(b.email)||!str(b.sport))fail(400,'Enter name, email, and sport.');if(db.prepare('SELECT id FROM users WHERE email=?').get(b.email.toLowerCase()))fail(409,'This email already has an account.');const id=randomUUID();addUser(id,b.email,b.name,'athlete',randomBytes(24).toString('hex'),b.sport);const code=randomBytes(24).toString('hex');db.prepare('INSERT INTO invites VALUES(?,?,?)').run(tokenHash(code),id,Date.now()+7*86400000);result={id,code};}
      else if(route==='/api/invite'&&req.method==='POST'){coach();if(!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.athleteId))fail(404,'Athlete not found.');const code=randomBytes(24).toString('hex');db.prepare('DELETE FROM invites WHERE user_id=?').run(b.athleteId);db.prepare('INSERT INTO invites VALUES(?,?,?)').run(tokenHash(code),b.athleteId,Date.now()+7*86400000);result={code};}
      else if(route==='/api/assign'&&req.method==='POST'){coach();const p=get('program',b.programId);if(!p||!db.prepare("SELECT id FROM users WHERE id=? AND role='athlete'").get(b.athleteId))fail(400,'Choose an athlete and program.');if(!validDate(b.startDate))fail(400,'Choose a start date.');const a=assign(p,b.athleteId,b.startDate);if(b.requireSetup===true||b.requireSetup==='on')a.enrollment={source:'coach',status:'pending'};result=put('assignment',a,b.athleteId);}
      else if(route==='/api/assignment'&&req.method==='PUT'){coach();const a=owned(b.id);const week=a.plan.find(w=>w.week===b.week);if(!week||!week.sessions[b.session])fail(400,'Session not found.');Object.assign(week.sessions[b.session],checked(()=>prepareSession({...week.sessions[b.session],exercises:b.exercises,...(b.blocks!==undefined?{blocks:b.blocks}:{})},all('exercise'))));result=put('assignment',a,a.athleteId);}
      else if(route==='/api/tracker'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Sign in as an athlete to journal a workout.');
        const receipt=workoutReceipt(u.id,route,b);if(receipt.result)result=receipt.result;else{const workout=checked(()=>prepareTrackerWorkout(receipt.payload,all('exercise')));result=receipt.commit(()=>put('log',{...workout,id:randomUUID(),athleteId:u.id,createdAt:new Date().toISOString()},u.id));}
      }
      else if(route==='/api/log'&&req.method==='POST'){
        if(u.role!=='athlete')fail(403,'Sign in as an athlete to record a workout.');const receipt=workoutReceipt(u.id,route,b);if(receipt.result)result=receipt.result;else{const a=owned(b.assignmentId);if(a.enrollment?.status==='pending')fail(409,'Confirm your program schedule before logging.');const w=a.plan.find(w=>w.week===b.week);const s=w?.sessions[b.session];if(!s||s.cancelled)fail(400,'Session not found or removed from calendar.');if(!num(b.readiness,1,5)||!Number.isInteger(b.readiness)||typeof b.pain!=='boolean'||!str(b.notes||'',0,2000))fail(400,'Check workout feedback.');
        if(!Array.isArray(b.exercises)||b.exercises.length!==s.exercises.length)fail(400,'Log every exercise.');
        const blockResults=checked(()=>recordBlockScores(b.blockResults,s.blocks));
        const recorded=checked(()=>recordPerformance(b.exercises,s.exercises,all('exercise')));
        if(all('log').some(l=>l.assignmentId===a.id&&l.week===b.week&&l.session===b.session))fail(409,'This session is already recorded.');
        result=receipt.commit(()=>put('log',{id:randomUUID(),athleteId:u.id,assignmentId:a.id,week:b.week,session:b.session,sessionName:s.name,createdAt:new Date().toISOString(),readiness:b.readiness,pain:b.pain,notes:b.notes||'',exercises:recorded,...(blockResults.length?{blockResults,blocks:s.blocks}:{})},u.id));}
      }
      else if(route==='/api/recommendations'&&req.method==='GET'){coach();const a=owned(url.searchParams.get('id'));const week=a.plan.find(w=>w.week===Number(url.searchParams.get('week')));if(!week)fail(400,'Week not found.');result=week.sessions.flatMap((s,si)=>s.exercises.map((e,ei)=>{const history=all('log').filter(l=>l.athleteId===a.athleteId&&l.source!=='tracker').sort((x,y)=>x.createdAt.localeCompare(y.createdAt)).flatMap(l=>l.exercises.filter(x=>x.exerciseId===e.exerciseId).map(x=>({...x,pain:l.pain,readiness:l.readiness})));return {session:si,index:ei,exerciseId:e.exerciseId,current:e.load,...recommend(e,history)};}));}
      else if(route==='/api/account'&&req.method==='DELETE'){if(u.role!=='athlete')fail(400,'Coach account removal requires administrator maintenance.');db.prepare('DELETE FROM records WHERE owner=?').run(u.id);db.prepare('DELETE FROM users WHERE id=?').run(u.id);res.setHeader('Set-Cookie','ihs_session=; HttpOnly; Path=/; Max-Age=0');result={ok:true};}
      else fail(404,'Not found.');
    }
    res.end(JSON.stringify(route==='/api/data'?normalizeData(result):result));
  }catch(error){res.writeHead(error.status||500);res.end(JSON.stringify({error:error.status?error.message:'Something went wrong. Please try again.',...(error instanceof GenerationError?{code:error.code}:{})}));if(!error.status)console.error(error);}
});
// The explicit development mode overrides stale HOST/PORT values from local env files.
// Production and ordinary local development retain their existing bind defaults.
const port=lanPreview?4173:Number(process.env.PORT||4173);
const host=lanPreview?'0.0.0.0':process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Iron Heart Strength: http://${host}:${port} (${demo?'local demo':'live'})`));
