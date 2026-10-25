import test from 'node:test';
import assert from 'node:assert/strict';
import {RUNNING_RECOVERY_PRESETS,suggestedRecoverySeconds,applyRunningRecovery} from '../shared/running-interval-presets.mjs';
import {prescribedCardioIntervals} from '../shared/cardio-logging.mjs';
import {validateCardioPrescription} from '../shared/cardio-prescriptions.mjs';
import {comparableRunningIntervalHistory} from '../shared/running-analytics.mjs';

const library=[{id:'run',name:'Outdoor Running',trackingType:'running'}];
const block=seconds=>({rounds:4,segments:[{label:'Work',metrics:{durationSeconds:seconds,paceSeconds:420,paceUnit:'mi'}}],recovery:{paceSeconds:700,paceUnit:'mi'}});
const prescription=intervals=>({exerciseId:'run',trackingType:'running',intervalCount:intervals.reduce((n,b)=>n+b.rounds,0),metrics:{},intervals});

test('threshold 1:0.75 is a coach preset; custom ratios and manual overrides preserve work and recovery paces',()=>{
 assert.equal(RUNNING_RECOVERY_PRESETS.threshold.recoveryPerWork,0.75);
 for(const [work,recovery] of [[120,90],[240,180],[360,270],[480,360],[600,450]])assert.equal(suggestedRecoverySeconds(work,0.75),recovery);
 assert.equal(suggestedRecoverySeconds(360,0.5),180);
 assert.throws(()=>suggestedRecoverySeconds(360,-1),/ratio/);
 const original=block(360),applied=applyRunningRecovery(original,{preset:'threshold'});
 assert.equal(original.recovery.durationSeconds,undefined);
 assert.equal(applied.recovery.durationSeconds,270);
 assert.equal(applied.recovery.paceSeconds,700);
 assert.equal(applied.segments[0].metrics.paceSeconds,420);
 assert.equal(applied.recoveryRule.recoveryPerWork,0.75);
 const custom=applyRunningRecovery(original,{preset:'custom',recoveryPerWork:0.5});
 assert.equal(custom.recovery.durationSeconds,180);
 const overridden={...custom,recovery:{...custom.recovery,durationSeconds:210},recoveryRule:undefined};
 assert.equal(validateCardioPrescription(prescription([overridden]),library).intervals[0].recovery.durationSeconds,210);
});

test('different work durations use independent structured blocks and final recovery is optional',()=>{
 const short=applyRunningRecovery(block(120),{preset:'threshold'}),long=applyRunningRecovery(block(360),{preset:'threshold'});
 const target=prescription([short,{...long,recoveryAfterFinal:true}]);
 validateCardioPrescription(target,library);
 const rows=prescribedCardioIntervals(target);
 assert.equal(rows.length,8);
 assert.equal(rows[0].recovery.durationSeconds,90);
 assert.equal(rows[3].recovery.durationSeconds,undefined);
 assert.equal(rows[7].recovery.durationSeconds,270);
 assert.equal(rows[0].work.paceSeconds,420);
 assert.equal(rows[0].recovery.paceSeconds,700);
 assert.equal(prescribedCardioIntervals(prescription([{...short,recoveryAfterFinal:false}]))[3].recovery.durationSeconds,undefined);
 const legacy=prescribedCardioIntervals({trackingType:'running',intervalCount:2,metrics:{durationSeconds:120},restSeconds:60});
 assert.equal(legacy[1].recovery.durationSeconds,60);
 assert.throws(()=>validateCardioPrescription(prescription([{...short,recoveryAfterFinal:'no'}]),library),/final repetition/);
 assert.throws(()=>applyRunningRecovery({...short,segments:[...short.segments,...short.segments]},{preset:'threshold'}),/separate interval block/);
});

test('repeat comparisons require the same workout and comparable completed actual intervals',()=>{
 const log=(id,date,name,seconds,pace,extra={})=>({id,athleteId:'a',sessionName:name,workoutDate:date,status:'completed',exercises:[{exerciseId:'run',sets:Array.from({length:3},()=>({completed:true,durationSeconds:seconds,paceSeconds:pace,paceUnit:'mi'}))}],...extra});
 const logs=[log('one','2030-01-01','Six by two',120,450),log('other','2030-01-02','Eight by two',120,440),log('two','2030-01-03','Six by two',120,430),log('unlike','2030-01-04','Six by two',180,400),log('partial','2030-01-05','Six by two',120,420,{exercises:[{exerciseId:'run',sets:[{completed:true,durationSeconds:120,paceSeconds:420,paceUnit:'mi'},{completed:false,durationSeconds:120,paceSeconds:420,paceUnit:'mi'}]}]})];
 const comparisons=comparableRunningIntervalHistory(logs,'run',library,'a');
 assert.equal(comparisons.find(r=>r.log.id==='two').previousLogId,'one');
 assert.ok(comparisons.find(r=>r.log.id==='two').averageSpeedChangePercent>0);
 assert.equal(comparisons.find(r=>r.log.id==='other').previousLogId,null);
 assert.equal(comparisons.find(r=>r.log.id==='unlike').previousLogId,null);
 assert.equal(comparisons.some(r=>r.log.id==='partial'),false);
 assert.equal(comparableRunningIntervalHistory(logs,'run',library,'another').length,0);
});
