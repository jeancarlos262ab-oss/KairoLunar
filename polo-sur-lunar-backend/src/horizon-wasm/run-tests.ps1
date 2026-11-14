[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-NodeRuntime {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        return @{ Path = $nodeCmd.Source; IsElectron = $false }
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\Code.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Antigravity IDE\Antigravity IDE.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return @{ Path = $candidate; IsElectron = $true }
        }
    }

    throw "No Node.js runtime found in PATH or bundled VS Code / Antigravity IDE."
}

$runtime = Resolve-NodeRuntime
$prevElectronEnv = $env:ELECTRON_RUN_AS_NODE

try {
    if ($runtime.IsElectron) {
        $env:ELECTRON_RUN_AS_NODE = "1"
    }

    Push-Location $ProjectRoot
    $prevEap = $ErrorActionPreference
    try {
        # Keep native stderr lines from throwing a terminating RemoteException in PowerShell 5.1.
        $ErrorActionPreference = "Continue"

        & $runtime.Path "scripts/build.mjs" 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }

        & $runtime.Path "--test" "tests/horizon.test.ts" 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $prevEap
        Pop-Location
    }
} finally {
    if ($null -eq $prevElectronEnv) {
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    } else {
        $env:ELECTRON_RUN_AS_NODE = $prevElectronEnv
    }
}
