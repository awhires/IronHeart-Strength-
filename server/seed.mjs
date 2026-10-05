import {additionalExercises} from '../shared/exercise-library.mjs';
export const exercises = [
  ['squat','Barbell Back Squat','Lower body','Barbell','Squat','Keep your whole foot grounded. Brace before descending; drive up with control.','bEv6CCg2BC8'],
  ['bench','Barbell Bench Press','Upper body','Barbell','Push','Set your shoulder blades. Lower with control and keep your feet planted.','rT7DgCr-3pg'],
  ['deadlift','Conventional Deadlift','Lower body','Barbell','Hinge','Brace, keep the bar close, and push the floor away. Reset each rep.','op9kVnSso6Q'],
  ['rdl','Romanian Deadlift','Lower body','Barbell','Hinge','Soften your knees, move your hips back, and keep a neutral spine.','JCXUYuzwNrM'],
  ['row','Bent-over Barbell Row','Upper body','Barbell','Pull','Hinge and brace. Pull toward your lower ribs without swinging.','vT2GjY_Umpw'],
  ['press','Standing Overhead Press','Upper body','Barbell','Push','Squeeze your glutes, brace your trunk, and press overhead without arching.','2yjwXTZQDDI'],
  ['pullup','Pull-up','Upper body','Bodyweight','Pull','Start with control, pull your chest toward the bar, and lower fully.','eGo4IYlbE5g'],
  ['lunge','Dumbbell Walking Lunge','Lower body','Dumbbell','Lunge','Step into a stable stance. Keep your front knee aligned with your foot.','L8fvypPrzzs'],
  ['goblet','Goblet Squat','Lower body','Dumbbell','Squat','Hold the weight close to your chest and sit between your hips.','MeIiIdhvXT4'],
  ['plank','Forearm Plank','Core','Bodyweight','Brace','Brace your midsection and breathe. Each rep is one controlled breath.','ASdvN_XEl_c'],
  ['incline','Incline Dumbbell Press','Upper body','Dumbbell','Push','Keep your shoulders set and lower both dumbbells with control.','8iPEnn-ltC8'],
  ['bridge','Glute Bridge','Lower body','Bodyweight','Hinge','Drive through your heels and extend the hips without arching the back.','wPM8icPu6H8']
].map(([id,name,region,equipment,pattern,cues,video]) => ({id,name,region,equipment,pattern,cues,video})).concat(additionalExercises);
const item = (exerciseId, sets, reps, load, rest=120) => ({exerciseId,sets,reps,load,rest,rpe:7,increment:2.5,notes:''});
export const programs = [
  {id:'strength-foundations', name:'Strength Foundations', goal:'Build strength', weeks:8, description:'A balanced three-day block built around the fundamental movement patterns.', sessions:[
    {name:'Lower Body · Strength',exercises:[item('squat',4,6,60,180),item('rdl',3,8,40),item('lunge',3,10,10,90),item('plank',3,8,0,60)]},
    {name:'Upper Body · Strength',exercises:[item('bench',4,6,40,180),item('row',3,8,30),item('press',3,8,20),item('pullup',3,6,0)]},
    {name:'Full Body · Build',exercises:[item('deadlift',3,5,70,180),item('incline',3,10,15),item('goblet',3,10,20),item('bridge',3,12,0,60)]}
  ]},
  {id:'athletic-base',name:'Athletic Base',goal:'General performance',weeks:4,description:'A lower-volume foundation for athletes returning to consistent training.',sessions:[
    {name:'Full Body A',exercises:[item('goblet',3,8,15),item('bench',3,8,30),item('row',3,10,25)]},
    {name:'Full Body B',exercises:[item('rdl',3,8,30),item('press',3,8,15),item('lunge',3,8,10)]}
  ]}
];
programs.forEach(p=>p.sessions.forEach((s,i)=>s.day=[1,3,5,6,2,4,0][i]));
