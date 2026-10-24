import {convertDistance} from './tracking.mjs';

const number=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2});

// Cardio statistics remain in meters. Only the athlete-facing text changes.
export function formatCardioDistance(meters,unit='mi',swimming=false){
 if(meters==null||!Number.isFinite(Number(meters)))return '—';
 const target=swimming?(unit==='km'?'m':'yd'):unit==='yd'?'yd':unit==='km'?'km':'mi';
 return `${number(convertDistance(Number(meters),'m',target))} ${target}`;
}

export function formatCardioSpeed(metersPerSecond,unit='mi'){
 if(metersPerSecond==null||!Number.isFinite(Number(metersPerSecond)))return '—';
 const target=unit==='km'?'km':'mi';
 return `${number(convertDistance(Number(metersPerSecond),'m',target)*3600)} ${target==='km'?'km/h':'mph'}`;
}
