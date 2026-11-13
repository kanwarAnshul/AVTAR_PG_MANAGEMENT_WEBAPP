# Builds a release APK on this Windows machine (no EAS / no cloud).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1 -Clean
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1 -Architectures arm64-v8a
#
# -Clean regenerates android/ from app.json (expo prebuild). Use it after
# changing app.json, plugins, icons or splash.
# -Architectures limits ABIs. Default builds all four (bigger, universal APK).

param(
  [switch]$Clean,
  [string]$Architectures = ""
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Jdk17 {
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
  $candidates += @(
    'C:\Program Files\Eclipse Adoptium\jdk-17*',
    'C:\Program Files\Java\jdk-17*',
    'C:\Program Files\Microsoft\jdk-17*',
    'C:\Program Files\Android\Android Studio\jbr'
  )

  foreach ($candidate in $candidates) {
    $dirs = Get-ChildItem $candidate -Directory -ErrorAction SilentlyContinue
    if (-not $dirs -and (Test-Path (Join-Path $candidate 'bin\java.exe'))) {
      $dirs = @(Get-Item $candidate)
    }
    foreach ($dir in $dirs) {
      $java = Join-Path $dir.FullName 'bin\java.exe'
      if (-not (Test-Path $java)) { continue }
      $versionLine = (& $java -version 2>&1 | Select-Object -First 1) -join ''
      if ($versionLine -match '"17\.') { return $dir.FullName }
    }
  }

  throw "JDK 17 not found. Install it with: winget install EclipseAdoptium.Temurin.17.JDK"
}

function Find-AndroidSdk {
  foreach ($path in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) {
    if ($path -and (Test-Path (Join-Path $path 'platform-tools'))) { return $path }
  }
  throw "Android SDK not found. Install Android Studio (or the SDK) and set ANDROID_HOME."
}

$jdk = Find-Jdk17
$sdk = Find-AndroidSdk

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$jdk\bin;$env:PATH"

Write-Host "JDK: $jdk"
Write-Host "SDK: $sdk"

if ($Clean -or -not (Test-Path 'android\gradlew.bat')) {
  Write-Host "Regenerating native Android project (expo prebuild)..."
  npx expo prebuild --clean --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed (exit $LASTEXITCODE)." }
}

# Gradle needs the SDK path. Backslashes must be escaped in .properties files.
$sdkDir = $sdk -replace '\\', '\\'
[System.IO.File]::WriteAllText((Join-Path $root 'android\local.properties'), "sdk.dir=$sdkDir`n")

Push-Location android
try {
  $gradleArgs = @(':app:assembleRelease')
  if ($Architectures) { $gradleArgs += "-PreactNativeArchitectures=$Architectures" }
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed (exit $LASTEXITCODE)." }
}
finally {
  Pop-Location
}

$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK not found at $apk" }

$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$output = Join-Path $root "avtar-pg-$version-local.apk"
Copy-Item $apk $output -Force

Write-Host ""
Write-Host "APK ready: $output" -ForegroundColor Green
Write-Host "Install on a USB-connected phone: adb install -r `"$output`""
