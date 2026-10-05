import {conditioningSession} from './conditioning-contract.mjs';
import {LOAD_MODE} from './contract.mjs';
import {percentageLoad,validateDraft} from './validate.mjs';
import {isApproved} from './draft-state.mjs';

// Pure structural adapter. No ID creation, database write, assignment, or legacy
// periodization. Percentage metadata remains canonical alongside its calculated load.
export function toIronHeartProgram(review,library,requirements={}){
  if(!isApproved(review,library,requirements))throw new Error('This exact draft revision must be approved before conversion.');
  const result=validateDraft(review.draft,library,requirements);
  if(!result.canApprove)throw new Error('Draft contains validation errors.');
  const program=structuredClone(review.draft.program);
  if(review.draft.schemaVersion===2)for(const week of program.plan)week.sessions=week.sessions.map(conditioningSession);
  for(const week of program.plan)for(const session of week.sessions)for(const e of session.exercises){
    if(e.loadMode===LOAD_MODE.PERCENTAGE)e.load=percentageLoad(e,library);
  }
  // One Week 1 object in memory. JSON serialization creates a derived compatibility
  // projection; plan[0] remains authoritative when the save adapter is implemented.
  program.sessions=program.plan[0].sessions;
  return {...program,aiProvenance:{schemaVersion:review.draft.schemaVersion,sourceProgramId:review.draft.sourceProgramId,originalRequest:review.draft.originalRequest,approvedRevision:review.revision,approvedBy:review.approval.coachId,approvedAt:review.approval.reviewedAt}};
}
