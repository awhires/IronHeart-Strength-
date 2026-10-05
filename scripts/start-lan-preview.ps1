$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:HOST = '0.0.0.0'
$env:PORT = '4173'
$env:ALLOWED_ORIGINS = 'http://localhost,https://localhost'
Write-Output 'Iron Heart LAN preview. Keep this terminal open. Use this only on your trusted private Wi-Fi.'
[Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.ToString() -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | ForEach-Object { Write-Output "Phone API address: http://$($_.Address):4173" }
& node --env-file=.env.ai.local server/index.mjs
if ($LASTEXITCODE -ne 0) { throw 'LAN server stopped. Close the existing server using port 4173 before starting this script.' }
