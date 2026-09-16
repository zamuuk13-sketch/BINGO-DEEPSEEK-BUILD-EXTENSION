$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridge = Join-Path $root 'src\index.js'
$hostName = 'com.bingo.deepseek.build'
$hostDir = Join-Path $env:LOCALAPPDATA 'BingoDeepSeekBuild'
$manifest = Join-Path $hostDir "$hostName.json"

New-Item -ItemType Directory -Force -Path $hostDir | Out-Null
Copy-Item $bridge (Join-Path $hostDir 'index.js') -Force

$chromeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName
$edgeKey = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\' + $hostName

$manifestContent = @{
  name = $hostName
  description = 'Bingo DeepSeek Build local native bridge'
  path = (Join-Path $hostDir 'launch.cmd')
  type = 'stdio'
  allowed_origins = @('chrome-extension://EXTENSION_ID_PLACEHOLDER/')
} | ConvertTo-Json -Depth 3

Set-Content -Path $manifest -Value $manifestContent -Encoding UTF8

$launcher = "@echo off`r`nnode `"%~dp0index.js`""
Set-Content -Path (Join-Path $hostDir 'launch.cmd') -Value $launcher -Encoding ASCII

New-Item -Path $chromeKey -Force | Out-Null
Set-ItemProperty -Path $chromeKey -Name '(default)' -Value $manifest
New-Item -Path $edgeKey -Force | Out-Null
Set-ItemProperty -Path $edgeKey -Name '(default)' -Value $manifest

Write-Host 'Bingo Native Messaging host installed.'
Write-Host "Edit $manifest and replace EXTENSION_ID_PLACEHOLDER with the installed extension ID."
