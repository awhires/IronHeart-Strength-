// Generation always appends. Existing mounted reviews retain edits and approvals.
export function appendGeneration(history,result){
  if(!result?.generationId||history.some(g=>g.generationId===result.generationId))throw Error('This generation is already open.');
  if(history.length>=10)throw Error('Ten drafts are open. Save needed programs before refreshing to start a new review session.');
  return [...history,structuredClone(result)];
}
