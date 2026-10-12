import React,{useState} from 'react';
import ScanPhoto from './ScanPhoto.jsx';
import PrescriptionEditor from './PrescriptionEditor.jsx';
import {scanToPrescriptions} from '../shared/scan-workout.mjs';
export default function CoachScanReview({request,exercises,onAdd}){
 const [draft,setDraft]=useState(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 return <><ScanPhoto request={request} onScan={r=>{try{setDraft({items:scanToPrescriptions(r.workout,exercises),warnings:r.warnings});setConfirmed(false);setError('');}catch(e){setError(e.message);}}}/>{error&&<p role="alert" className="error">{error}</p>}{draft&&<section className="panel scan-review"><h3>Review scanned prescriptions</h3><p>Nothing saved or assigned. Check every target.</p><p className="footnote">{draft.warnings.join(' ')}</p><PrescriptionEditor items={draft.items} exercises={exercises} onChange={items=>{setDraft({...draft,items});setConfirmed(false);}}/><label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed these prescriptions.</label><button type="button" className="btn" disabled={!confirmed} onClick={()=>{onAdd(draft.items);setDraft(null);}}>Add reviewed exercises to session</button><button type="button" className="text-button" onClick={()=>setDraft(null)}>Discard scan</button></section>}</>;
}
