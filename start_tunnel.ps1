$bin = "$PSScriptRoot\bin\cloudflared.exe"
$logErr = "$PSScriptRoot\tunnel_err.log"
$logOut = "$PSScriptRoot\tunnel_out.log"

if (Test-Path $logErr) { Remove-Item $logErr -Force }
if (Test-Path $logOut) { Remove-Item $logOut -Force }

$proc = Start-Process -FilePath $bin `
    -ArgumentList "tunnel --url http://127.0.0.1:3000" `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardError $logErr `
    -RedirectStandardOutput $logOut

Write-Host "Cloudflared PID: $($proc.Id)"

for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep 1
    if (Test-Path $logErr) {
        $content = Get-Content $logErr -Raw
        if ($content -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $url = $matches[1]
            Write-Host "TUNNEL_URL: $url"
            Set-Content -Path "$PSScriptRoot\tunnel_url.txt" -Value $url -Force
            break
        }
    }
}

$proc.WaitForExit()
