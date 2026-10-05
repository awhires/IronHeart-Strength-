import React,{useEffect,useState} from 'react';

export default function PreviewSignIn({request,onLogin,setError}){
  const [athletes,setAthletes]=useState([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;request('config').then(config=>{if(active){setAthletes(config.previewAthletes||[]);setSelected(config.previewAthletes?.[0]?.id||'');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  async function enter(role){
    setBusy(true);setError('');
    try{await request('demo','POST',{role,...(role==='athlete'?{athleteId:selected}:{})});await onLogin();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <form onSubmit={e=>{e.preventDefault();enter('athlete');}}>
    <label className="field"><span>Choose your athlete</span><select value={selected} disabled={busy||!athletes.length} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}{!athletes.length&&<option value="">Add an athlete in Coach view first</option>}</select></label>
    <button className="btn" disabled={busy||!selected} type="submit">{busy?'Opening…':'Athlete sign in'}</button>
    <button className="btn secondary" disabled={busy} type="button" onClick={()=>enter('coach')}>Coach view</button>
    <small>Preview access — no password needed. Use Jordan Davis to try a sample program, or select an athlete you created in Coach view. Data stays on this phone. Sign out from the navigation menu to switch roles.</small>
  </form>;
}
