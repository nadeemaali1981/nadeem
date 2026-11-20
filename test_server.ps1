Set-Location 'C:\Users\NADEEM\Desktop\نديم للحسابات'
[System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE','1','Process')
Write-Host "Starting server..."
try {
    $proc = Start-Process -FilePath 'C:\Users\NADEEM\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe' `
        -ArgumentList 'server.js' `
        -WorkingDirectory 'C:\Users\NADEEM\Desktop\نديم للحسابات' `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput 'server_out.log' `
        -RedirectStandardError 'server_err.log'
    
    Write-Host "PID: $($proc.Id)"
    Start-Sleep 5
    
    if ($proc.HasExited) {
        Write-Host "Process EXITED with code: $($proc.ExitCode)"
    } else {
        Write-Host "Process still RUNNING"
    }
    
    Write-Host "=== STDOUT ==="
    Get-Content 'server_out.log' -ErrorAction SilentlyContinue
    Write-Host "=== STDERR ==="
    Get-Content 'server_err.log' -ErrorAction SilentlyContinue
    
    netstat -ano | findstr ':3000'
} catch {
    Write-Host "ERROR: $_"
}
