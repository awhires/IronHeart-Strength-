import {DRAFT_STATUS, SEVERITY} from './contract.mjs';
import {validateDraft} from './validate.mjs';

// Review state is application-owned and outside the future model's draft contract.
// This snapshot protects the prototype from stale approval, not hostile clients.
// A hosted implementation must verify approval and revision on the server.
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function signature(draft,library,requirements){
  const {status,validationFindings,...content}=draft;
  return JSON.stringify(stable({content,library:library.map(({id,name})=>({id,name})).sort((a,b)=>a.id.localeCompare(b.id)),requirements}));
}
export function createReview(draft){
  return {draft:{...structuredClone(draft),status:DRAFT_STATUS.DRAFT,validationFindings:[]},revision:1,approval:null};
}
export function editReview(review,edit){
  const next=structuredClone(review.draft);
  edit(next);
  return {draft:{...next,status:DRAFT_STATUS.DRAFT,validationFindings:[]},revision:review.revision+1,approval:null};
}
export function approveReview(review,library,requirements={},options={}){
  const result=validateDraft(review.draft,library,requirements);
  if(!result.canApprove)throw new Error('Resolve all errors before approving.');
  if(result.counts[SEVERITY.WARNING]&&!options.warningsReviewed)throw new Error('Review and acknowledge the warnings before approving.');
  if(!options.coachId)throw new Error('A reviewing coach is required.');
  const draft={...structuredClone(review.draft),status:DRAFT_STATUS.APPROVED,validationFindings:result.findings};
  return {...structuredClone(review),draft,approval:{coachId:options.coachId,revision:review.revision,reviewedAt:options.reviewedAt||new Date().toISOString(),signature:signature(draft,library,requirements)}};
}
export function isApproved(review,library,requirements={}){
  return review?.draft?.status===DRAFT_STATUS.APPROVED&&!!review.approval&&review.approval.revision===review.revision&&review.approval.signature===signature(review.draft,library,requirements)&&validateDraft(review.draft,library,requirements).canApprove;
}
