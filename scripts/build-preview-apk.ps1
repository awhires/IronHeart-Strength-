$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$projectRoot = (Get-Location).Path
$toolRoot = Join-Path $projectRoot 'tmp/android-tools'
$env:JAVA_HOME = (Get-ChildItem "$toolRoot/java" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $toolRoot 'sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle'
if (!(Test-Path "$env:JAVA_HOME/bin/java.exe") -or !(Test-Path "$env:ANDROID_HOME/platforms/android-36")) { throw 'Install Java 21 and Android SDK 36 in tmp/android-tools first.' }
if (!(Test-Path 'android/preview.keystore')) {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore android/preview.keystore -storepass android -keypass android -alias androiddebugkey -dname 'CN=Iron Heart Preview' -validity 10000 -keyalg RSA -keysize 2048
    if ($LASTEXITCODE -ne 0) { throw 'Preview signing key creation failed' }
}
$oldDemo = $env:VITE_STANDALONE_DEMO
$originalConfig = [IO.File]::ReadAllText("$projectRoot/capacitor.config.json")
try {
    $env:VITE_STANDALONE_DEMO = 'true'
    & node node_modules/vite/bin/vite.js build --outDir tmp/apk-web
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
    $config = $originalConfig | ConvertFrom-Json
    $config.webDir = 'tmp/apk-web'
    $config.android.allowMixedContent = $true # Debug preview only; keep HTTPS storage origin for existing device data.
    [IO.File]::WriteAllText("$projectRoot/capacitor.config.json", ($config | ConvertTo-Json -Depth 10))
    & node node_modules/@capacitor/cli/bin/capacitor sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed' }
} finally {
    [IO.File]::WriteAllText("$projectRoot/capacitor.config.json", $originalConfig)
    $env:VITE_STANDALONE_DEMO = $oldDemo
}
Push-Location android
try {
    & ./gradlew.bat assembleDebug --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'APK compilation failed' }
} finally { Pop-Location }
New-Item -ItemType Directory -Force -Path output/apk | Out-Null
Copy-Item -LiteralPath android/app/build/outputs/apk/debug/app-debug.apk -Destination output/apk/Iron-Heart-Strength-preview.apk -Force
& "$env:ANDROID_HOME/build-tools/35.0.0/apksigner.bat" verify --verbose output/apk/Iron-Heart-Strength-preview.apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
& (Join-Path $PSScriptRoot 'verify-preview-apk.ps1')
$apkHash = (Get-FileHash output/apk/Iron-Heart-Strength-preview.apk -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText("$projectRoot/output/apk/SHA256.txt", "$apkHash  Iron-Heart-Strength-preview.apk`n")
Write-Output "Verified APK: $projectRoot/output/apk/Iron-Heart-Strength-preview.apk"
