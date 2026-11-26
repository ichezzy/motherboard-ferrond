<#
  Copy Motherboard: Ferrond to the Foundry server (via SSH).

  Run from the repo folder:
    powershell -ExecutionPolicy Bypass -File tools\deploy.ps1

  The target lives in tools\target.txt (not in git), e.g.
    myserver:/srv/foundry/Data/modules/motherboard-ferrond
  The last folder name must be the module id from module.json.

  Steps: tests -> copy only the module files to a staging folder ->
  scp into a folder next to the target -> swap the old folder ->
  same owner as the "modules" folder.

  Compendiums: Foundry keeps the packs of a running world open. Replacing their files then breaks
  them - when the world closes, Foundry writes its old state over the new files and the packs come
  back empty. So while a world runs, the packs on the server stay as they are (the folder is moved
  over, not copied) and the script says so. Return to setup in Foundry and run it again to update them.
#>
param(
  [string]$Target,
  [int]$Port = 30000
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$manifest = Get-Content module.json -Raw -Encoding UTF8 | ConvertFrom-Json
$moduleId = $manifest.id
if (-not $Target) {
  $targetFile = Join-Path $PSScriptRoot "target.txt"
  if (-not (Test-Path $targetFile)) { throw "No target. Create tools\target.txt (e.g. myserver:/path/Data/modules/$moduleId)." }
  $Target = (Get-Content $targetFile -TotalCount 1).Trim()
}
if ($Target -notmatch ('^([^:]+):(/.+/modules/' + [regex]::Escape($moduleId) + ')$')) { throw "Target must look like host:/.../modules/$moduleId - got: $Target" }
$hostName = $Matches[1]
$remotePath = $Matches[2]
$parent = $remotePath.Substring(0, $remotePath.LastIndexOf('/'))   # Linux path, not Split-Path (that makes backslashes)

Write-Host "Tests ..."
node --test
if ($LASTEXITCODE -ne 0) { throw "Tests failed - nothing copied." }

Write-Host "Compendiums ..."
node tools/build-packs.mjs
if ($LASTEXITCODE -ne 0) { throw "Building the compendiums failed - nothing copied." }
Get-ChildItem packs -Recurse -File | Where-Object { $_.Name -match '^(LOCK|LOG(\.old)?)$' } | Remove-Item -Force

Write-Host "Is a world running on the server ..."
$worldRunning = $false
$worldName = ""
$status = ssh $hostName "curl -s --max-time 5 http://localhost:$Port/api/status"
if ($LASTEXITCODE -eq 0 -and $status) {
  try {
    $info = ($status -join "") | ConvertFrom-Json
    $worldRunning = [bool]$info.active
    $worldName = $info.world
  } catch { }
} else {
  Write-Host "  Could not ask Foundry for its status - treating it as running, to keep the compendiums safe." -ForegroundColor Yellow
  $worldRunning = $true
}

$version = $manifest.version
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "$moduleId-deploy"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory $staging | Out-Null
$parts = @("module.json", "scripts", "templates", "styles", "lang", "assets")
if (-not $worldRunning) { $parts += "packs" }
foreach ($part in $parts) {
  if (Test-Path $part) { Copy-Item $part -Destination $staging -Recurse }
}
# While a world runs, keep the server's open packs: move them into the new folder (same files, same handles).
$keepPacks = if ($worldRunning) { "if [ -d '$remotePath/packs' ]; then mv '$remotePath/packs' '$remotePath.new/packs'; fi; " } else { "" }

Write-Host "Copying version $version to ${hostName}:$remotePath ..."
ssh $hostName "rm -rf '$remotePath.new' && mkdir -p '$remotePath.new'"
if ($LASTEXITCODE -ne 0) { throw "SSH failed." }
foreach ($entry in Get-ChildItem $staging) {
  scp -r -q $entry.FullName "${hostName}:$remotePath.new/"
  if ($LASTEXITCODE -ne 0) { throw "scp failed for $($entry.Name)." }
}
ssh $hostName "set -e; cd '$parent'; rm -rf '$remotePath.old'; $keepPacks if [ -d '$remotePath' ]; then mv '$remotePath' '$remotePath.old'; fi; mv '$remotePath.new' '$remotePath'; rm -rf '$remotePath.old'; chown -R --reference=. '$remotePath'; chmod -R u=rwX,g=rX,o= '$remotePath'"
if ($LASTEXITCODE -ne 0) { throw "Swapping the folder on the server failed." }

Remove-Item $staging -Recurse -Force
Write-Host "Done: $($manifest.title) $version is on the server."
if ($worldRunning) {
  Write-Host "The world '$worldName' is running, so the compendiums were NOT updated." -ForegroundColor Yellow
  Write-Host "To update them: Return to Setup in Foundry, run this script again, then launch the world." -ForegroundColor Yellow
}
Write-Host "First time: restart Foundry (or return to setup), then enable the module in the world."
Write-Host "After that, F5 in the world is usually enough."
