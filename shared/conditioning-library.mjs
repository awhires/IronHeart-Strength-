const rows=[['sit-ups','Sit-ups','Core','Bodyweight','strength'],['jump-rope','Jump Rope','Cardio','Jump rope','cardio'],['double-unders','Double Unders','Cardio','Jump rope','cardio'],['wall-balls','Wall Balls','Full body','Medicine ball','strength'],['burpees','Burpees','Full body','Bodyweight','strength'],['cycling','Cycling','Cardio','Bike','cycling'],['stationary-bike','Stationary Bike','Cardio','Bike','cycling'],['swimming','Swimming','Cardio','Pool','swimming']];
export const conditioningExercises=rows.map(([id,name,region,equipment,trackingType])=>({id,name,region,equipment,trackingType,pattern:region==='Cardio'?'Cardio':'Conditioning',cues:'Record the prescribed movement standard and any scaling in workout notes.',video:''}));
const normal=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function missingConditioningExercises(existing){return conditioningExercises.filter(e=>!existing.some(x=>x.id===e.id||normal(x.name)===normal(e.name))).map(e=>({...e}));}

export const singleUnders={id:'single-unders',name:'Single Unders',region:'Cardio',equipment:'Jump rope',trackingType:'cardio',pattern:'Cardio',cues:'One rope rotation per jump. Record your actual rep scheme when scaling.',video:''};
export const missingSingleUnders=existing=>existing.some(e=>e.id===singleUnders.id||normal(e.name)===normal(singleUnders.name))?[]:[{...singleUnders}];
