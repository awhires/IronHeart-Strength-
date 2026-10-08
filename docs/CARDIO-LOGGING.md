# Cardio logging improvements

Prescriptions are shown automatically as compact interval rows. Targets retain distance, duration, pace basis, RPE and programmed recovery separately from blank actual results. Reopening saved results preserves their values; copying a previous interval copies actual metrics without marking the next interval complete or copying its recovery.

On mobile, interval completion and distance/time/pace remain visible. Power, cadence, calories, RPE, actual recovery and the programmed recovery countdown expand on demand. The countdown is a convenience timer and does not add work duration or overwrite recorded recovery.

Running pace supports min/km and min/mi independently of distance units. RowErg and SkiErg use min/500 m. Actual distance and duration calculate pace automatically. Existing explicit historical pace values remain compatible. Work totals exclude recovery metadata.

Handwriting review supports structured cardio prescriptions, timed weighted holds, and explicit sequential loads (for example two sets of twenty at 70 then 80 lb). A load range without sequential evidence remains ambiguous and is flagged for review. Imported prescriptions do not become invented actual results. Athlete review remains required before saving.

## Compatibility

The existing JSON storage architecture is retained. Additive fields include optional completion, running pace basis, actual recovery, and prescription snapshots/interval blocks. Existing strength, mixed workout, retry, history and journal flows remain supported. No database schema migration is required.

## Validation

- Unit/API regression suite: 139 passed, 0 failed.
- Browser regression suite: 9 passed, 0 failed, including 360 px and 390 px mobile layouts and desktop.
- Vite production build: passed.
- Mobile screenshot reviewed: `output/qa/cardio-intervals-360.png`.
- Test logs: `output/cardio-tests.log`, `output/cardio-browser-tests.log`, `output/cardio-build.log`.

Scan interpretation and scan-to-save behavior were tested with deterministic mocked AI responses. Live handwriting recognition and a physical Android device were not exercised in this task.
