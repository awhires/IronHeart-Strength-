// New blocks use ordered segments. Legacy work/recovery blocks remain readable.
export const MAX_CARDIO_SEGMENTS=300;
export function intervalSegments(block){return block.segments?.length?block.segments:[{label:'Work',metrics:block.work||{}}];}
export function intervalSetCount(blocks){return blocks.reduce((n,b)=>n+b.rounds*intervalSegments(b).length,0);}
export function validateIntervalShape(blocks){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>20)throw Error('Use 1–20 interval blocks.');
 for(const b of blocks){
  if(!b||!Number.isInteger(b.rounds)||b.rounds<1||b.rounds>30)throw Error('Use 1–30 rounds per block.');
  if(b.segments!==undefined&&(!Array.isArray(b.segments)||!b.segments.length||b.segments.length>10))throw Error('Use 1–10 ordered segments per round.');
  for(const s of intervalSegments(b))if(!s||typeof(s.label??'')!=='string'||(s.label||'').length>80||!s.metrics||typeof s.metrics!=='object'||Array.isArray(s.metrics))throw Error('Check interval segment label and metrics.');
 }
 if(intervalSetCount(blocks)>MAX_CARDIO_SEGMENTS)throw Error('Use at most 300 performed cardio segments.');
 return blocks;
}
