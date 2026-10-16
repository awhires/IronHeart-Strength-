// Coach-owned, optional metadata. Legacy prescriptions have no adaptive rule.
export function validateAdaptiveRule(rule){
 if(rule===undefined)return;
 if(!rule||rule.version!==1||rule.enabled!==true||Object.keys(rule).some(k=>!['version','enabled','minPercent','maxPercent'].includes(k))||![rule.minPercent,rule.maxPercent].every(n=>Number.isFinite(n)&&n>=0&&n<=10)||rule.minPercent>rule.maxPercent)throw Error('Adaptive weekly increases must be a coach-selected range from 0% to 10%.');
}
