import {exercises} from '../server/seed.mjs';
for (const e of exercises) {
  try {
    const response=await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${e.video}&format=json`,{signal:AbortSignal.timeout(10000)});
    const data=response.ok?await response.json():{};
    console.log(JSON.stringify({exercise:e.name,status:response.status,title:data.title||''}));
  } catch {console.log(JSON.stringify({exercise:e.name,status:'unavailable'}));}
}
