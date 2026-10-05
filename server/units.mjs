export const toPounds = value => Math.round(value * 2.2046226218 * 4) / 4;

// One-time atomic conversion of the original kilogram records. Stored loads,
// increments, and historical target snapshots all use pounds after this runs.
export function migrateToPounds(db) {
  if (db.prepare("SELECT value FROM metadata WHERE key='weight-unit'").get()?.value === 'lbs') return;
  const convert = item => {
    if (Number.isFinite(item.load)) item.load = toPounds(item.load);
    if (Number.isFinite(item.increment)) item.increment = Math.max(.25,toPounds(item.increment));
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of db.prepare("SELECT kind,id,body FROM records WHERE kind IN ('program','assignment','log')").all()) {
      const record=JSON.parse(row.body);
      if(row.kind==='program')record.sessions.forEach(s=>s.exercises.forEach(convert));
      if(row.kind==='assignment')record.plan.forEach(w=>w.sessions.forEach(s=>s.exercises.forEach(convert)));
      if(row.kind==='log')record.exercises.forEach(e=>{convert(e.target);e.sets.forEach(convert);});
      db.prepare('UPDATE records SET body=? WHERE kind=? AND id=?').run(JSON.stringify(record),row.kind,row.id);
    }
    db.prepare("INSERT INTO metadata(key,value) VALUES('weight-unit','lbs') ON CONFLICT(key) DO UPDATE SET value='lbs'").run();
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
