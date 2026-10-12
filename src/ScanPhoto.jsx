import React,{useState,useRef} from 'react';
export default function ScanPhoto({request,onScan,disabled=false}){
 const details=useRef();
 const [photo,setPhoto]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scan=async()=>{setBusy(true);setError('');try{const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(photo);});const result=await request('ai/workout-scan','POST',{image});onScan(result);setPhoto(null);if(details.current)details.current.open=false;}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <details ref={details} className="scan-photo"><summary>Scan Workout</summary><p className="footnote">Upload a journal photo. Scan sends it to your configured AI provider. Always review before saving.</p><label className="field"><span>Journal photo</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||disabled} onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>4*1024*1024){setPhoto(null);setError('Choose an image smaller than 4 MB.');return;}setPhoto(f||null);}}/></label><button type="button" className="btn secondary" disabled={!photo||busy||disabled} onClick={scan}>{busy?'Reading journal…':'Scan and review'}</button>{error&&<p role="alert" className="error">{error}</p>}</details>;
}
