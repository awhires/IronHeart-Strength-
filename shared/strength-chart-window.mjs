// Calendar presentation only: estimation and stored history are unchanged.
const labels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function strengthMonthWindow(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Use a valid calendar date.');
 return [-2,-1,0,1,2].map((offset,index)=>{
  const date=new Date(now.getFullYear(),now.getMonth()+offset,1),year=date.getFullYear(),month=date.getMonth();
  return {key:`${year}-${String(month+1).padStart(2,'0')}`,label:labels[month],fullLabel:`${labels[month]} ${year}`,year,index,current:offset===0,future:offset>0};
 });
}
export function strengthWindowPoints(monthly,window){
 return monthly.flatMap(point=>{const slot=window.find(m=>m.key===point.month&&!m.future);return slot?[{...point,windowIndex:slot.index}]:[];}).sort((a,b)=>a.windowIndex-b.windowIndex);
}
