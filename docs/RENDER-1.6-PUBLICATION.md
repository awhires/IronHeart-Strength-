# Iron Heart 1.6 publication

This publication updates the existing React frontend, Node backend, shared contracts/scheduling, tests and supporting scripts/documentation on `awhires/IronHeart-Strength-` main. These are the application sources used for the verified 1.6 APK. The repository's legacy Flutter native project is not replaced as part of this backend publication. APKs, Capacitor signing material, local databases, environment files and build output are excluded.

The commit includes `[skip render]` to prevent an automatic deployment. Render documents this marker at https://render.com/docs/deploys#skipping-an-auto-deploy. No Render service operation, deployment, database operation or disk change is part of this publication.

## Required configuration for 1.6

There are **no new 1.6 environment variables, dependencies, SQL migrations or persistent-disk requirements**. Keep the working 1.5 production configuration:

| Setting | Required value / behavior |
| --- | --- |
| Node runtime | Node 24, as declared in package.json |
| Build | `npm install --include=dev && npm run build`, or the existing equivalent that installs Vite during build |
| Start | `npm start` (runs `node server/index.mjs --production`) |
| HOST | `0.0.0.0` |
| PORT | Render-provided value; no hardcoded port change |
| NODE_ENV | `production` |
| DEMO_MODE | `false` |
| DB_PATH | `/var/data/iron-heart.sqlite` |
| Persistent disk mount | Existing `/var/data`, unchanged |
| AI and coach credentials | Retain existing private server settings; no new keys required |
| Allowed origins | Retain working settings; default `https://localhost` supports the Capacitor APK |

Vite is already declared as a development dependency. If the existing successful Render build command includes development dependencies, **no configuration change is required**. If it is only `npm install && npm run build` with development dependencies omitted under production, explicitly add `--include=dev` to the install command before the later deployment. No package/dependency changes are introduced by this release.

The supplied production disk/database settings were reported by the owner; this publication does not reconfigure or migrate them. The code continues storing additive fields in the existing SQLite JSON records. The existing schema, authentication, save receipts and workout history remain intact.

## Verification and later deployment

The publication checkout is checked against the verified local 1.6 source, scanned for forbidden local files, recognizable credential patterns and known local secret values, and tested before push. The release's full automated suite has 130 tests; browser coverage has 8 test entries across the two suites. Exact publication-run outcomes are reported with the pushed commit hash.

When the owner chooses to deploy later, use the existing Render service and manually deploy this commit/main. The 1.6 APK already points to `https://ironheart-strength-1.onrender.com`; no replacement backend URL or service is needed. The new enrollment, rescheduling and modality context endpoints become available only after that deployment.
