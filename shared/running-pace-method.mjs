export const RUNNING_PACE_SOURCES=Object.freeze({six_minute:'Six-minute maximal-effort assessment',mile:'One-mile time trial',four_hundred:'400 m time trial',benchmark:'Other running time-trial benchmark'});
export const RUNNING_PACE_CATEGORIES=Object.freeze({easy:'Easy aerobic',threshold:'Threshold',vo2Intervals:'VO₂max intervals',shortIntervals:'Short faster intervals',observed:'Observed time-trial pace'});

export function validateRunningPaceMethod(method){
 if(method==null)return;
 if(!method||typeof method!=='object'||Array.isArray(method)||!['fixed','assessment'].includes(method.type))throw Error('Choose Fixed Pace or Assessment-Based Pace.');
 if(method.type==='fixed')return;
 if(!Object.hasOwn(RUNNING_PACE_SOURCES,method.source)||!Object.hasOwn(RUNNING_PACE_CATEGORIES,method.category)||!['mi','km'].includes(method.unit)||method.locked!=null&&typeof method.locked!=='boolean')throw Error('Choose a valid running assessment source, pace method, and unit.');
 if(method.source==='benchmark'&&!(typeof method.benchmarkId==='string'&&method.benchmarkId.length>0&&method.benchmarkId.length<=100))throw Error('Choose a running time-trial benchmark.');
 if((method.source==='six_minute')===(method.category==='observed'))throw Error('Six-minute field tests use a training category; time trials support observed pace only.');
}
