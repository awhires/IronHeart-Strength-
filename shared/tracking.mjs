// Journal measurement profiles are additive. Old programmed prescriptions stay untouched.
export const MODIFIERS=['pause','hang','high hang','low hang','above knee','below knee','blocks','tempo','complex'];
const rows=[
 ['clean','Clean','Olympic Weightlifting','Barbell','strength'],['power-clean','Power Clean','Olympic Weightlifting','Barbell','strength'],
 ['snatch','Snatch','Olympic Weightlifting','Barbell','strength'],['power-snatch','Power Snatch','Olympic Weightlifting','Barbell','strength'],
 ['front-squat','Front Squat','Olympic Weightlifting','Barbell','strength'],['overhead-squat','Overhead Squat','Olympic Weightlifting','Barbell','strength'],
 ['box-clean','Box Clean','Olympic Weightlifting','Barbell','strength'],['box-power-clean','Box Power Clean','Olympic Weightlifting','Barbell','strength'],
 ['box-snatch','Box Snatch','Olympic Weightlifting','Barbell','strength'],['box-power-snatch','Box Power Snatch','Olympic Weightlifting','Barbell','strength'],
 ['pushup-plank','Push-Up Plank','Core','Bodyweight','timed'],['weighted-plank','Weighted Plank','Core','Plate','loadedTimed'],
 ['suitcase-db','Suitcase Carry — Dumbbell','Core','Dumbbell','carry'],['suitcase-kb','Suitcase Carry — Kettlebell','Core','Kettlebell','carry'],
 ['farmer-db','Farmer Carry — Dumbbell','Core','Dumbbell','carry'],['farmer-kb','Farmer Carry — Kettlebell','Core','Kettlebell','carry'],
 ['side-bend','Side Bend','Core','Dumbbell','strength'],['hanging-leg-raise','Hanging Leg Raise','Core','Bodyweight','strength'],
 ['hanging-knee-raise','Hanging Knee Raise','Core','Bodyweight','strength'],['l-sit','L-Sit','Core','Bodyweight','timed'],
 ['back-rack-hold','Back Rack Barbell Hold','Isometric','Barbell','loadedTimed'],
 ['treadmill','Treadmill','Cardio','Treadmill','treadmill'],['stair-stepper','Stair Stepper','Cardio','Stair Stepper','stairs'],
 ['skierg','SkiErg','Cardio','SkiErg','erg'],['rowerg','RowErg','Cardio','RowErg','erg'],['outdoor-running','Outdoor Running','Cardio','None','running']
];
export const trackingExercises=rows.map(([id,name,region,equipment,trackingType])=>({id,name,region,equipment,trackingType,pattern:region==='Cardio'?'Cardio':region==='Olympic Weightlifting'?'Olympic':region==='Isometric'?'Hold':'Core',cues:'Use a controlled technique and record the work actually completed.',video:''}));
const normalize=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function missingTrackingExercises(library){return trackingExercises.filter(e=>!library.some(x=>x.id===e.id||normalize(x.name)===normalize(e.name)));}
export function trackingProfile(e){return e?.trackingType||trackingExercises.find(x=>x.id===e?.id||normalize(x.name)===normalize(e?.name))?.trackingType||(e?.id==='plank'?'timed':'strength');}
export function exerciseCategory(e){return trackingExercises.find(x=>x.id===e?.id||normalize(x.name)===normalize(e?.name))?.region||e.region;}
export const FIELDS={strength:['reps','load','rpe','rir'],timed:['durationSeconds'],loadedTimed:['load','durationSeconds'],carry:['load','distance','durationSeconds'],treadmill:['distance','durationSeconds','speedMph','incline'],stairs:['level','durationSeconds'],erg:['distance','durationSeconds','paceSeconds'],running:['distance','durationSeconds','paceSeconds']};
export const DISTANCE_METERS={mi:1609.344,km:1000,m:1};
export function convertDistance(value,from,to){if(!Number.isFinite(value)||!DISTANCE_METERS[from]||!DISTANCE_METERS[to])throw Error('Invalid distance or unit.');return value*DISTANCE_METERS[from]/DISTANCE_METERS[to];}
export function expandBlocks(blocks){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>30)throw Error('Add 1–30 set blocks.');
 let count=0;for(const b of blocks){if(!Number.isInteger(b.count)||b.count<1||(count+=b.count)>30)throw Error('Use 1–30 completed sets per exercise.');}
 return blocks.flatMap(({count,...set},blockIndex)=>Array.from({length:count},()=>({...structuredClone(set),blockIndex})));
}
export function complexLabel(parts,library){return parts.map(p=>`${p.reps} ${p.modifier?p.modifier+' ':''}${library.find(e=>e.id===p.exerciseId)?.name||p.exerciseName||'Unmatched movement'}`).join(' + ');}
const aliases={BP:'bench',PC:'power-clean',BS:'squat',FS:'front-squat',OHS:'overhead-squat',RDL:'rdl'};
export function matchExercise(name,library){const exact=library.filter(e=>normalize(e.name)===normalize(name));if(exact.length===1)return exact[0];if(exact.length>1)return null;return library.find(e=>e.id===aliases[String(name).trim().toUpperCase()])||null;}
export function setSummary(s,type='strength'){
 const parts=[];if(s.reps!=null)parts.push(`${s.reps} reps`);if(s.load!=null)parts.push(`${s.load} ${s.loadUnit==='kg'?'kg':'lb'}`);
 if(s.durationSeconds!=null)parts.push(`${s.durationSeconds} sec`);if(s.distance!=null)parts.push(`${s.distance} ${s.distanceUnit}`);
 if(s.speedMph!=null)parts.push(`${s.speedMph} mph`);if(s.incline!=null)parts.push(`${s.incline}% incline`);if(s.level!=null)parts.push(`level ${s.level}`);
 if(s.paceSeconds!=null)parts.push(`${Math.floor(Math.round(s.paceSeconds)/60)}:${String(Math.round(s.paceSeconds)%60).padStart(2,'0')} / ${type==='erg'?'500 m':s.distanceUnit||'mi'}`);
 if(s.rpe!=null)parts.push(`RPE ${s.rpe}`);if(s.rir!=null)parts.push(`RIR ${s.rir}`);return parts.join(' · ')||'No metrics recorded';
}
