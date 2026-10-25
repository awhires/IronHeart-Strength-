# Running analytics methods and limits

Iron Heart keeps distance in meters and time in seconds for calculations. Display pace is seconds per selected mile or kilometer. Only actual completed work intervals contribute to fatigue or assessment results; prescribed targets and recoveries do not.

## Six-minute field test

A coach prescribes one 360-second running effort and saves it as a six-minute assessment benchmark. The athlete records actual distance and elapsed time and explicitly confirms maximal effort. The result qualifies only if the benchmark is completed without a material prescription change, actual distance and time are present, and elapsed time is within one second of 360. Average velocity is `actual meters / actual seconds`. This is called a **six-minute field-test velocity (vVO₂max proxy)**, never measured VO₂max or oxygen consumption. An incomplete or nonmaximal attempt remains in history but produces no training-zone estimate. The qualification tolerance is strict because the score is for a fixed-duration test; if an athlete stops early, the attempt should be visible without becoming a six-minute baseline.

The [six-minute run validation study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10907109/) supports the use of six-minute performance as a practical field indicator of running fitness, but did not measure oxygen consumption during the test. The proxy label reflects that limitation.

## Pace suggestions

The latest qualifying six-minute velocity is multiplied by explicit coaching starting bands: easy `0.55–0.70`, threshold-oriented `0.75–0.85`, VO₂max-oriented `0.90–1.05`, and short faster intervals `1.05–1.15`. Pace is `meters per selected distance unit / suggested velocity`; the UI presents a range and, only when the coach clicks **Use**, writes its midpoint as a prescribed pace. These bands are transparent coaching heuristics, not measured lactate threshold or individualized physiological zones. The [interval training review](https://pubmed.ncbi.nlm.nih.gov/16596093/) describes work near 90–105% of laboratory vVO₂max; using a six-minute field proxy is an inference and is labeled accordingly. Coaches can edit or discard any suggested pace. The source test and date remain attached to a selected recommendation.

Completed mile and 400 m fixed-distance benchmarks are displayed as *observed time-trial paces* with their own dates and method labels. They are not substituted for six-minute-derived zone estimates. No data means no estimate. A changed or incomplete benchmark does not qualify.

## Interval fatigue

For a completed running workout, each completed work interval needs actual time plus distance or actual pace. Work distance may be computed from logged time and logged pace; never from the prescription. Recovery time is listed separately and recovery distance is excluded. At least two measured work intervals are required. Intervals with durations differing by more than 10% are marked non-comparable. For comparable intervals, average pace uses total work distance divided by total work time; first-to-last velocity change and the coefficient of variation of interval velocities describe pacing consistency. The direction label follows the measured sign of the first-to-last change, without a universal fatigue cutoff. These are descriptive workout metrics, not a diagnosis of physiological fatigue.

Historical logs, prescribed targets, and benchmark definitions are left untouched. Edited actual workout results are recomputed from the latest saved log.

## Work-to-recovery prescriptions

The threshold running preset is this coach's preferred **work:recovery 1:0.75**, not a universal physiological rule. Suggested recovery is the single block's work duration multiplied by 0.75 and rounded to the nearest second. A coach explicitly applies the preset or enters and applies a custom ratio; changing the work duration clears the rule marker and the coach can apply it again. Manual recovery edits clear the rule marker and preserve the entered duration. No ratio is assumed for VO₂max, speed, or other sessions. The preset catalog is separate from saved workout-specific values so later coaching-method presets can be added without rewriting historical prescriptions.

Different work durations use separate interval blocks, each with its own ratio and recovery. Mixed-duration segments within one block can still be prescribed manually; a ratio is not applied to them because the current block model has one shared recovery. Recovery after the final repetition is an explicit option for new structured blocks. Legacy blocks keep their established behavior. Recovery pace and work pace are stored separately, and neither is copied into actual performance.

An ordered running segment can also be explicitly marked **Work** or **Recovery**. Automatic assessment pace changes and work-interval analytics skip segments marked Recovery. Older segments without this marker retain their previous work classification; labels alone are not used to guess which historical segments were recoveries.

Across repeated sessions, the Progress view compares average completed work speed only for the same benchmark version or workout name, the same number of fully measured intervals, and work durations within 10% at matching positions. Partially measured or otherwise different workouts remain visible without a cross-session percentage comparison.

## Automatic athlete-specific paces

The coach may choose **Fixed Pace** or **Assessment-Based Pace** on a running prescription. The saved assessment method identifies its source, training category, and pace unit. Six-minute maximal-effort field tests support the four documented training bands above. Mile, 400 m, and coach-selected compatible fixed-distance running benchmarks support their **observed time-trial pace** only; they are not substituted into the six-minute training bands. A coach selects the method once. Each athlete's latest qualifying completed assessment is then resolved independently when a program is assigned and after a new or corrected workout result. If none qualifies, the future prescription says the pace is unavailable. No target is inferred from a prescribed assessment.

Only future uncompleted assignment sessions are recalculated. A changed target increments the existing `prescriptionRevision`, so an already-open workout cannot save against an outdated pace. Completed workout snapshots, recorded results, master programs, fixed coach paces, work and recovery durations, recovery ratios, and recovery pace stay unchanged. Repeating the same calculation without new qualifying evidence does not write another assignment revision. Manually editing or locking a pace switches that exercise back to Fixed Pace.

## Pace chart and speed-loss interpretation

Progress → Cardio plots each completed, measured work interval against its interval number. Axis labels, tooltips, and details show `M:SS` per selected mile or kilometer; smaller pace times appear higher on the chart and mean faster running. Missing, incomplete, recovery, and prescribed-only intervals do not enter the chart.

For a session with comparable work intervals, the first and last `floor(interval count / 2)` intervals form the early and late groups. Each group's mean speed is its **actual work distance / actual work time**. Early-to-late speed loss is `(early mean speed − late mean speed) / early mean speed × 100`; a negative value means later intervals were faster. The view also reports the first-to-last velocity change and the coefficient of variation of measured interval velocities. Explanations describe those observed numbers and invite review of starting pace and recorded recovery; they do not diagnose endurance or set a universal fatigue cutoff. Comparisons across repeat sessions report changes in average speed, variability, and speed loss, with a caution when recovery is different or unrecorded.
