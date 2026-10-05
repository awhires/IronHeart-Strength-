export function formatTime(seconds){
 if(seconds==null||seconds===''||!Number.isFinite(Number(seconds))||Number(seconds)<0)return '';
 const n=Math.round(Number(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}
export function parseTime(value){
 if(value===''||value==null)return null;
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value;
 if(!/^\d+:[0-5]\d$/.test(String(value).trim()))throw Error('Enter time as M:SS, for example 5:30.');
 const [m,s]=String(value).trim().split(':').map(Number);return m*60+s;
}
