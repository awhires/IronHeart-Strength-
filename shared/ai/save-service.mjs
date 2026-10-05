import {isApproved} from './draft-state.mjs';
import {toIronHeartProgram} from './convert.mjs';

// Authenticated adapters own this receipt store. Model output cannot mint receipts.
// Receipts expire after 30 minutes and are bound to coach, complete review, and requirements.
// A repeated successful request returns the original result instead of duplicating it.
export function createDraftSaveService(newId,now=()=>Date.now()){
  const receipts=new Map();
  const check=(input,library,coachId)=>{
    if(!input?.review||input.review.approval?.coachId!==coachId||!isApproved(input.review,library,input.requirements||{}))throw Error('This exact draft revision must be approved by you before saving.');
  };
  const content=input=>JSON.stringify({review:input.review,requirements:input.requirements||{}});
  return {
    approve(input,library,coachId){
      check(input,library,coachId);
      for(const [key,r] of receipts)if(r.expires<now())receipts.delete(key);
      if(receipts.size>=500)throw Error('Too many pending approvals. Try again later.');
      const receipt=newId();receipts.set(receipt,{coachId,content:content(input),expires:now()+30*60000,result:null});
      return {receipt};
    },
    save(input,library,coachId,persist){
      const r=receipts.get(input.receipt);
      if(!r||r.coachId!==coachId||r.expires<now()||r.content!==content(input))throw Error('Approval expired or draft changed. Review and approve again.');
      check(input,library,coachId);
      if(r.result)return structuredClone(r.result);
      const program=toIronHeartProgram(input.review,library,input.requirements||{});
      // Never take an ID from the draft or its sourceProgramId.
      const result=persist({...program,id:newId()});
      r.result=structuredClone(result);
      return result;
    }
  };
}
