Set-Location $PSScriptRoot
[System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE','1','Process')
$nodeExe = "C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe"
$proc = Start-Process -FilePath $nodeExe `
    -ArgumentList 'server.js' `
    -WorkingDirectory $PSScriptRoot `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardOutput "$PSScriptRoot\server_out.log" `
    -RedirectStandardError "$PSScriptRoot\server_err.log"

Write-Host "Server PID: $($proc.Id)"
Write-Host "Server started! Open: http://localhost:3000"

$proc.WaitForExit()
