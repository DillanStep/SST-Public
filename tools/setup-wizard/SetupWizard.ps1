Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Resolve-RepoPath {
    param([Parameter(Mandatory)][string]$Relative)
    $root = Split-Path -Parent $PSScriptRoot
    return (Join-Path $root $Relative)
}

function Test-TcpPort {
    param(
        [Parameter(Mandatory)][string]$Host,
        [Parameter(Mandatory)][int]$Port,
        [int]$TimeoutMs = 2500
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($Host, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            $client.Close()
            return $false
        }
        $client.EndConnect($iar) | Out-Null
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Parse-RemoteSstUrl {
    param([Parameter(Mandatory)][string]$Input)

    # Accept inputs like:
    # - sftp://user@host:port/104.234.../HostHavocDayZServer/SST
    # - /104.234.../HostHavocDayZServer/SST
    # - /104.234.../HostHavocDayZServer/SST/api/online_players.json

    $pathPart = $Input
    if ($Input -match '^[a-zA-Z]+://') {
        try {
            $uri = [System.Uri]$Input
            $pathPart = $uri.AbsolutePath
        } catch {
            # fall back to raw
            $pathPart = $Input
        }
    }

    $pathPart = $pathPart.Trim()
    $pathPart = $pathPart -replace '\\','/'

    # strip file suffixes if pasted to a specific file
    if ($pathPart.EndsWith('/api/online_players.json')) {
        $pathPart = $pathPart.Substring(0, $pathPart.Length - '/api/online_players.json'.Length)
    }
    if ($pathPart.EndsWith('/api')) {
        $pathPart = $pathPart.Substring(0, $pathPart.Length - '/api'.Length)
    }

    if (-not $pathPart.StartsWith('/')) {
        $pathPart = '/' + $pathPart
    }

    $parts = $pathPart.Split('/') | Where-Object { $_ -ne '' }
    if ($parts.Count -lt 2) {
        return $null
    }

    # Heuristic: first segment is hosting-panel prefix, remainder is SST_PATH
    $root = '/' + $parts[0]
    $sstPath = ($parts[1..($parts.Count-1)] -join '/')

    return [PSCustomObject]@{
        Root = $root
        SstPath = $sstPath
        Full = $pathPart
    }
}

function Write-EnvFile {
    param(
        [Parameter(Mandatory)][string]$EnvPath,
        [Parameter(Mandatory)][hashtable]$Values
    )

    $lines = @()
    $lines += '# Created by SST Setup Wizard'
    $lines += ('# ' + (Get-Date).ToString('s'))
    $lines += ''

    foreach ($key in $Values.Keys) {
        $val = [string]$Values[$key]
        if ($null -eq $val) { $val = '' }

        # Keep it simple: no quoting; escape only CR/LF
        $val = $val -replace "`r", ''
        $val = $val -replace "`n", ''

        $lines += "$key=$val"
    }

    $dir = Split-Path -Parent $EnvPath
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }

    Set-Content -Path $EnvPath -Value $lines -Encoding UTF8
}

function Run-StorageTest {
    param(
        [Parameter(Mandatory)][string]$ApiDir
    )

    $node = (Get-Command node -ErrorAction SilentlyContinue)
    if (-not $node) {
        return [PSCustomObject]@{ Ok = $false; Message = 'Node.js not found in PATH. Install Node.js or skip the deep test.' }
    }

    $scriptPath = Join-Path $ApiDir 'tools\storage-test.mjs'
    if (-not (Test-Path $scriptPath)) {
        return [PSCustomObject]@{ Ok = $false; Message = 'storage-test.mjs not found (unexpected).'; }
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node.Source
    $psi.Arguments = '"' + $scriptPath + '"'
    $psi.WorkingDirectory = $ApiDir
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false

    $p = [System.Diagnostics.Process]::Start($psi)
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    if ($p.ExitCode -eq 0) {
        return [PSCustomObject]@{ Ok = $true; Message = 'Storage test OK.'; Stdout = $stdout; Stderr = $stderr }
    }

    return [PSCustomObject]@{ Ok = $false; Message = "Storage test failed (exit $($p.ExitCode))."; Stdout = $stdout; Stderr = $stderr }
}

# ---------------- UI ----------------

$state = @{
    Scenario = 'hosted' # hosted | local
    Backend = 'sftp'    # local | ftp | sftp

    # Connection
    SftpHost = ''
    SftpPort = '22'
    SftpUser = ''
    SftpPassword = ''
    SftpRoot = '/'

    FtpHost = ''
    FtpPort = '21'
    FtpUser = ''
    FtpPassword = ''
    FtpSecure = 'true'
    FtpRoot = '/'

    # Paths
    SstPath = ''

    # Server
    ApiPort = '3001'
    ApiHost = '0.0.0.0'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Resolve-RepoPath 'apps\api'
$envPath = Join-Path $apiDir '.env'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SST Setup Wizard'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(820, 560)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Dock = 'Fill'
$tabs.Appearance = 'Normal'
$form.Controls.Add($tabs)

function New-Tab($title) {
    $tab = New-Object System.Windows.Forms.TabPage
    $tab.Text = $title
    $tabs.TabPages.Add($tab) | Out-Null
    return $tab
}

function Add-Label($parent, $text, $x, $y, $w=720, $h=22) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $text
    $lbl.Location = New-Object System.Drawing.Point($x,$y)
    $lbl.Size = New-Object System.Drawing.Size($w,$h)
    $parent.Controls.Add($lbl)
    return $lbl
}

function Add-TextBox($parent, $x, $y, $w=420, $h=24) {
    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Location = New-Object System.Drawing.Point($x,$y)
    $tb.Size = New-Object System.Drawing.Size($w,$h)
    $parent.Controls.Add($tb)
    return $tb
}

function Add-PasswordBox($parent, $x, $y, $w=420, $h=24) {
    $tb = Add-TextBox $parent $x $y $w $h
    $tb.UseSystemPasswordChar = $true
    return $tb
}

function Add-Button($parent, $text, $x, $y, $w=120, $h=28) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = $text
    $btn.Location = New-Object System.Drawing.Point($x,$y)
    $btn.Size = New-Object System.Drawing.Size($w,$h)
    $parent.Controls.Add($btn)
    return $btn
}

function Add-Radio($parent, $text, $x, $y, $checked=$false) {
    $rb = New-Object System.Windows.Forms.RadioButton
    $rb.Text = $text
    $rb.Location = New-Object System.Drawing.Point($x,$y)
    $rb.Size = New-Object System.Drawing.Size(360,24)
    $rb.Checked = $checked
    $parent.Controls.Add($rb)
    return $rb
}

# Tab 1: Scenario
$tab1 = New-Tab '1) Environment'
Add-Label $tab1 'Choose where your DayZ server files live:' 20 20 | Out-Null
$rbHosted = Add-Radio $tab1 'Hosted provider (HostHavoc / Nitrado / etc)' 40 60 $true
$rbLocal  = Add-Radio $tab1 'Home server / Bare metal (local filesystem)' 40 90 $false

Add-Label $tab1 'API host/port (where the dashboard connects):' 20 140 | Out-Null
Add-Label $tab1 'HOST' 40 170 60 | Out-Null
$tbApiHost = Add-TextBox $tab1 110 166 180
$tbApiHost.Text = $state.ApiHost
Add-Label $tab1 'PORT' 320 170 60 | Out-Null
$tbApiPort = Add-TextBox $tab1 380 166 90
$tbApiPort.Text = $state.ApiPort

# Tab 2: Backend
$tab2 = New-Tab '2) Storage'
Add-Label $tab2 'Choose how the API will read SST files:' 20 20 | Out-Null
$rbSftp = Add-Radio $tab2 'SFTP (recommended for HostHavoc-style hosting)' 40 60 $true
$rbFtp  = Add-Radio $tab2 'FTP/FTPS' 40 90 $false
$rbLocal2 = Add-Radio $tab2 'Local filesystem' 40 120 $false

# Tab 3: Connection
$tab3 = New-Tab '3) Connection'
Add-Label $tab3 'Connection details (only used for FTP/SFTP):' 20 20 | Out-Null

Add-Label $tab3 'Host' 40 60 80 | Out-Null
$tbHost = Add-TextBox $tab3 140 56 260
Add-Label $tab3 'Port' 420 60 60 | Out-Null
$tbPort = Add-TextBox $tab3 480 56 80

Add-Label $tab3 'Username' 40 95 80 | Out-Null
$tbUser = Add-TextBox $tab3 140 91 260
Add-Label $tab3 'Password' 40 130 80 | Out-Null
$tbPass = Add-PasswordBox $tab3 140 126 260

Add-Label $tab3 'Remote root (prefix folder shown by host panel; usually "/")' 40 170 640 | Out-Null
$tbRoot = Add-TextBox $tab3 40 195 520
$tbRoot.Text = '/'

$btnTcpTest = Add-Button $tab3 'Test Port' 580 195 160
$lblTcp = Add-Label $tab3 '' 40 235 720

$btnTcpTest.Add_Click({
    $host = $tbHost.Text.Trim()
    $port = 0
    [void][int]::TryParse($tbPort.Text.Trim(), [ref]$port)

    if (-not $host -or $port -le 0) {
        $lblTcp.Text = 'Enter host and port first.'
        return
    }

    $ok = Test-TcpPort -Host $host -Port $port
    if ($ok) {
        $lblTcp.Text = "TCP OK: ${host}:${port}"
    } else {
        $lblTcp.Text = "TCP FAILED: ${host}:${port} (blocked/wrong port?)"
    }
})

# Tab 4: Paths
$tab4 = New-Tab '4) SST Paths'
Add-Label $tab4 'Set the SST base folder (NOT the api folder). For remote hosting, paste the URL or remote folder path:' 20 20 760 | Out-Null

Add-Label $tab4 'Paste remote SST folder URL/path (optional helper)' 40 60 520 | Out-Null
$tbPaste = Add-TextBox $tab4 40 84 620
$btnParse = Add-Button $tab4 'Parse' 670 82 100

Add-Label $tab4 'SST_PATH (relative if using remote root)' 40 130 520 | Out-Null
$tbSstPath = Add-TextBox $tab4 40 154 620

Add-Label $tab4 'Note: If SST_PATH starts with "/", SFTP_ROOT/FTP_ROOT will be ignored.' 40 190 760 | Out-Null

$btnParse.Add_Click({
    $raw = $tbPaste.Text.Trim()
    if (-not $raw) { return }

    $parsed = Parse-RemoteSstUrl -Input $raw
    if ($null -eq $parsed) {
        [System.Windows.Forms.MessageBox]::Show('Could not parse. Paste something like: /104.234.../HostHavocDayZServer/SST', 'Parse', 'OK', 'Information') | Out-Null
        return
    }

    $tbRoot.Text = $parsed.Root
    $tbSstPath.Text = $parsed.SstPath
})

# Tab 5: Review + Write
$tab5 = New-Tab '5) Write Config'
Add-Label $tab5 'Review and generate apps/api/.env' 20 20 | Out-Null

$txtReview = New-Object System.Windows.Forms.TextBox
$txtReview.Multiline = $true
$txtReview.ScrollBars = 'Vertical'
$txtReview.ReadOnly = $true
$txtReview.Font = New-Object System.Drawing.Font('Consolas', 10)
$txtReview.Location = New-Object System.Drawing.Point(20, 55)
$txtReview.Size = New-Object System.Drawing.Size(760, 360)
$tab5.Controls.Add($txtReview)

$btnWrite = Add-Button $tab5 'Write .env' 20 430 140
$btnDeepTest = Add-Button $tab5 'Deep Test (Node)' 180 430 160
$btnOpenApiDir = Add-Button $tab5 'Open API Folder' 360 430 160
$lblWrite = Add-Label $tab5 '' 20 470 760

$btnOpenApiDir.Add_Click({
    Start-Process -FilePath $apiDir | Out-Null
})

function Update-StateFromUi {
    $state.ApiHost = $tbApiHost.Text.Trim()
    $state.ApiPort = $tbApiPort.Text.Trim()

    if ($rbHosted.Checked) {
        $state.Scenario = 'hosted'
    } else {
        $state.Scenario = 'local'
    }

    if ($rbLocal2.Checked) { $state.Backend = 'local' }
    elseif ($rbFtp.Checked) { $state.Backend = 'ftp' }
    else { $state.Backend = 'sftp' }

    if ($state.Backend -eq 'sftp') {
        $state.SftpHost = $tbHost.Text.Trim()
        $state.SftpPort = $tbPort.Text.Trim()
        $state.SftpUser = $tbUser.Text.Trim()
        $state.SftpPassword = $tbPass.Text
        $state.SftpRoot = $tbRoot.Text.Trim()
    }

    if ($state.Backend -eq 'ftp') {
        $state.FtpHost = $tbHost.Text.Trim()
        $state.FtpPort = $tbPort.Text.Trim()
        $state.FtpUser = $tbUser.Text.Trim()
        $state.FtpPassword = $tbPass.Text
        $state.FtpRoot = $tbRoot.Text.Trim()
    }

    $state.SstPath = $tbSstPath.Text.Trim()
}

function Build-EnvValues {
    $values = @{
        'PORT' = $state.ApiPort
        'HOST' = $state.ApiHost
        'STORAGE_BACKEND' = $state.Backend
        'SST_PATH' = $state.SstPath
    }

    if ($state.Backend -eq 'sftp') {
        $values['SFTP_HOST'] = $state.SftpHost
        $values['SFTP_PORT'] = $state.SftpPort
        $values['SFTP_USER'] = $state.SftpUser
        $values['SFTP_PASSWORD'] = $state.SftpPassword
        $values['SFTP_ROOT'] = $state.SftpRoot
    }

    if ($state.Backend -eq 'ftp') {
        $values['FTP_HOST'] = $state.FtpHost
        $values['FTP_PORT'] = $state.FtpPort
        $values['FTP_USER'] = $state.FtpUser
        $values['FTP_PASSWORD'] = $state.FtpPassword
        $values['FTP_ROOT'] = $state.FtpRoot
        $values['FTP_SECURE'] = $state.FtpSecure
    }

    return $values
}

function Render-Review {
    Update-StateFromUi
    $values = Build-EnvValues

    $safe = @{}
    foreach ($k in $values.Keys) {
        if ($k -match 'PASSWORD') {
            $safe[$k] = if ($values[$k]) { '********' } else { '' }
        } else {
            $safe[$k] = $values[$k]
        }
    }

    $preview = @()
    $preview += "Will write: $envPath"
    $preview += ''
    foreach ($k in ($safe.Keys | Sort-Object)) {
        $preview += "$k=$($safe[$k])"
    }

    $txtReview.Text = ($preview -join "`r`n")
}

$tabs.Add_SelectedIndexChanged({
    if ($tabs.SelectedTab -eq $tab5) {
        Render-Review
    }
})

$btnWrite.Add_Click({
    try {
        Render-Review
        $values = Build-EnvValues

        if (-not $values['SST_PATH']) {
            throw 'SST_PATH is required. Paste your remote SST folder or set SST_PATH manually.'
        }

        if ($values['STORAGE_BACKEND'] -eq 'sftp') {
            foreach ($k in 'SFTP_HOST','SFTP_PORT','SFTP_USER','SFTP_PASSWORD','SFTP_ROOT') {
                if (-not $values[$k]) { throw "Missing $k" }
            }
        }

        if ($values['STORAGE_BACKEND'] -eq 'ftp') {
            foreach ($k in 'FTP_HOST','FTP_PORT','FTP_USER','FTP_PASSWORD','FTP_ROOT') {
                if (-not $values[$k]) { throw "Missing $k" }
            }
        }

        Write-EnvFile -EnvPath $envPath -Values $values
        $lblWrite.Text = "Wrote .env successfully: $envPath"
    } catch {
        $lblWrite.Text = "Write failed: $($_.Exception.Message)"
    }
})

$btnDeepTest.Add_Click({
    try {
        $lblWrite.Text = 'Running deep test...'
        $result = Run-StorageTest -ApiDir $apiDir
        if ($result.Ok) {
            $lblWrite.Text = 'Deep test OK: API can see online_players.json'
        } else {
            $lblWrite.Text = $result.Message
            if ($result.Stderr) {
                [System.Windows.Forms.MessageBox]::Show($result.Stderr, 'Deep Test Error', 'OK', 'Error') | Out-Null
            } elseif ($result.Stdout) {
                [System.Windows.Forms.MessageBox]::Show($result.Stdout, 'Deep Test Output', 'OK', 'Information') | Out-Null
            }
        }
    } catch {
        $lblWrite.Text = "Deep test failed: $($_.Exception.Message)"
    }
})

# Bottom navigation (simple)
$panelBottom = New-Object System.Windows.Forms.Panel
$panelBottom.Dock = 'Bottom'
$panelBottom.Height = 50
$form.Controls.Add($panelBottom)

$btnBack = New-Object System.Windows.Forms.Button
$btnBack.Text = 'Back'
$btnBack.Location = New-Object System.Drawing.Point(10, 10)
$btnBack.Size = New-Object System.Drawing.Size(90, 28)
$panelBottom.Controls.Add($btnBack)

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = 'Next'
$btnNext.Location = New-Object System.Drawing.Point(110, 10)
$btnNext.Size = New-Object System.Drawing.Size(90, 28)
$panelBottom.Controls.Add($btnNext)

$btnExit = New-Object System.Windows.Forms.Button
$btnExit.Text = 'Close'
$btnExit.Location = New-Object System.Drawing.Point(710, 10)
$btnExit.Size = New-Object System.Drawing.Size(90, 28)
$panelBottom.Controls.Add($btnExit)

$btnExit.Add_Click({ $form.Close() })

$btnBack.Add_Click({
    if ($tabs.SelectedIndex -gt 0) {
        $tabs.SelectedIndex = $tabs.SelectedIndex - 1
    }
})

$btnNext.Add_Click({
    if ($tabs.SelectedIndex -lt ($tabs.TabPages.Count - 1)) {
        $tabs.SelectedIndex = $tabs.SelectedIndex + 1
    }
})

# Keep scenario/backend toggles in sync
$syncConnFields = {
    if ($rbLocal2.Checked) {
        $tbHost.Enabled = $false
        $tbPort.Enabled = $false
        $tbUser.Enabled = $false
        $tbPass.Enabled = $false
        $tbRoot.Enabled = $false
        $btnTcpTest.Enabled = $false
    } else {
        $tbHost.Enabled = $true
        $tbPort.Enabled = $true
        $tbUser.Enabled = $true
        $tbPass.Enabled = $true
        $tbRoot.Enabled = $true
        $btnTcpTest.Enabled = $true
    }
}

$rbLocal2.Add_CheckedChanged($syncConnFields)
$rbSftp.Add_CheckedChanged({ if ($rbSftp.Checked) { $tbPort.Text = '22' } ; & $syncConnFields })
$rbFtp.Add_CheckedChanged({ if ($rbFtp.Checked) { $tbPort.Text = '21' } ; & $syncConnFields })

& $syncConnFields

# Show UI
[void]$form.ShowDialog()
