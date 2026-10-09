param([ValidateSet('dev','start','build','test','db:local','db:migrate','db:seed','typecheck','test:integration','test:e2e')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$taskNode = Join-Path (Get-Location) '.tools/node-v22.23.3-win-x64'
if (Test-Path (Join-Path $taskNode 'node.exe')) { $env:PATH = "$taskNode;$env:PATH" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 LTS, then run this script again.' }
if ($Task -eq 'test') { & npm.cmd test } else { & npm.cmd run $Task }
exit $LASTEXITCODE
