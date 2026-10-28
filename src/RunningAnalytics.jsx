import React from 'react';
import {convertDistance} from '../shared/tracking.mjs';
import {runningAssessments,runningTimeTrials,runningPaceRecommendations,runningIntervalFatigue,comparableRunningIntervalHistory,runningFatigueInsight} from '../shared/running-analytics.mjs';
import {formatTime} from '../shared/time.mjs';
import RunningPaceChart from './RunningPaceChart.jsx';

const pace=(speed,unit)=>speed>0?`${formatTime(convertDistance(1,unit,'m')/speed)} / ${unit}`:'—';
const distance=(meters,unit)=>meters>0?`${convertDistance(meters,'m',unit).toFixed(2)} ${unit}`:'—';
const percent=(value,digits=1)=>Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(digits)}%`:'—';
const changePoints=value=>Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(1)} pts`:'—';

export default function RunningAnalytics({data,athlete,exercise,unit,onSession}){
 const assessments=runningAssessments(data.logs,data.savedBenchmarks,data.exercises,athlete);
 const trials=runningTimeTrials(data.logs,data.savedBenchmarks,data.exercises,athlete);
 const recommendations=runningPaceRecommendations({assessments,timeTrials:trials,unit});
 const intervalRows=data.logs.filter(l=>l.athleteId===athlete&&(l.exercises||[]).some(e=>e.exerciseId===exercise.id)).map(log=>({log,...runningIntervalFatigue(log,exercise.id,data.exercises)})).filter(row=>row.intervals.length>1).sort((a,b)=>(a.log.workoutDate||'').localeCompare(b.log.workoutDate||''));
 const latest=intervalRows.at(-1);
 const insight=runningFatigueInsight(latest);
 const repeatRows=comparableRunningIntervalHistory(data.logs,exercise.id,data.exercises,athlete).filter(row=>row.previousLogId);
 const names={easy:'Easy aerobic',threshold:'Threshold-oriented',vo2Intervals:'VO₂max intervals',shortIntervals:'Short faster intervals'};
 const assessmentHistory=assessments.slice().reverse();
 const previousQualifying=row=>{const index=assessments.findIndex(item=>item.logId===row.logId);return assessments.slice(0,index).filter(item=>item.qualified&&item.velocityMps>0).at(-1)||null;};
 const currentLog=row=>data.logs.find(log=>log.id===row.logId);
 const qualificationLabel=row=>row.qualified?'Qualifying':currentLog(row)?.status==='completed'?'Nonqualifying':'Incomplete';
 const fatigueCards=latest?.averageSpeedMps?[
  ['Average running pace',pace(latest.averageSpeedMps,unit)],
  ['Completed work distance',distance(latest.totalMeters,unit)],
  ['Early-to-late speed change',latest.fatiguePercent>0?`${latest.fatiguePercent.toFixed(1)}% decline`:latest.fatiguePercent<0?`${Math.abs(latest.fatiguePercent).toFixed(1)}% faster late`:'0.0% maintained'],
  ['Pace variability',`${latest.variabilityPercent.toFixed(1)}%`],
  ['First-to-last velocity change',percent(latest.changePercent)],
  ['Recorded recovery time',latest.recordedRecoveries?formatTime(latest.recoverySeconds):'Not recorded']
 ]:[['Average running pace','—'],['Completed work distance','—'],['Early-to-late speed change','—'],['Pace variability','—'],['First-to-last velocity change','—'],['Recorded recovery time','Not recorded']];
 return <section className="running-analytics" aria-label="Advanced running analytics">
  <section className="panel running-section" aria-labelledby="running-assessment-title">
   <div className="running-section-heading"><div><span className="running-kicker">FIELD TEST HISTORY</span><h3 id="running-assessment-title">Six-minute running assessment</h3></div></div>
   {!assessmentHistory.length?<p className="footnote">No six-minute assessment recorded yet. A coach can save a six-minute running workout as a benchmark.</p>:<div className="running-assessment-list">{assessmentHistory.map(row=>{
    const log=currentLog(row),previous=row.qualified?previousQualifying(row):null;
    const velocityChange=previous?((row.velocityMps/previous.velocityMps)-1)*100:null;
    const status=qualificationLabel(row);
    return <article className={`running-assessment-card ${row.qualified?'is-qualified':status==='Incomplete'?'is-incomplete':'is-nonqualifying'}`} key={row.logId}>
     <div className="running-assessment-top"><div className="running-assessment-date"><span>Assessment date</span><button type="button" className="running-date-link" onClick={()=>onSession(log)}>{row.date||'Date unavailable'}</button></div><span aria-label={`Qualification status: ${status}`} className={`running-status ${row.qualified?'qualified':status==='Incomplete'?'incomplete':'nonqualifying'}`}>{status}</span></div>
     <div className="running-metric-grid">
      <div><span>Distance completed</span><strong>{distance(row.meters,unit)}</strong></div>
      <div><span>Average velocity</span><strong>{row.qualified&&row.velocityMps?`${row.velocityMps.toFixed(2)} m/s`:'—'}</strong></div>
      <div><span>Average pace</span><strong>{row.qualified&&row.velocityMps?pace(row.velocityMps,unit):'—'}</strong></div>
      <div><span>Change vs previous qualifying</span><strong>{velocityChange==null?'—':percent(velocityChange)}</strong></div>
     </div>
     {(!row.qualified||row.notes)&&<p className="running-assessment-note">{!row.qualified?row.reason:row.notes}{row.notes&&!row.qualified?` · ${row.notes}`:''}</p>}
     {row.qualified&&<small className="running-data-note">Estimated field-test velocity · {formatTime(row.seconds)} elapsed</small>}
    </article>;
   })}</div>}
   <details className="running-disclosure"><summary>About this assessment</summary><p>Average velocity is an estimated field-test vVO₂max proxy. It is not laboratory-measured VO₂max or oxygen consumption. Only confirmed maximal, completed six-minute attempts qualify for pace suggestions. Incomplete and nonqualifying attempts remain in history.</p></details>
  </section>

  <section className="panel running-section" aria-labelledby="running-pace-title">
   <div className="running-section-heading"><div><span className="running-kicker">ATHLETE-SPECIFIC ESTIMATES</span><h3 id="running-pace-title">Suggested running paces</h3></div></div>
   {recommendations.source?<>
    <p className="running-source">Based on the qualifying six-minute field test from <strong>{recommendations.source.date}</strong>. Estimates remain separate from actual workout results.</p>
    <div className="running-pace-list" role="list" aria-label="Recommended running pace ranges">{Object.entries(recommendations.bands).map(([key,row])=><div className="running-pace-row" role="listitem" key={key}><span>{names[key]}</span><strong>{formatTime(row.minPaceSeconds)}–{formatTime(row.maxPaceSeconds)} <small>/ {unit}</small></strong></div>)}</div>
    <small className="running-data-note">Future sessions update only when a coach selects Assessment-Based Pace.</small>
   </>:<p className="footnote">Insufficient qualifying six-minute assessment data for training-zone estimates.</p>}
   {(recommendations.observed.mile||recommendations.observed.fourHundred)&&<details className="running-disclosure"><summary>Other recorded time trials</summary>{recommendations.observed.mile&&<p>One-mile trial · {formatTime(recommendations.observed.mile.paceSeconds)} / {unit} · {recommendations.observed.mile.date}</p>}{recommendations.observed.fourHundred&&<p>400 m trial · {formatTime(recommendations.observed.fourHundred.paceSeconds)} / {unit} · {recommendations.observed.fourHundred.date}. Shown separately from longer-run estimates.</p>}</details>}
  </section>

  <section className="panel running-section" aria-labelledby="running-interval-title">
   <div className="running-section-heading"><div><span className="running-kicker">COMPLETED INTERVALS</span><h3 id="running-interval-title">Running interval fatigue</h3></div></div>
   {!latest?<p className="footnote">Insufficient data. Record at least two comparable completed work intervals with actual distance and time or actual pace.</p>:<>
    <p className="running-session-meta">{latest.log.workoutDate||latest.log.createdAt?.slice(0,10)} · {latest.log.sessionName} · {latest.status}</p>
    <div className="running-summary-grid" aria-label="Running performance summary">{fatigueCards.map(([label,value])=><article className="running-summary-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    {latest.averageSpeedMps&&<>
     {/* Keep the existing chart component, graph styling, data, and placement in the interval section unchanged. */}
     <RunningPaceChart intervals={latest.intervals} unit={unit}/>
     <div className="running-insight"><span className="running-kicker">PERFORMANCE INSIGHT</span><p>{insight.statement}</p><small>{insight.suggestion}</small></div>
    </>}
    <div className="running-interval-table-wrap"><table className="running-interval-table"><thead><tr><th>Interval</th><th>Actual distance</th><th>Actual duration</th><th>Actual pace</th></tr></thead><tbody>{latest.intervals.map(row=><tr key={row.index}><th scope="row">{row.index}</th><td>{distance(row.meters,unit)}</td><td>{formatTime(row.seconds)}</td><td>{pace(row.speedMps,unit)}</td></tr>)}</tbody></table></div>
    {(latest.missing>0||latest.recordedRecoveries<latest.intervals.length-1)&&<p className="running-data-note">{latest.missing>0?`${latest.missing} incomplete or unmeasured work intervals were excluded. `:''}{latest.recordedRecoveries<latest.intervals.length-1?'Recovery was not recorded for every interval.':''}</p>}
    {intervalRows.length>0&&<details className="running-disclosure"><summary>Recent interval sessions</summary><div className="running-history-list">{intervalRows.slice(-6).reverse().map(row=><div className="running-history-row" key={row.log.id}><span>{row.log.workoutDate||row.log.createdAt?.slice(0,10)} · {row.intervals.length} work intervals</span><strong>{Number.isFinite(row.changePercent)?`${percent(row.changePercent)} velocity`:row.status}</strong></div>)}</div></details>}
    {repeatRows.length>0&&<section className="running-comparisons" aria-labelledby="running-comparison-title"><h4 id="running-comparison-title">Repeated workout comparisons</h4><p className="running-source">Only workouts that meet the existing comparability rules are shown.</p>{repeatRows.slice(-4).reverse().map(row=><article className="running-comparison-card" key={row.log.id}><div className="running-comparison-heading"><strong>{row.log.workoutDate||row.log.createdAt?.slice(0,10)}</strong><span>vs previous comparable</span></div><div className="running-comparison-grid"><div><span>Average speed</span><strong>{percent(row.averageSpeedChangePercent)}</strong></div><div><span>Pace variability</span><strong>{changePoints(row.variabilityChangePoints)}</strong></div><div><span>Speed decline</span><strong>{changePoints(row.fatigueChangePoints)}</strong></div></div><small>{row.recoveryComparison}</small></article>)}</section>}
    <details className="running-disclosure"><summary>Calculation methods and data limitations</summary><p>Interval pace and fatigue use completed actual work intervals only. Recovery intervals are excluded from work distance and pace. Early-to-late change compares average speed in the first and last halves; variability is the coefficient of variation of interval speeds. A missing actual distance, duration, or pace is not inferred from the prescription.</p><p>Repeat comparisons require the same workout name or benchmark version, matching interval counts, similar actual work durations, and complete measured work intervals. Recovery differences are included as context and do not make unlike workouts comparable.</p></details>
   </>}
  </section>
 </section>;
}
