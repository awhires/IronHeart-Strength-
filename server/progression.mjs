import {normalizePrescription} from '../shared/prescriptions.mjs';
import {LOAD_MODE, EFFORT_MODE, LOAD_UNIT} from '../shared/ai/contract.mjs';
export function supportsLoadProgression(item){const e=normalizePrescription(item);return !e.setBlocks?.length&&e.loadMode===LOAD_MODE.FIXED&&e.effortMode===EFFORT_MODE.RPE&&e.loadUnit===LOAD_UNIT.LBS&&Number.isFinite(e.load)&&Number.isFinite(e.rpe);}
// Generate a complete, reviewable block from a coach-authored first week.
export function generateBlock(sessions, weeks, options = {}) {
  if(options.method==='westside')return generateWestsideBlock(sessions,weeks,options);
  const {percent=2.5,roundTo=5,setEvery=0,deloadEvery=4}=options;
  if(!Number.isInteger(weeks)||weeks<2||weeks>12||!Number.isFinite(percent)||percent<0||percent>10||![.5,1,2.5,5,10].includes(roundTo)||![0,1,2,3].includes(setEvery)||![0,4,6].includes(deloadEvery))throw new Error('Choose valid progression settings.');
  const original=structuredClone(sessions);
  let loadingSteps=0;
  return Array.from({length:weeks},(_,index)=>{
    const week=index+1;
    if(index===0)return {week,sessions:structuredClone(original)};
    const deload=deloadEvery>0&&week%deloadEvery===0;
    if(!deload)loadingSteps++;
    return {week,sessions:original.map(s=>({...s,exercises:s.exercises.map(e=>{
      if(!supportsLoadProgression(e))return {...structuredClone(e),phase:'Coach programmed'};
      const step=options.roundTo??normalizePrescription(e).increment;
      const addedSets=setEvery?Math.floor(loadingSteps/setEvery):0;
      const load=e.load*(1+percent/100)**loadingSteps*(deload?.85:1);
      const rounded=e.load===0?0:Math.min(1200,Math.round(load/step)*step);
      const workSets=Math.min(10,e.sets+addedSets);
      return {...e,load:rounded,sets:deload?Math.max(1,Math.ceil(workSets*.6)):workSets,rpe:deload?Math.min(6,e.rpe):e.rpe,increment:step,phase:deload?'Deload':'Progressive build'};
    })}))};
  });
}

export function generateWestsideBlock(sessions,weeks,options={}) {
  const {roundTo=5,rules={}}=options;
  if(!Number.isInteger(weeks)||weeks<2||weeks>12||![.5,1,2.5,5,10].includes(roundTo))throw new Error('Choose a valid block length and weight increment.');
  const allowed=['hold','max','repetition','speed-squat','speed-bench'];
  for(const [si,s] of sessions.entries())for(const [ei,e] of s.exercises.entries()){
    const mode=rules[`${si}:${ei}:${e.exerciseId}`]?.mode||'hold';
    if(mode!=='hold'&&!supportsLoadProgression(e))throw new Error('Automatic load progression supports fixed pounds with RPE. Keep this prescription and edit its weeks manually.');
    if(!Number.isInteger(e.sets)||e.sets<1||e.sets>12||(supportsLoadProgression(e)&&(e.load<0||e.load>1200)))throw new Error('Check Week 1 weights and sets before generating.');
  }
  for(const rule of Object.values(rules)){
    if(!allowed.includes(rule.mode))throw new Error('Choose a supported training method.');
    if(rule.mode.startsWith('speed-')&&(!Number.isFinite(rule.referenceMax)||rule.referenceMax<=0||rule.referenceMax>1200))throw new Error('Enter a coach-approved reference max for every dynamic effort exercise.');
    if(rule.mode==='repetition'&&(!Number.isFinite(rule.increase)||rule.increase<0||rule.increase>5))throw new Error('Accessory increases must be between 0% and 5%.');
  }
  return Array.from({length:weeks},(_,i)=>({week:i+1,sessions:sessions.map((s,si)=>({...structuredClone(s),exercises:s.exercises.map((e,ei)=>{
    if(i===0)return structuredClone(e);
    const rule=rules[`${si}:${ei}:${e.exerciseId}`]||{mode:'hold'};
    const wave=i%3;
    const step=options.roundTo??normalizePrescription(e).increment;
    const round=load=>Math.min(1200,Math.round(load/step)*step);
    if(rule.mode==='speed-squat'||rule.mode==='speed-bench')return {...e,load:round(rule.referenceMax*(rule.mode==='speed-bench'?[.45,.5,.55]:[.5,.55,.6])[wave]),sets:rule.mode==='speed-squat'?[10,8,6][wave]:9,reps:rule.mode==='speed-squat'?2:3,increment:step,phase:`Dynamic effort · Wave ${Math.floor(i/3)+1}`,notes:[e.notes,'Bar weight only; no bands/chains included. Prioritize speed and technique. Review variation after each 3-week wave.'].filter(Boolean).join('\n')};
    if(rule.mode==='max')return {...e,phase:'Max effort · coach set',notes:[e.notes,'Coach: review or rotate the main variation weekly and choose the day’s load. No automatic maximal-load increases.'].filter(Boolean).join('\n')};
    if(rule.mode==='repetition')return {...e,load:e.load===0?0:round(e.load*(1+(rule.increase||0)/100)**i),phase:'Repetition effort',notes:[e.notes,'Coach-selected accessory progression; adjust for completed reps and recovery.'].filter(Boolean).join('\n')};
    return {...e,phase:'Coach programmed'};
  })}))}));
}

export function periodize(base, week, totalWeeks = 8) {
  if(!supportsLoadProgression(base))return {...structuredClone(base),phase:'Coach programmed'};
  const deload = week % 4 === 0;
  const cycle = Math.floor((week - 1) / 4);
  const position = (week - 1) % 4;
  const multiplier = deload ? 0.85 + cycle * 0.025 : 1 + position * 0.025 + cycle * 0.025;
  const step = base.increment ?? 5;
  return { ...base, load: base.load === 0 ? 0 : Math.round(base.load * multiplier / step) * step,
    sets: deload ? Math.max(1, Math.ceil(base.sets * 0.6)) : base.sets,
    reps: deload ? base.reps : Math.max(3, base.reps - position),
    rpe: deload ? 6 : Math.min(8.5, 7 + position * 0.5),
    phase: deload ? 'Deload' : cycle === 0 ? 'Foundation' : week > totalWeeks - 4 ? 'Intensification' : 'Build' };
}

// Conservative, explainable rules. Suggestions never modify a plan without a coach.
export function recommend(prescription, history) {
  prescription=normalizePrescription(prescription);
  const recent = history.slice(-2);
  const hold = reason => ({ action: 'hold', load: prescription.load, reason });
  if (!recent.length) return hold('Log two comparable sessions to establish a baseline.');
  if (recent.some(s => s.pain)) return { action: 'review', load: prescription.load, reason: 'Pain was reported. Review with the athlete before changing the plan.' };
  if(!supportsLoadProgression(prescription))return hold('This loading or effort mode needs coach-directed progression; its prescription remains unchanged.');
  if(recent.some(s=>!supportsLoadProgression(s.target)||s.sets.some(x=>(x.loadUnit??LOAD_UNIT.LBS)!==LOAD_UNIT.LBS||!Number.isFinite(x.rpe))))return hold('Use comparable fixed-pound targets and actual RPE before calculating load progression.');
  if (recent.some(s => s.readiness <= 2 || s.sets.some(x => x.rpe >= 9.5))) {
    const baseline=recent.at(-1).target.load;
    const load=Math.max(0, Math.floor(baseline * 0.95 / prescription.increment) * prescription.increment);
    if (prescription.load<=load) return hold('Load is already reduced relative to the last logged session. Review recovery before further changes.');
    return { action: 'reduce', load, reason: 'Low readiness or near-maximal effort: consider reducing load by about 5% from the last logged session.' };
  }
  if (prescription.phase === 'Deload') return hold('Protect the planned deload. Do not add load this week.');
  if(prescription.phase?.startsWith('Dynamic effort'))return hold('Follow the planned speed wave. Coach-adjust the load for bar speed and technique.');
  if(prescription.phase?.startsWith('Max effort'))return hold('The coach selects max-effort variations and loads; no automatic load increase.');
  if (recent.length < 2) return hold('One session recorded. Repeat successfully before increasing load.');
  if (!prescription.load) return hold('No positive fixed load is available; review the next progression with your coach.');
  const successful = recent.every(s => s.sets.length >= s.target.sets && s.sets.every(x => x.reps >= s.target.reps && x.rpe <= s.target.rpe && x.load >= prescription.load) && s.target.load === prescription.load);
  if (!successful) return hold('Keep the load until two comparable sessions meet all rep and effort targets.');
  const load = prescription.load + prescription.increment;
  if (load / prescription.load > 1.1) return hold('The available weight increment exceeds 10%. Use a smaller increment or progress reps.');
  return { action: 'increase', load, reason: 'All prescribed sets met rep and effort targets in two sessions at this load.' };
}
