import {prepareJournalEntry} from './journal-measurements.mjs';
import {inPounds} from './ai/contract.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const text=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
export const localDateString=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const validWorkoutDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
// The caller owns identity, ownership and creation time. No program/target is invented.
export function prepareTrackerWorkout(input,library,today=localDateString()){
  if(!input||Object.keys(input).some(k=>!['sessionName','workoutDate','notes','exercises'].includes(k)))throw Error('Use a workout name, date, notes and exercises.');
  if(!text(input.sessionName,1,200)||!text(input.notes??'',0,2000))throw Error('Enter a workout name and notes up to 2000 characters.');
  const workoutDate=input.workoutDate||today;
  if(!validWorkoutDate(workoutDate))throw Error('Choose a valid workout date.');
  if(!Array.isArray(input.exercises)||!input.exercises.length||input.exercises.length>15)throw Error('Add 1–15 exercises.');
  const exercises=input.exercises.map(entry=>{
    const exercise=library.find(e=>e.id===entry?.exerciseId);
    if(!exercise)throw Error('Choose an exercise from the library.');
    return prepareJournalEntry(entry,exercise,library);
  });
  return {source:'tracker',sessionName:input.sessionName.trim(),workoutDate,notes:input.notes??'',exercises};
}
