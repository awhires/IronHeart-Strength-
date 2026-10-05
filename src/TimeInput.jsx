import React,{useEffect,useState} from 'react';
import {formatTime,parseTime} from '../shared/time.mjs';
export default function TimeInput({value,onChange,...props}){
 const [draft,setDraft]=useState(formatTime(value));
 useEffect(()=>{setDraft(formatTime(value));},[value]);
 return <input {...props} type="text" inputMode="text" placeholder="M:SS" value={draft} onChange={e=>{const v=e.target.value;setDraft(v);try{const seconds=parseTime(v);e.target.setCustomValidity('');onChange(seconds);}catch(err){e.target.setCustomValidity(err.message);}}} onBlur={e=>{try{const n=parseTime(draft);setDraft(formatTime(n));e.target.setCustomValidity('');}catch(err){e.target.setCustomValidity(err.message);}}}/>;
}
