// Date-only schedule keys are advanced at UTC noon so DST and year boundaries
// cannot move an athlete's workout to a different local calendar day.
export function addCalendarDays(key,days){
 const date=new Date(`${key}T12:00:00Z`);
 if(!Number.isFinite(date.getTime()))throw Error('Invalid calendar date.');
 date.setUTCDate(date.getUTCDate()+days);
 return date.toISOString().slice(0,10);
}
export function trainingWeekDays(selectedKey){
 const date=new Date(`${selectedKey}T12:00:00Z`);
 if(!Number.isFinite(date.getTime()))throw Error('Invalid calendar date.');
 const monday=addCalendarDays(selectedKey,-((date.getUTCDay()+6)%7));
 return Array.from({length:7},(_,index)=>addCalendarDays(monday,index));
}
export function trainingDayStatus(events,key,todayKey){
 const rows=events.filter(event=>event.key===key);
 if(rows.some(event=>event.log&&event.log.status==='skipped'))return 'skipped';
 if(rows.some(event=>event.log))return 'completed';
 if(events.some(event=>event.scheduledKey===key&&event.key!==key&&event.log))return 'scheduled';
 if(rows.length||events.some(event=>event.scheduledKey===key))return key<todayKey?'missed':'scheduled';
 return 'rest';
}
