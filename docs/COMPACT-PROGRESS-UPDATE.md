# Compact Progress presentation update

This update changes presentation only. The NSCA calculation module, centered five-month window helper, data storage, goal endpoint and workout history behavior are unchanged.

Changes:
- One compact graph card contains exercise selection, NSCA label, rep-max tabs, five-month chart, current/previous estimates, change and goal summary.
- Edit Goal / Set Goal opens the existing goal form; saving closes it. Cancel discards unsaved input.
- Actual performed records, monthly source workouts and estimation details are compact expandable rows. Source and actual-workout links remain available.
- Smaller spacing, controls and chart drawing area follow the existing Iron Heart dark glass design. Dynamic Y-axis values are unchanged.
- Bottom safe-area padding and scroll margins keep expanded controls accessible above the fixed mobile navigation.

Files changed for this follow-up:
- src/StrengthProgress.jsx
- src/iron-heart-mobile.css (scoped .compact-progress styles)
- tests/ui/strength-progress.browser.mjs
- docs/COMPACT-PROGRESS-UPDATE.md (this report)

Validation:
- Model/backend regression suite: 168 passed, 0 failed.
- Focused Progress browser test: 4 passed, 0 failed (desktop plus two touch-mobile sizes).
- Production build passed.
- Phone viewport measurements: main card 426.6 px tall at 390x844 and 410.5 px at 360x740, including the saved-goal confirmation. Both fit above fixed navigation at the page top. At the page end, the final control has approximately 98 px clearance above navigation. Expanded goal Save buttons were also checked for clearance.
- Verified goal save/reload/coach access, all four rep-max selectors, source/actual workout access, estimate values, October centering and January year boundaries.
- Tests used mobile browser emulation with touch enabled, not a physical Android device or keyboard.

Evidence:
- output/qa/compact-progress-unit.txt
- output/qa/compact-progress-browser.txt
- output/qa/compact-progress-full-browser.txt
- output/qa/compact-progress-build.txt
- output/qa/compact-progress/viewport-checks.json

Screenshots:
- [390 px compact Progress](../output/qa/compact-progress/progress-390.png)
- [360 px compact Progress](../output/qa/compact-progress/progress-360.png)
- [Expanded goal editor](../output/qa/compact-progress/goal-editor-360.png)
- [Desktop](../output/qa/compact-progress/progress-1440.png)

No push, Render deployment, migration, or APK packaging was performed.

Full browser regression result: 19 passed, 0 failed (including all existing workout, scan, enrollment, retry and Metcon browser coverage).
