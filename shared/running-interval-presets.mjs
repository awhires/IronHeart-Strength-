// Coach methodology presets are independent of individual workout prescriptions.
// Other workout categories intentionally have no assumed recovery ratio.
export const RUNNING_RECOVERY_PRESETS=Object.freeze({
 threshold:Object.freeze({label:'Threshold running',recoveryPerWork:0.75})
});

export function suggestedRecoverySeconds(workSeconds,recoveryPerWork){
 if(!Number.isFinite(workSeconds)||workSeconds<=0||!Number.isFinite(recoveryPerWork)||recoveryPerWork<0||recoveryPerWork>10)throw Error('Enter a work duration and a recovery ratio from 0 to 10.');
 const seconds=Math.round(workSeconds*recoveryPerWork);
 if(seconds>3600)throw Error('Recovery cannot exceed 60 minutes.');
 return seconds;
}

export function applyRunningRecovery(block,{preset='custom',recoveryPerWork}={}){
 const ratio=preset==='custom'?recoveryPerWork:RUNNING_RECOVERY_PRESETS[preset]?.recoveryPerWork;
 if(ratio==null)throw Error('Choose a supported running recovery preset.');
 const segments=block.segments?.length?block.segments:[{metrics:block.work||{}}];
 if(segments.length!==1)throw Error('Use a separate interval block for each work duration before applying a ratio.');
 if(segments[0].kind==='recovery')throw Error('A work-to-recovery ratio needs a work segment.');
 const duration=segments[0].metrics.durationSeconds;
 const recovery=suggestedRecoverySeconds(duration,ratio);
 return {...block,recovery:{...block.recovery,durationSeconds:recovery},recoveryRule:{preset,recoveryPerWork:ratio,workDurationSeconds:duration}};
}
