// Athlete dates are separate from immutable coach prescriptions and log identity.
export const MODALITIES=['strength','hypertrophy','running','metcon','hybrid'];
export const MODALITY_NAMES={strength:'Strength',hypertrophy:'Hypertrophy / Bodybuilding',running:'Running',metcon:'Metcon / Conditioning',hybrid:'Hybrid'};
export const TRAINING_DAYS=[1,2,3,4,5,6,0];
export const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const date=d=>new Date(d+'T12:00:00Z');
const key=d=>d.toISOString().slice(0,10);
export function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(+date(d))&&key(date(d))===d;}
const add=(d,n)=>{const v=date(d);v.setUTCDate(v.getUTCDate()+n);return key(v);};
export const sessionKey=(week,index)=>`${week}:${index}`;
export function modalityOf(p){if(MODALITIES.includes(p.modality))return p.modality;const sessions=p.plan?.flatMap(w=>w.sessions)||p.sessions||[];const types=new Set(sessions.flatMap(s=>[...(s.blocks||[]).map(b=>b.type==='Metcon'?'metcon':b.type==='Cardio'?'cardio':'strength'),...(s.exercises||[]).map(e=>e.trackingType==='running'?'running':e.trackingType&&e.trackingType!=='strength'?'cardio':'strength')]));if(types.size>1)return 'hybrid';return types.has('running')?'running':types.has('metcon')||types.has('cardio')?'metcon':'strength';}
export function discoverable(p,athleteId){return p.discover?.enabled===true&&(!p.discover.athleteIds?.length||p.discover.athleteIds.includes(athleteId));}
export function validateProgramMetadata(p){
 if(p.modality!==undefined&&!MODALITIES.includes(p.modality))throw Error('Choose a supported program modality.');
 if(p.level!==undefined&&(typeof p.level!=='string'||p.level.length>100))throw Error('Invalid program level.');
 if(p.discover!==undefined&&(typeof p.discover?.enabled!=='boolean'||!Array.isArray(p.discover.athleteIds)||p.discover.athleteIds.length>100||p.discover.athleteIds.some(id=>typeof id!=='string'||!id||id.length>200)))throw Error('Choose valid Discover availability.');
 for(const s of p.plan?.flatMap(w=>w.sessions)||p.sessions||[]){if(s.scheduleRole!==undefined&&(typeof s.scheduleRole!=='string'||s.scheduleRole.length>80))throw Error('Invalid session schedule role.');if(s.minRecoveryHours!==undefined&&(!Number.isFinite(s.minRecoveryHours)||s.minRecoveryHours<0||s.minRecoveryHours>168))throw Error('Recovery must be 0–168 hours.');}
 return p;
}
export function scheduledDate(a,week,index){const explicit=a.schedule?.dates?.[sessionKey(week,index)];if(explicit)return explicit;const s=a.plan.find(w=>w.week===week)?.sessions[index];if(!s)return null;const start=date(a.startDate),offset=(start.getUTCDay()+6)%7;return add(a.startDate,-offset+(week-1)*7+(s.day+6)%7);}
export function weekdayDate(a,week,index,day){const current=scheduledDate(a,week,index);return add(current,-((date(current).getUTCDay()+6)%7)+(day+6)%7);}
export function scheduleRows(a,dates=a.schedule?.dates){return a.plan.flatMap(w=>w.sessions.map((s,index)=>({week:w.week,index,session:s,key:sessionKey(w.week,index),date:dates?.[sessionKey(w.week,index)]||scheduledDate(a,w.week,index)}))).filter(r=>!r.session.cancelled);}
export function setupRoles(p){const sessions=p.plan?.flatMap(w=>w.sessions)||p.sessions||[];return [...new Set(sessions.map(s=>s.scheduleRole).filter(Boolean))];}
export function reviewWeek(p,schedule,week){return Array.from({length:7},(_,i)=>{const d=add(schedule.startDate,(week-1)*7+i);const entry=Object.entries(schedule.dates).find(([k,value])=>k.startsWith(`${week}:`)&&value===d);return {date:d,day:date(d).getUTCDay(),session:entry?(p.plan?.[week-1]?.sessions||p.sessions)[+entry[0].split(':')[1]]:null};});}
export function proposeSchedule(a,input){
 if(!validDate(input.startDate))throw Error('Choose a valid start date.');
 const days=input.availableDays;if(!Array.isArray(days)||!days.length||days.length>7||new Set(days).size!==days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose your available training days.');
 const preferences=input.preferences||{};if(typeof preferences!=='object'||Array.isArray(preferences)||Object.keys(preferences).some(k=>!setupRoles(a).includes(k)||!days.includes(preferences[k])))throw Error('Preferences must use a training day and a coach-defined session role.');
 const dates={};let previous=null;
 for(const w of a.plan){const sessions=w.sessions.filter(s=>!s.cancelled);if(sessions.length>days.length)throw Error('Choose enough days for every required session.');let cursor=add(input.startDate,(w.week-1)*7);const end=add(cursor,7);for(let i=0;i<w.sessions.length;i++){const s=w.sessions[i];if(s.cancelled)continue;const desired=preferences[s.scheduleRole];let found=false;while(cursor<end){const gap=previous?(+date(cursor)-+date(previous.date))/3600000:Infinity;const recovery=previous?.session.minRecoveryHours||0;if(days.includes(date(cursor).getUTCDay())&&(desired===undefined||date(cursor).getUTCDay()===desired)&&(!previous||cursor>previous.date)&&gap>=recovery){dates[sessionKey(w.week,i)]=cursor;previous={date:cursor,session:s};cursor=add(cursor,1);found=true;break;}cursor=add(cursor,1);}if(!found)throw Error('These preferences cannot preserve session order and recovery. Choose other days or ask your coach.');}}
 return {version:1,startDate:input.startDate,availableDays:[...days],preferences:{...preferences},dates};
}
export function confirmSchedule(a,input,logs=[]){if(logs.some(l=>l.assignmentId===a.id))throw Error('Training has started. Move individual workouts instead of restarting your schedule.');return {...structuredClone(a),startDate:input.startDate,schedule:proposeSchedule(a,input),enrollment:{...(a.enrollment||{}),status:'active'}};}
export function moveWorkout(a,{week,session,targetDate},logs=[]){
 if(!validDate(targetDate)||targetDate<a.startDate)throw Error('Choose a date on or after the program start.');
 const rows=scheduleRows(a),at=rows.findIndex(r=>r.week===week&&r.index===session);if(at<0)throw Error('Session not found.');
 if(logs.some(l=>l.assignmentId===a.id&&l.week===week&&l.session===session))throw Error('Completed workouts stay in history. Move an upcoming workout.');
 const dates=Object.fromEntries(rows.map(r=>[r.key,r.date]));dates[rows[at].key]=targetDate;
 for(let i=0;i<rows.length;i++){const current=dates[rows[i].key],prev=i?dates[rows[i-1].key]:null;if(prev&&current<=prev)throw Error('This date conflicts with another session or changes coach-defined order.');if(prev&&(+date(current)-+date(prev))/3600000<(rows[i-1].session.minRecoveryHours||0))throw Error('This date does not meet the coach-defined recovery requirement.');}
 return {...structuredClone(a),schedule:{...(a.schedule||{version:1}),dates}};
}
export function programProgress(a,logs,today){const rows=scheduleRows(a).filter(r=>r.date>=a.startDate);const complete=rows.filter(r=>logs.some(l=>l.assignmentId===a.id&&l.week===r.week&&l.session===r.index)).length;const upcoming=rows.find(r=>r.date>=today&&!logs.some(l=>l.assignmentId===a.id&&l.week===r.week&&l.session===r.index));return {total:rows.length,complete,percent:rows.length?Math.round(complete/rows.length*100):0,week:upcoming?.week||a.weeks};}
