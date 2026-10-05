// Additive catalog update; existing coach records take precedence.
export const LIBRARY_UPDATE='chest-back-legs-2026-10';
const groups=[
 ['Upper body','Push',[
  ['db-bench','Dumbbell Bench Press','Dumbbell'],['incline-barbell','Incline Barbell Bench Press','Barbell'],
  ['decline-barbell','Decline Barbell Bench Press','Barbell'],['decline-dumbbell','Decline Dumbbell Bench Press','Dumbbell'],
  ['machine-chest-press','Machine Chest Press','Machine'],['smith-press','Smith Machine Chest Press','Machine'],
  ['pushup-standard','Standard Push-up','Bodyweight'],['pushup-weighted','Weighted Push-up','Bodyweight'],
  ['pushup-close','Close-grip Push-up','Bodyweight'],['pushup-wide','Wide Push-up','Bodyweight'],
  ['chest-dip','Bodyweight Chest Dip','Bodyweight'],['chest-dip-weighted','Weighted Chest Dip','Bodyweight'],
  ['db-fly','Dumbbell Fly','Dumbbell'],['incline-fly','Incline Dumbbell Fly','Dumbbell'],
  ['cable-fly','Cable Fly','Cable'],['cable-fly-low-high','Low-to-high Cable Fly','Cable'],
  ['cable-fly-high-low','High-to-low Cable Fly','Cable'],['pec-deck','Pec Deck','Machine']
 ]],
 ['Upper body','Pull',[
  ['pullup-weighted','Weighted Pull-up','Bodyweight'],['pullup-neutral','Neutral-grip Pull-up','Bodyweight'],
  ['chinup','Chin-up','Bodyweight'],['chinup-weighted','Weighted Chin-up','Bodyweight'],
  ['lat-pulldown','Lat Pulldown','Cable'],['lat-pulldown-close','Close-grip Lat Pulldown','Cable'],
  ['pendlay-row','Pendlay Row','Barbell'],['one-arm-row','One-arm Dumbbell Row','Dumbbell'],
  ['chest-supported-row','Chest-supported Dumbbell Row','Dumbbell'],['seated-cable-row','Seated Cable Row','Cable'],
  ['machine-row','Machine Row','Machine'],['t-bar-row','T-bar Row','Barbell'],['inverted-row','Inverted Row','Bodyweight'],
  ['straight-arm-pulldown','Straight-arm Pulldown','Cable'],['cable-pullover','Cable Pullover','Cable'],
  ['db-pullover','Dumbbell Pullover','Dumbbell'],['face-pull','Face Pull','Cable'],['meadows-row','Meadows Row','Barbell']
 ]],
 ['Lower body','Squat',[
  ['front-squat','Front Squat','Barbell'],['box-squat','Box Squat','Barbell'],['hack-squat','Hack Squat','Machine'],['leg-press','Leg Press','Machine']
 ]],
 ['Lower body','Lunge',[
  ['bulgarian-split-squat','Bulgarian Split Squat','Dumbbell'],['reverse-lunge','Reverse Lunge','Dumbbell'],['step-up','Step-up','Dumbbell']
 ]],
 ['Lower body','Hinge',[
  ['sumo-deadlift','Sumo Deadlift','Barbell'],['trap-bar-deadlift','Trap Bar Deadlift','Barbell'],['hip-thrust','Hip Thrust','Barbell']
 ]],
 ['Lower body','Knee extension',[['leg-extension','Leg Extension','Machine']]],
 ['Lower body','Knee flexion',[['lying-leg-curl','Lying Leg Curl','Machine'],['seated-leg-curl','Seated Leg Curl','Machine']]]
];
const cues={Push:'Set a stable position, brace your trunk, and control both directions through a comfortable range.',Pull:'Keep your trunk steady and control the pull and return without swinging.',Squat:'Brace before descending, keep your feet grounded, and stand with control.',Lunge:'Use a stable stance and keep the working knee aligned with your foot.',Hinge:'Brace your trunk and extend through the hips without overextending your back.','Knee extension':'Adjust the machine pivot to your knee and extend with control.','Knee flexion':'Adjust the pads and curl with a controlled return.'};
export const additionalExercises=groups.flatMap(([region,pattern,items])=>items.map(([id,name,equipment])=>({id,name,region,equipment,pattern,cues:cues[pattern],video:''})));
const normalized=name=>String(name||'').toLowerCase().replace(/dumbbells?/g,'db').replace(/barbells?/g,'bb').replace(/push[ -]?ups?/g,'pushup').replace(/pull[ -]?ups?/g,'pullup').replace(/chin[ -]?ups?/g,'chinup').replace(/step[ -]?ups?/g,'stepup').replace(/face pulls/g,'face pull').replace(/[^a-z0-9]/g,'');
const aliases={
 'db-bench':['Dumbbell Chest Press'],'incline-barbell':['Incline Barbell Press'],
 'decline-barbell':['Decline Barbell Press'],'decline-dumbbell':['Decline Dumbbell Press'],
 'smith-press':['Smith Machine Press'],'pushup-standard':['Push-up'],
 'chest-dip':['Chest Dip','Chest Dips','Bodyweight Dips'],'chest-dip-weighted':['Weighted Dips','Weighted Chest Dips'],
 'incline-fly':['Incline Fly'],'cable-fly':['Regular Cable Fly'],
 'pullup-neutral':['Neutral Grip Pull-up'],'lat-pulldown':['Regular Lat Pulldown'],
 'one-arm-row':['Single-arm Dumbbell Row'],'face-pull':['Face Pulls']
};
export function missingLibraryExercises(existing){
 const ids=new Set(existing.map(e=>e.id)),names=new Set(existing.map(e=>normalized(e.name)));
 return additionalExercises.filter(e=>!ids.has(e.id)&&![e.name,...(aliases[e.id]||[])].some(name=>names.has(normalized(name)))).map(e=>({...e}));
}
