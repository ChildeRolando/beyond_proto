# Package the combat engine for cloud server deployment
# Usage: powershell -File package.ps1

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $root "dist"
$zipName = "combat-engine-cloud-v1.0.0.zip"
$zipPath = Join-Path $distDir $zipName

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Host "Packaging combat-engine for cloud deployment ..."
Write-Host ""

$files = @(
    "index.html",
    "package.json",
    "server/signaling.js",
    "server/static.js",
    "engine/EventBus.js",
    "engine/Logger.js",
    "engine/Targeting.js",
    "engine/CommandQueue.js",
    "engine/BuffHooks.js",
    "engine/DimensionSystem.js",
    "engine/Registry.js",
    "engine/HexMath.js",
    "engine/MovementSystem.js",
    "engine/BuffManager.js",
    "engine/FormationSystem.js",
    "engine/DefenseLayers.js",
    "engine/ProjectileCalculator.js",
    "engine/ResourceSystem.js",
    "engine/SkillData.js",
    "engine/StatusEffectDefs.js",
    "engine/DamageCalculator.js",
    "engine/NetworkManager.js",
    "engine/GameEngine.js",
    "engine/SkillResolver.js",
    "engine/CommandTypes.js",
    "engine/TurnManager.js"
)

$staging = Join-Path $distDir "staging"
if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging | Out-Null

foreach ($file in $files) {
    $src = Join-Path $root $file
    if (-not (Test-Path $src)) {
        Write-Host "  WARNING: Missing file: $file"
        continue
    }
    $dest = Join-Path $staging $file
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir | Out-Null
    }
    Copy-Item $src $dest
    Write-Host "  + $file"
}

# Create server startup script (no ngrok required, cloud server has public IP)
$startScript = @'
@echo off
echo ==================================================
echo   超越极限 - Combat Engine Server
echo ==================================================
echo.
echo Starting signaling server (WebSocket :8088) ...
start "Signaling" /B node server/signaling.js 8088
echo Starting game server (HTTP :3000) ...
node server/static.js 3000
'@
$startScript | Out-File -FilePath (Join-Path $staging "start-cloud.bat") -Encoding ASCII

$startScriptSh = @'
#!/bin/bash
echo "=================================================="
echo "  超越极限 - Combat Engine Server"
echo "=================================================="
echo ""
echo "Starting signaling server (WebSocket :8088) ..."
node server/signaling.js 8088 &
echo "Starting game server (HTTP :3000) ..."
node server/static.js 3000
'@
$startScriptSh -replace "`r`n", "`n" | Out-File -FilePath (Join-Path $staging "start-cloud.sh") -Encoding UTF8 -NoNewline

$readme = @'
==================================================
  超越极限 · Combat Engine
  Hex-Grid Synchronous Turn-Based Roguelike
  云服务器部署指南
==================================================

前置要求:
  - Node.js (https://nodejs.org/)
  - 云服务器有公网 IP，防火墙开放 3000 和 8088 端口

==================================================
  部署步骤
==================================================

1. 将整个压缩包上传到云服务器，解压到目标目录

2. 启动服务:
   Windows: 双击 start-cloud.bat
   Linux:   bash start-cloud.sh
   或手动:
     node server/signaling.js 8088 &
     node server/static.js 3000

3. 玩家访问:
   http://<你的服务器IP>:3000

   点击 "P2P 联机" 后，信令服务器地址填:
   <你的服务器IP>:8088

==================================================
  端口说明
==================================================

  :3000  - HTTP 静态文件服务 (index.html + engine/)
  :8088  - WebSocket 信令服务 (房间创建/加入/WebRTC握手)

  两个端口都需要在云服务器防火墙/安全组中放行。

==================================================
  不需要 ngrok
==================================================

  云服务器本身有公网 IP，不需要也不应该用 ngrok。
  ngrok 是给没有公网 IP 的本地开发机用的穿透工具。

==================================================
  使用 Nginx 反向代理 (可选)
==================================================

  可以用 Nginx 把 HTTP 代理到 80 端口:

    server {
        listen 80;
        server_name your-domain.com;
        location / {
            proxy_pass http://127.0.0.1:3000;
        }
        location /ws/ {
            proxy_pass http://127.0.0.1:8088;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

  注意: 如果用了 Nginx 代理 WebSocket，客户端信令地址
  需要填 wss://your-domain.com/ws/

==================================================
  文件清单
==================================================

  start-cloud.bat / .sh  - 服务器启动脚本
  index.html             - 游戏客户端
  server/                - 服务端脚本
  engine/                - 战斗引擎模块
'@
$readme | Out-File -FilePath (Join-Path $staging "README.txt") -Encoding UTF8

# Create zip
Write-Host ""
Write-Host "Creating zip..."
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -Force

Remove-Item $staging -Recurse -Force

Write-Host ""
Write-Host "Done! Package created at:"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "Upload to cloud server, unzip, run start-cloud.sh"
Write-Host "No ngrok required - cloud server has public IP."
