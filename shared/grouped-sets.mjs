// Consecutive equal sets group losslessly; no merging across exercise boundaries.
const stable=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
export function groupActualSets(sets){
 const rows=[];for(const set of sets){const {blockIndex,...value}=set;const last=rows.at(-1);if(last&&stable(last.value)===stable(value))last.count++;else rows.push({count:1,value:structuredClone(value)});}
 return rows.map(({count,value})=>({...value,count}));
}
export function expandGroupedRows(rows,max=30){
 if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Number.isInteger(Number(r.count))||Number(r.count)<1)||rows.reduce((n,r)=>n+Number(r.count),0)>max)throw Error(`Use 1–${max} total sets.`);
 return rows.flatMap(({count,...set})=>Array.from({length:Number(count)},()=>structuredClone(set)));
}
