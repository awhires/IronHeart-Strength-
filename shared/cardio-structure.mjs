// New blocks use ordered segments. Legacy work/recovery blocks remain readable.
import {RUNNING_RECOVERY_PRESETS} from './running-interval-presets.mjs';
export const MAX_CARDIO_SEGMENTS=300;
export function intervalSegments(block){return block.segments?.length?block.segments:[{label:'Work',metrics:block.work||{}}];}
// A missing round target remains null; structurally it still represents one
// work interval so an athlete can open and log the prescription.
export function intervalSetCount(blocks){return blocks.reduce((n,b)=>n+(b.rounds??1)*intervalSegments(b).length,0);}
export function validateIntervalShape(blocks){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>20)throw Error('Use 1–20 interval blocks.');
 for(const b of blocks){
  if(!b||b.rounds!=null&&(!Number.isInteger(b.rounds)||b.rounds<1||b.rounds>30))throw Error('Use 1–30 rounds per block when a round target is supplied.');
  if(b.segments!==undefined&&(!Array.isArray(b.segments)||!b.segments.length||b.segments.length>10))throw Error('Use 1–10 ordered segments per round.');
  if(b.recoveryAfterFinal!==undefined&&typeof b.recoveryAfterFinal!=='boolean')throw Error('Recovery after the final repetition must be yes or no.');
  if(b.recoveryRule!==undefined){const r=b.recoveryRule;if(!r||typeof r!=='object'||!(r.preset==='custom'||Object.hasOwn(RUNNING_RECOVERY_PRESETS,r.preset))||!Number.isFinite(r.recoveryPerWork)||r.recoveryPerWork<0||r.recoveryPerWork>10||!Number.isFinite(r.workDurationSeconds)||r.workDurationSeconds<=0)throw Error('Check the running recovery rule.');}
  for(const s of intervalSegments(b))if(!s||typeof(s.label??'')!=='string'||(s.label||'').length>80||!s.metrics||typeof s.metrics!=='object'||Array.isArray(s.metrics))throw Error('Check interval segment label and metrics.');
  for(const s of intervalSegments(b))if(s.kind!==undefined&&!['work','recovery'].includes(s.kind))throw Error('Interval segment type must be work or recovery.');
 }
 if(intervalSetCount(blocks)>MAX_CARDIO_SEGMENTS)throw Error('Use at most 300 performed cardio segments.');
 return blocks;
}
