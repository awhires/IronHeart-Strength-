param([string]$BackendUrl='https://ironheart-strength-1.onrender.com', [string]$Version='1.7')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$projectRoot=(Get-Location).Path
if($Version -notmatch '^\d+\.\d+$'){throw 'Use a numeric version.'}
$backend=[Uri]$BackendUrl
if($backend.Scheme -ne 'https' -or $backend.IsLoopback -or $backend.UserInfo){throw 'Use a hosted HTTPS backend without credentials.'}
$nodeRoot='C:\Users\austi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$node=Join-Path $nodeRoot 'bin/node.exe'
$env:PATH=(Join-Path $nodeRoot 'bin')+';'+$env:PATH
$env:JAVA_HOME=(Get-ChildItem 'tmp/android-tools/java' -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME=Join-Path $projectRoot 'tmp/android-tools/sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:VITE_API_URL=$BackendUrl
$env:VITE_STANDALONE_DEMO='false'
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
& $node scripts/check-android.mjs
if($LASTEXITCODE -ne 0){throw 'Backend configuration failed.'}
& $node node_modules/vite/bin/vite.js build
if($LASTEXITCODE -ne 0){throw 'Web build failed.'}
& $node node_modules/@capacitor/cli/bin/capacitor sync android
if($LASTEXITCODE -ne 0){throw 'Capacitor sync failed.'}
# Build outside OneDrive to avoid cloud reparse files in Gradle hashing.
$stage=Join-Path ([IO.Path]::GetTempPath()) ('IronHeart-Android-'+$Version+'-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
& robocopy (Join-Path $projectRoot 'android') (Join-Path $stage 'android') /E /XD build .gradle /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Android staging failed.'}
$settings=[IO.File]::ReadAllText((Join-Path $projectRoot 'android/capacitor.settings.gradle'))
$relative=[regex]::Match($settings,"new File\('([^']+)'\)").Groups[1].Value
if(!$relative.StartsWith('../node_modules/') -or $relative.Substring(3).Contains('..')){throw 'Unexpected Capacitor module path.'}
$moduleSource=[IO.Path]::GetFullPath((Join-Path (Join-Path $projectRoot 'android') $relative))
$moduleTarget=[IO.Path]::GetFullPath((Join-Path (Join-Path $stage 'android') $relative))
if(!$moduleSource.StartsWith((Join-Path $projectRoot 'node_modules')) -or !$moduleTarget.StartsWith((Join-Path $stage 'node_modules'))){throw 'Invalid staging path.'}
& robocopy $moduleSource $moduleTarget /E /XD build .gradle /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Capacitor staging failed.'}
$env:GRADLE_USER_HOME=Join-Path $stage 'gradle-home'
$cache=Get-ChildItem ([IO.Path]::GetTempPath()) -Directory -Filter 'IronHeart-Android-1.5-*' | Select-Object -First 1
$cacheSource=if($cache -and (Test-Path (Join-Path $cache.FullName 'gradle-home/wrapper'))){Join-Path $cache.FullName 'gradle-home'}else{Join-Path $projectRoot 'tmp/android-tools/gradle'}
& robocopy $cacheSource $env:GRADLE_USER_HOME /E /XD daemon /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Gradle cache staging failed.'}
Push-Location (Join-Path $stage 'android')
try{& ./gradlew.bat assembleDebug --offline --no-daemon --console=plain; if($LASTEXITCODE -ne 0){throw 'Android build failed.'}}finally{Pop-Location}
$apk=Join-Path $projectRoot "output/apk/Iron-Heart-Strength-$Version-production-preview.apk"
Copy-Item -LiteralPath (Join-Path $stage 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $apk -Force
& "$env:ANDROID_HOME/build-tools/35.0.0/apksigner.bat" verify --verbose --print-certs $apk
if($LASTEXITCODE -ne 0){throw 'Signature verification failed.'}
& (Join-Path $PSScriptRoot 'verify-preview-apk.ps1') -ApkPath $apk
$hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText($apk.Replace('.apk','.sha256.txt'),"$hash  $([IO.Path]::GetFileName($apk))`n")
Write-Output "APK: $apk"
Write-Output "Staging: $stage"
