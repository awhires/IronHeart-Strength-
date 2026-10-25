import React from 'react';
import {convertDistance} from '../shared/tracking.mjs';
import {formatTime} from '../shared/time.mjs';

export default function RunningPaceChart({intervals,unit='mi'}){
 if(!Array.isArray(intervals)||intervals.length<2)return null;
 const paces=intervals.map(row=>convertDistance(1,unit,'m')/row.speedMps);
 const low=Math.floor((Math.min(...paces)-15)/15)*15,high=Math.ceil((Math.max(...paces)+15)/15)*15;
 const x=index=>48+index*250/(paces.length-1),y=pace=>18+(pace-low)/(high-low)*112;
 const points=paces.map((pace,index)=>`${x(index)},${y(pace)}`).join(' ');
 return <figure style={{margin:'12px 0',maxWidth:'100%'}}><svg viewBox="0 0 320 175" width="100%" role="img" aria-label={`Completed work-interval pace chart in minutes per ${unit}. Lower times at the top are faster.`} style={{maxWidth:'100%',height:'auto'}}>
  {[0,0.5,1].map((fraction,index)=>{const pace=low+(high-low)*fraction,yy=y(pace);return <g key={index}><line x1="44" x2="305" y1={yy} y2={yy} stroke="#ffffff29"/><text x="2" y={yy+4} fill="#dce0e3" fontSize="11">{formatTime(pace)}</text></g>;})}
  <polyline points={points} fill="none" stroke="#ee5260" strokeWidth="2"/>
  {paces.map((pace,index)=><g key={index}><circle cx={x(index)} cy={y(pace)} r="4" fill="#ee5260"><title>Interval {intervals[index].index}: {formatTime(pace)} / {unit}</title></circle><text x={x(index)} y="152" textAnchor="middle" fill="#dce0e3" fontSize="10">{intervals[index].index}</text></g>)}
  <text x="172" y="171" textAnchor="middle" fill="#dce0e3" fontSize="10">Work interval number</text>
 </svg><figcaption className="footnote">Pace (min/{unit}). Lower times mean faster running. Completed work intervals only.</figcaption></figure>;
}
