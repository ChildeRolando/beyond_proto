param(
  [string]$Server = $env:DEPLOY_SERVER,
  [string]$SshKey = $env:DEPLOY_SSH_KEY,
  [string]$RemoteDir = $env:DEPLOY_REMOTE_DIR,
  [switch]$DryRun,
  [switch]$SkipRestart,
  [switch]$Assets,
  [switch]$Pause
)

$ErrorActionPreference = "Stop"

# Default: do NOT deploy assets.
# Use -Assets only when skill icons / portraits / images changed.
$IncludeAssets = [bool]$Assets

$stageDir = $null
$zipPath = $null

if ([string]::IsNullOrWhiteSpace($Server)) {
  $Server = "Administrator@120.77.178.15"
}
if ([string]::IsNullOrWhiteSpace($SshKey)) {
  $SshKey = Join-Path $HOME ".ssh\id_ed25519"
}
if ([string]::IsNullOrWhiteSpace($RemoteDir)) {
  $RemoteDir = "C:/Users/Administrator/Desktop/combat-engine"
}

function Die($msg) {
  Write-Error $msg
  exit 1
}

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Die "$name is not available in PATH"
  }
}

function Encode-RemoteCommand([string]$script) {
  $full = "`$ErrorActionPreference='Stop'; `$ProgressPreference='SilentlyContinue'; $script"
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($full)
  return [Convert]::ToBase64String($bytes)
}

function Invoke-RemotePs([string]$script) {
  $encoded = Encode-RemoteCommand $script

  $args = @(
    "-i", $SshKey,
    "-o", "IdentitiesOnly=yes",
    $Server,
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-EncodedCommand", $encoded
  )

  if ($DryRun) {
    Write-Host "[dry-run] ssh $($args -join ' ')"
    return
  }

  & ssh.exe @args

  if ($LASTEXITCODE -ne 0) {
    Die "remote PowerShell command failed with exit code $LASTEXITCODE"
  }
}

function Should-Exclude([string]$path) {
  $p = $path -replace "\\", "/"

  # Git / tooling / generated outputs
  if ($p -like ".git/*") { return $true }
  if ($p -like ".github/*") { return $true }
  if ($p -like ".claude/*") { return $true }
  if ($p -like ".agents/*") { return $true }
  if ($p -like "node_modules/*") { return $true }
  if ($p -like "test-results/*") { return $true }
  if ($p -like "playwright-report/*") { return $true }

  # Docs / human-only materials
  if ($p -like "docs/*") { return $true }
  if ($p -like "docs_for_human/*") { return $true }
  if ($p -like "documents/*") { return $true }
  if ($p -like "pics/*") { return $true }
  if ($p -like "*.md") { return $true }

  # Tests are not deployed to the game server
  if ($p -like "tests/*") { return $true }

  # Local logs / deploy helpers / debug files
  if ($p -like "*_out.txt") { return $true }
  if ($p -eq "deploy.log") { return $true }
  if ($p -eq "deploy-dry.log") { return $true }
  if ($p -eq "deploy.sh") { return $true }
  if ($p -eq "deploy.ps1") { return $true }
  if ($p -like "deploy-*.bat") { return $true }
  if ($p -eq "ngrok.exe") { return $true }

  # Assets are excluded by default.
  # Use -Assets to include assets/.
  if ($p -like "assets/*" -and -not $IncludeAssets) { return $true }

  return $false
}

function Get-Manifest {
  $files = git ls-files --cached --others --exclude-standard

  if ($LASTEXITCODE -ne 0) {
    Die "git ls-files failed"
  }

  $result = New-Object System.Collections.Generic.List[string]

  foreach ($f in $files) {
    if ([string]::IsNullOrWhiteSpace($f)) { continue }
    if (Should-Exclude $f) { continue }
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }

    $result.Add($f)
  }

  return $result
}

function Copy-ToStage($manifest, [string]$stageDir) {
  foreach ($path in $manifest) {
    $dest = Join-Path $stageDir $path
    $parent = Split-Path $dest -Parent

    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -LiteralPath $path -Destination $dest -Force
  }
}

function New-Zip([string]$sourceDir, [string]$zipPath) {
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $zipPath)
}

function Upload-Zip([string]$zipPath, [string]$remoteZip) {
  $target = "${Server}:$remoteZip"

  $args = @(
    "-i", $SshKey,
    "-o", "IdentitiesOnly=yes",
    $zipPath,
    $target
  )

  if ($DryRun) {
    Write-Host "[dry-run] scp $($args -join ' ')"
    return
  }

  & scp.exe @args

  if ($LASTEXITCODE -ne 0) {
    Die "scp upload failed with exit code $LASTEXITCODE"
  }
}

function Publish-RemoteZip([string]$remoteZip, [string]$remoteStage) {
  # Only remove remote assets when this deployment includes assets.
  # Otherwise normal code deploy must leave remote assets untouched.
  $remoteDirs = @(
    'app',
    'engine',
    'network',
    'server',
    'session',
    'styles',
    'tutorial',
    'ui'
  )

  if ($IncludeAssets) {
    $remoteDirs += 'assets'
  }

  $dirsLiteral = ($remoteDirs | ForEach-Object { "'$_'" }) -join ','

  $script = @"
`$remote = '$RemoteDir'
`$zip = '$remoteZip'
`$stage = '$remoteStage'

New-Item -ItemType Directory -Force -Path `$remote | ForEach-Object { `$null }
Remove-Item -Recurse -Force -Path `$stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path `$stage | ForEach-Object { `$null }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory(`$zip, `$stage)

`$dirs = @($dirsLiteral)
foreach (`$d in `$dirs) {
  Remove-Item -Recurse -Force -Path (Join-Path `$remote `$d) -ErrorAction SilentlyContinue
}

`$files = @(
  'index.html',
  'main.js',
  'package.json',
  'package-lock.json',
  'playwright.config.js'
)

foreach (`$f in `$files) {
  Remove-Item -Force -Path (Join-Path `$remote `$f) -ErrorAction SilentlyContinue
}

Get-ChildItem -Path `$stage -Force | Copy-Item -Destination `$remote -Recurse -Force

Remove-Item -Recurse -Force -Path `$stage -ErrorAction SilentlyContinue
Remove-Item -Force -Path `$zip -ErrorAction SilentlyContinue
"@

  Invoke-RemotePs $script
}

function Schedule-Restart {
  if ($SkipRestart) {
    Write-Host "Restart scheduling skipped."
    return
  }

  $script = @"
`$t = (Get-Date).AddMinutes(1)
schtasks /create /tn CombatDeploy /tr "powershell -ExecutionPolicy Bypass -File $RemoteDir\server\start-servers.ps1" /sc ONCE /st `$t.ToString('HH:mm') /sd `$t.ToString('yyyy/MM/dd') /f
"@

  Invoke-RemotePs $script
}

try {
  Write-Host "=== Deploying combat-engine to $Server ==="
  Write-Host "Mode: Windows native zip deploy"
  Write-Host "Remote dir: $RemoteDir"
  Write-Host "Dry run: $DryRun"
  Write-Host "Include assets: $IncludeAssets"

  if (-not $IncludeAssets) {
    Write-Host "Note: assets/ is excluded. Use -Assets when skill icons or portraits changed."
  }

  Write-Host "Skip restart: $SkipRestart"
  Write-Host "SSH key: $SshKey"
  Write-Host ""

  Require-Command git
  Require-Command ssh.exe
  Require-Command scp.exe

  if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) {
    Die "SSH key not found: $SshKey"
  }

  git rev-parse --is-inside-work-tree | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Die "not a git repository"
  }

  $hash = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hash)) {
    Die "cannot read git HEAD"
  }

  $shortHash = $hash.Substring(0, 7)
  Write-Host "Current HEAD: $shortHash"

  $manifest = Get-Manifest

  if ($manifest.Count -eq 0) {
    Die "deploy manifest is empty"
  }

  Write-Host "Files to publish: $($manifest.Count)"
  foreach ($f in $manifest) {
    Write-Host "  $f"
  }
  Write-Host ""

  if ($DryRun) {
    Write-Host "Dry run complete; no files uploaded."
    exit 0
  }

  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  $stageDir = Join-Path $env:TEMP "combat-deploy-stage-$shortHash-$stamp"
  $zipPath = Join-Path $env:TEMP "combat-deploy-$shortHash-$stamp.zip"

  $remoteZip = "$RemoteDir.__upload_$shortHash`_$stamp.zip"
  $remoteStage = "$RemoteDir.__stage_$shortHash`_$stamp"

  if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -Recurse -Force -LiteralPath $stageDir
  }

  New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

  Write-Host "Building local stage: $stageDir"
  Copy-ToStage $manifest $stageDir

  Write-Host "Creating zip: $zipPath"
  New-Zip $stageDir $zipPath

  Write-Host "Uploading zip: $remoteZip"
  Upload-Zip $zipPath $remoteZip

  Write-Host "Publishing remote zip..."
  Publish-RemoteZip $remoteZip $remoteStage

  Write-Host "Scheduling restart..."
  Schedule-Restart

  Write-Host ""
  Write-Host "=== Deploy complete ($($manifest.Count) files published) ==="
  Write-Host "Servers will restart in ~1 minute."
  Write-Host "Game:      http://120.77.178.15:3000"
  Write-Host "Signaling: ws://120.77.178.15:8088"
}
finally {
  if ($stageDir -and (Test-Path -LiteralPath $stageDir)) {
    Remove-Item -Recurse -Force -LiteralPath $stageDir -ErrorAction SilentlyContinue
  }

  if ($zipPath -and (Test-Path -LiteralPath $zipPath)) {
    Remove-Item -Force -LiteralPath $zipPath -ErrorAction SilentlyContinue
  }

  Write-Host ""
  Write-Host "=== deploy.ps1 finished ==="

  if ($Pause) {
    Read-Host "Press Enter to close"
  }
}