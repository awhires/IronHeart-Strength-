import React,{useState} from 'react';
import {ArrowLeft,Send,Sparkles} from 'lucide-react';
import './ask-iron-heart.css';

const suggestions=['What is my heaviest bench press?','What was my most recent squat workout?','How many times have I trained legs this month?','What was my fastest 3-mile run?'];
export default function AskIronHeart({data,request,onBack}){
 const coach=data.user.role==='coach', [athlete,setAthlete]=useState(data.athletes[0]?.id||''),[question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const ask=async(value)=>{const text=String(value||'').trim();if(!text||busy)return;setQuestion('');setError('');setMessages(v=>[...v,{role:'user',text}]);setBusy(true);try{const response=await request('ask-ai','POST',{question:text,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,...(coach?{athleteId:athlete}:{})});setMessages(v=>[...v,{role:'assistant',text:response.answer,evidence:response.evidence||[],provider:response.provider}]);}catch(e){setError(e.message);setMessages(v=>v.slice(0,-1));setQuestion(text);}finally{setBusy(false);}};
 return <section className="ask-iron-heart"><div className="page-heading"><div><div className="eyebrow">TRAINING HISTORY, ANSWERED</div><h1>Ask Iron Heart AI</h1><p>Answers are grounded in saved workout results and dates.</p></div><button className="btn secondary" onClick={onBack}><ArrowLeft size={16}/>Back to Progress</button></div>
  {coach&&<label className="field ask-athlete"><span>Athlete</span><select aria-label="Athlete to ask about" value={athlete} onChange={e=>{setAthlete(e.target.value);setMessages([]);}}>{data.athletes.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
  <div className="panel ask-chat"><div className="ask-intro"><Sparkles size={18}/><p>Ask about actual training history, personal records, or trends. Prescribed targets and estimated maxes are kept separate from performed results.</p></div>
   <div className="ask-messages" aria-live="polite">{!messages.length&&<div className="ask-suggestions"><strong>Try asking</strong>{suggestions.map(v=><button type="button" className="btn secondary" key={v} onClick={()=>ask(v)}>{v}</button>)}</div>}{messages.map((m,i)=><article className={`ask-message ${m.role}`} key={i}><strong>{m.role==='user'?'You':'Iron Heart AI'}</strong><p>{m.text}</p>{m.evidence?.length>0&&<details><summary>Sources from your training history</summary>{m.evidence.map((e,n)=><p key={n}>{e.date?`${e.date} · `:''}{e.workout||e.exercise||e.message||e.period?.start||e.kind}</p>)}</details>}</article>)}{busy&&<p className="ask-loading" role="status">Checking your saved training…</p>}</div>
   {error&&<p className="error" role="alert">{error}</p>}<form className="ask-input" onSubmit={e=>{e.preventDefault();ask(question);}}><textarea aria-label="Ask a training question" value={question} maxLength={500} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about your training history…"/><button className="btn" disabled={busy||!question.trim()||coach&&!athlete}><Send size={16}/>{busy?'Thinking…':'Ask'}</button></form>
  </div>
 </section>;
}
