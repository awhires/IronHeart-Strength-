import {readFileSync,writeFileSync} from 'node:fs';
const path='src/main.jsx';let text=readFileSync(path,'utf8');
text=text.replaceAll('Kilograms (kg)','Pounds (lbs)').replaceAll(' kg',' lbs').replaceAll('(kg)','(lbs)').replaceAll('<span>KG</span>','<span>LBS</span>');
text=text.replaceAll("'Load (lbs)',0,500", "'Load (lbs)',0,1100").replaceAll("'Step (lbs)',0.25,10", "'Step (lbs)',0.25,25").replaceAll("['load',0,500,.25]", "['load',0,1100,.25]");
writeFileSync(path,text);
const server='server/index.mjs';let api=readFileSync(server,'utf8');
api=api.replaceAll('num(e.load,0,500)','num(e.load,0,1100)').replaceAll('num(x.load,0,500)','num(x.load,0,1100)').replaceAll('num(e.increment,0.25,10)','num(e.increment,0.25,25)').replaceAll('load 0–500 kg','load 0–1100 lbs');
writeFileSync(server,api);
const readme='README.md';let doc=readFileSync(readme,'utf8').replace('Units are currently kilograms.','Units are pounds (lbs). Legacy kilogram loads, progression increments, and logged targets are converted once to the nearest 0.25 lb when the database opens.');writeFileSync(readme,doc);
