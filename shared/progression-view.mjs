// Read-only compatibility helpers. Never rewrite the stored assignment.
export function planWeeks(assignment){return Array.isArray(assignment?.plan)?assignment.plan.filter(w=>w&&typeof w==='object'):[];}
export function planWeek(assignment,week){return planWeeks(assignment).find(w=>Number(w.week)===Number(week));}
export function recommendationTarget(assignment,week,row){
 const session=planWeek(assignment,week)?.sessions?.[row?.session];
 const item=session?.exercises?.[row?.index];
 return item&&item.exerciseId===row.exerciseId?{session,item}:null;
}
