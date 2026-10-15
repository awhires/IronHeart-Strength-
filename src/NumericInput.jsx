import React,{useEffect,useRef,useState} from 'react';

// Keep human input (including blank and partial numbers) out of domain state.
// Native validity blocks submission while an unfinished/invalid draft is visible.
export default function NumericInput({value,onChange,commitOnBlur=false,...props}){
 const [draft,setDraft]=useState(value??''),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(value??'');},[value]);
 function commit(input){
  input.setCustomValidity('');
  if(!input.validity.valid)return;
  const next=input.value===''?null:input.valueAsNumber;
  if(next!==null&&!Number.isFinite(next))return;
  if(next===value||(next===null&&value==null))return;
  try{onChange(next);}catch(error){input.setCustomValidity(error.message||'Check this value.');}
 }
 return <input {...props} type="number" value={draft} onFocus={()=>{focused.current=true;}}
  onChange={e=>{setDraft(e.target.value);e.target.setCustomValidity('');if(!commitOnBlur)commit(e.target);}}
  onKeyDown={e=>{if(e.key==='Enter')commit(e.currentTarget);}}
  onBlur={e=>{focused.current=false;commit(e.target);}}/>;
}
