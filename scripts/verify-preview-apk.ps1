param([string]$ApkPath='')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if(!$ApkPath){$ApkPath = Join-Path $PSScriptRoot '../output/apk/Iron-Heart-Strength-preview.apk'}
$secretValues = @()
$envPath = Join-Path $PSScriptRoot '../.env.ai.local'
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        if ($line -match '^\s*(?:OPENAI_API_KEY|GEMINI_API_KEY|COACH_PASSWORD)\s*=\s*(.+)$') {
            $candidate = $Matches[1].Trim().Trim('"').Trim("'")
            if ($candidate.Length -ge 12) { $secretValues += $candidate }
        }
    }
}
foreach ($varName in @('OPENAI_API_KEY','GEMINI_API_KEY','COACH_PASSWORD')) {
    $candidate = [Environment]::GetEnvironmentVariable($varName)
    if ($candidate -and $candidate.Length -ge 12) { $secretValues += $candidate }
}
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($apkPath))
$count = 0
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '(?i)(^|/)(\.env[^/]*|preview\.keystore)$') { throw 'Credential/config file detected in APK.' }
        $stream = $entry.Open()
        $memory = New-Object IO.MemoryStream
        try { $stream.CopyTo($memory); $content = [Text.Encoding]::UTF8.GetString($memory.ToArray()) }
        finally { $stream.Dispose(); $memory.Dispose() }
        if ($content -match 'OPENAI_API_KEY|GEMINI_API_KEY|COACH_PASSWORD|api\.openai\.com/v1/responses|generativelanguage\.googleapis\.com|sk-proj-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}') { throw 'Provider credentials or server implementation detected in APK.' }
        foreach ($secret in $secretValues) { if ($content.Contains($secret)) { throw 'Configured server credential detected in APK.' } }
        $count++
    }
} finally { $archive.Dispose(); $secretValues = @() }
Write-Output "APK credential scan passed ($count entries); no server API keys or provider implementations found."
