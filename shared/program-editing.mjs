export function appendProgramWeek(program){
 if(!Number.isInteger(program?.weeks)||program.weeks<1||program.weeks>=12)throw Error('Programs can be extended up to twelve weeks.');
 const source=program.plan||Array.from({length:program.weeks},(_,index)=>({week:index+1,sessions:structuredClone(program.sessions||[])}));
 const previous=source.at(-1);
 if(!previous||!Array.isArray(previous.sessions)||!previous.sessions.length)throw Error('The previous week needs at least one session before adding a week.');
 const plan=[...structuredClone(source),{week:program.weeks+1,sessions:structuredClone(previous.sessions)}];
 return {...structuredClone(program),weeks:program.weeks+1,plan,sessions:structuredClone(plan[0].sessions)};
}
