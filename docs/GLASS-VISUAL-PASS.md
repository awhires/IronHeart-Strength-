# Iron Heart smoked-glass visual pass

This pass changes styling only. No component layout, navigation structure,
Progress behavior, calculations, workout data, grouped-set behavior, cardio
interval behavior, API behavior, or database representation changed.

## Visual treatment

- Primary cards now use low-opacity dark glass with backdrop blur and subtle
  saturation, allowing the atmospheric background to remain visible.
- The background combines dark radial light, restrained equipment-like lines,
  plate/ring silhouettes, and fine horizontal texture. It uses CSS only and
  adds no external asset or network dependency.
- Hairline semi-transparent borders, internal highlights, and soft deep shadows
  create separation between the page, primary cards, nested controls, and
  overlays.
- Inputs and nested controls use inset smoked surfaces instead of opaque gray.
- Selected tabs, primary buttons, and navigation states use deeper red
  gradients with restrained shadow and luminosity.
- Top navigation, athlete bottom navigation, side navigation, dialogs, modals,
  bottom sheets, More menu, and Exercise Library use stronger frosted glass.
- Existing Iron Heart wordmark and heart assets remain unchanged.
- `prefers-reduced-transparency` retains an opaque high-contrast fallback.

The shared finish applies across athlete Home, Training, Workout Tracker,
exercise logging, grouped strength, cardio intervals, Progress, More, Exercise
Library, AI Builder/review, coach programming, and modal surfaces.

## Verification

- Production Vite build: passed, 1,637 modules.
- Model/backend regression suite: 168 passed, 0 failed.
- Complete browser suite: 19 passed, 0 failed.
- Dedicated visual/workflow screenshot tour: 6 passed, 0 failed at 390 px
  mobile and 1,440 px desktop.
- Existing 360 px Android-sized browser coverage also passed.

## Mobile review screenshots

- [Home](../output/qa/glass-review/home.png)
- [Workout Tracker](../output/qa/glass-review/workout-tracker.png)
- [Grouped Strength Logging](../output/qa/glass-review/grouped-strength.png)
- [Cardio Logging](../output/qa/glass-review/cardio-summary.png)
- [Progress](../output/qa/glass-review/progress.png)

Build and test logs:

- `output/qa/glass-build.txt`
- `output/qa/glass-screenshots.txt`
- `output/qa/glass-full-browser.txt`

No GitHub push, Render deployment, database migration, or APK packaging was
performed.
