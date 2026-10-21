const scoreRules = [[/\brounds?\s+for\s+time\b/i,'Rounds for Time'],[/\bamrap\b/i,'AMRAP'],[/\bemom\b/i,'EMOM'],[/\bchipper\b/i,'Chipper'],[/\bintervals?\b/i,'Intervals'],[/\bfor\s+time\b/i,'For Time']];
const normalize = text => text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function interpretMetconWhiteboard(text, library) {
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw Error('Enter a workout whiteboard (up to 5,000 characters).');
  const lines = text.split(/\r?\n/).map(x=>x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  const findExercise = line => [...library].sort((a,b)=>b.name.length-a.name.length).find(e=>{const n=normalize(e.name),v=` ${normalize(line)} `;return v.includes(` ${n} `);});
  const schemeLine = lines.find(x=>/^\d+(?:\s*[-–]\s*\d+)+$/.test(x));
  const scoreLine = lines.find(x=>scoreRules.some(([re])=>re.test(x)));
  const scoreType = scoreRules.find(([re])=>re.test(scoreLine||''))?.[1]||'For Time';
  const durationLine = text.match(/\b(?:amrap|emom)\s+(\d+)\s*(?:m|min|minutes?)?\b/i);
  const intervalLine = text.match(/\b(?:every\s+)?(\d+)\s*(?:s|sec|seconds?)\b/i);
  const capLine = text.match(/\b(\d+)\s*(?:min|minute)s?\s*cap\b/i);
  const nameLine = lines.find(x=>x!==schemeLine&&x!==scoreLine&&!/^\d/.test(x)&&!findExercise(x)&&!/\b\d+\s*(?:min|minute)\s*cap\b/i.test(x)&&!(/\b(?:every\s+)?\d+\s*(?:s|sec|seconds?)\b/i.test(x)));
  const movements=[], unresolved=[];
  for(const line of lines){
    if(line===schemeLine||line===nameLine||scoreRules.some(([re])=>re.test(line))||/\b\d+\s*(?:min|minute)s?\s*cap\b/i.test(line)||/\b(?:every\s+)?\d+\s*(?:s|sec|seconds?)\b/i.test(line))continue;
    const exercise=findExercise(line); if(!exercise){unresolved.push(line);continue;}
    const movement={exerciseId:exercise.id,exerciseName:exercise.name,loadUnit:'lbs',distanceUnit:'m'};
    const load=line.match(/(?:@\s*)?(\d+(?:\.\d+)?)\s*(lb|lbs|#|kg)(?![a-z])/i); if(load){movement.load=Number(load[1]);movement.loadUnit=load[2].toLowerCase()==='kg'?'kg':'lbs';}
    const distance=line.match(/\b(\d+(?:\.\d+)?)\s*(m|km|mi|yd)\b/i); if(distance){movement.distance=Number(distance[1]);movement.distanceUnit=distance[2].toLowerCase();}
    const calories=line.match(/\b(\d+(?:\.\d+)?)\s*(?:cal|calories)\b/i); if(calories)movement.calories=Number(calories[1]);
    const reps=line.match(/^\s*(\d+)\s+(.+)$/); if(reps&&!distance&&!calories)movement.reps=Number(reps[1]);
    movements.push(movement);
  }
  const detailsFor=line=>{
    const rep=line.match(/^\s*(\d+)\s+(.+)$/),load=line.match(/(?:@\s*)?(\d+(?:\.\d+)?)\s*(lb|lbs|#|kg)(?![a-z])/i),distance=line.match(/\b(\d+(?:\.\d+)?)\s*(m|km|mi|yd)\b/i),calories=line.match(/\b(\d+(?:\.\d+)?)\s*(?:cal|calories)\b/i);
    return {...(rep&&!distance&&!calories?{reps:Number(rep[1])}:{}),...(load?{load:Number(load[1]),loadUnit:load[2].toLowerCase()==='kg'?'kg':'lbs'}:{}),...(distance?{distance:Number(distance[1]),distanceUnit:distance[2].toLowerCase()}:{}),...(calories?{calories:Number(calories[1])}:{})};
  };
  return {metcon:{name:nameLine||'Custom MetCon',scoreType,repScheme:schemeLine?schemeLine.split(/\s*[-–]\s*/).map(Number):[],movements,notes:'',...(durationLine?{durationSeconds:Number(durationLine[1])*60}:{}),...(scoreType==='EMOM'&&intervalLine?{intervalSeconds:Number(intervalLine[1])}:{}),...(capLine?{timeCapSeconds:Number(capLine[1])*60}:{})},unresolved,unmatchedDetails:unresolved.map(line=>({line,...detailsFor(line)}))};
}
