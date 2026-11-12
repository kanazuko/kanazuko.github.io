param(
  [Parameter(Mandatory=$true)][ValidateSet('instagram-publish','instagram-prepare','instagram-status')][string]$FunctionName,
  [Parameter(Mandatory=$true)][guid]$ExpectedEpoch,
  [switch]$FunctionInstalled
)
$ErrorActionPreference = 'Stop'
if (-not $FunctionInstalled) { throw 'Run only after this full function deployment and verify_jwt have been verified in management metadata.' }
if ($MyInvocation.InvocationName -eq '.') { throw 'Do not dot-source this script. Use a dedicated PowerShell process with -NoProfile.' }

# NO DEPLOYMENT. Health registers readiness through the selected backend.
# No CLI, credential store reads, environment setters, file writes or clipboard reads.
$phase = 'credential_entry'
$localCode = 'CREDENTIAL_UI_FAILED'
$child = $null
$childStarted = $false
$payload = $null
$form = $null
$keyBox = $null
$tokenBox = $null
$safeDiagnostic = $null
$status = 1
try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'PRArtJewelry - Etapa 3: health y mantenimiento'
$form.Size = New-Object System.Drawing.Size(690,330)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(18,14)
$label.Size = New-Object System.Drawing.Size(640,64)
$label.Text = @(('Proyecto: blsezjyhiholzwmqewef. SOLO ' + $FunctionName),
  'Health registra readiness. No publica ni prepara. Sin llamadas a Meta.',
  'Datos solo en memoria. No se garantiza borrado forense de todas las copias.') -join [Environment]::NewLine
$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Location = New-Object System.Drawing.Point(18,82)
$keyLabel.Size = New-Object System.Drawing.Size(640,20)
$keyLabel.Text = 'Clave publica Supabase existente del proyecto:'
$keyBox = New-Object System.Windows.Forms.TextBox
$keyBox.Location = New-Object System.Drawing.Point(18,106)
$keyBox.Size = New-Object System.Drawing.Size(640,25)
$keyBox.MaxLength = 4096
$tokenLabel = New-Object System.Windows.Forms.Label
$tokenLabel.Location = New-Object System.Drawing.Point(18,145)
$tokenLabel.Size = New-Object System.Drawing.Size(640,20)
$tokenLabel.Text = 'access_token de tu sesion Supabase vigente (entrada oculta):'
$tokenBox = New-Object System.Windows.Forms.TextBox
$tokenBox.Location = New-Object System.Drawing.Point(18,169)
$tokenBox.Size = New-Object System.Drawing.Size(640,25)
$tokenBox.MaxLength = 32768
$tokenBox.UseSystemPasswordChar = $true
$ok = New-Object System.Windows.Forms.Button
$ok.Location = New-Object System.Drawing.Point(430,222)
$ok.Size = New-Object System.Drawing.Size(110,32)
$ok.Text = 'Verificar'
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$cancel = New-Object System.Windows.Forms.Button
$cancel.Location = New-Object System.Drawing.Point(548,222)
$cancel.Size = New-Object System.Drawing.Size(110,32)
$cancel.Text = 'Cancelar'
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.AddRange(@($label,$keyLabel,$keyBox,$tokenLabel,$tokenBox,$ok,$cancel))
$form.AcceptButton = $ok
$form.CancelButton = $cancel
  $localCode = 'INPUT_CANCELLED'
  if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Stopped' }
  $phase = 'local_validation'
  $localCode = 'INPUT_INVALID'
  if ([string]::IsNullOrWhiteSpace($keyBox.Text) -or [string]::IsNullOrWhiteSpace($tokenBox.Text)) { throw 'Stopped' }
  # Serialize by a .NET method, not a PowerShell cmdlet receiving the JWT as a
  # bound parameter. Even so, external OS instrumentation is outside this script.
  $phase = 'input_transport'
  $localCode = 'INPUT_ENCODING_FAILED'
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $payload = $serializer.Serialize(@{ key = $keyBox.Text.Trim(); token = $tokenBox.Text.Trim() })
  $keyBox.Clear()
  $tokenBox.Clear()
  $form.Hide()
  $localCode = 'WORKER_START_FAILED'
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = (Get-Command node -ErrorAction Stop).Source
  $worker = Join-Path $PSScriptRoot 'verify-instagram-stage3-input.mjs'
  $start.Arguments = '"' + $worker + '" ' + $FunctionName + ' ' + $ExpectedEpoch.ToString()
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($name in @('SUPABASE_ACCESS_TOKEN','SUPABASE_ADMIN_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','INSTAGRAM_ACCESS_TOKEN','NODE_DEBUG','NODE_OPTIONS','NODE_COMPILE_CACHE')) {
    $start.EnvironmentVariables.Remove($name)
  }
  $child = New-Object System.Diagnostics.Process
  $child.StartInfo = $start
  if (-not $child.Start()) { throw 'Verification worker did not start' }
  $childStarted = $true
  $stdout = $child.StandardOutput.ReadToEndAsync()
  $stderr = $child.StandardError.ReadToEndAsync()
  $localCode = 'INPUT_PIPE_FAILED'
  $child.StandardInput.Write($payload)
  $child.StandardInput.Close()
  $payload = $null
  $localCode = 'WORKER_TIMEOUT'
  if (-not $child.WaitForExit(65000)) { $child.Kill(); throw 'Verification worker timed out' }
  $localCode = 'WORKER_OUTPUT_INVALID'
  $result = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json
  if ($result.project_ref -ne 'blsezjyhiholzwmqewef') { throw 'Stopped' }
  if ($child.ExitCode -ne 0 -or -not $result.stage3_verified) {
    $allowedPhases = @('credential_entry','input_transport','local_validation','connection','tls','http','response','internal')
    $allowedCodes = @('CREDENTIAL_UI_FAILED','INPUT_CANCELLED','INPUT_INVALID','INPUT_JSON_INVALID','INPUT_TOO_LARGE','INPUT_ENCODING_FAILED','INPUT_PIPE_FAILED','WORKER_START_FAILED','WORKER_TIMEOUT','WORKER_OUTPUT_INVALID','PUBLIC_KEY_INVALID','SESSION_INVALID','KEY_TOKEN_CONFUSED','SESSION_EXPIRED','PROJECT_MISMATCH','DNS_FAILED','CONNECTION_FAILED','REQUEST_TIMEOUT','TLS_FAILED','HTTP_UNAUTHORIZED','HTTP_FORBIDDEN','HTTP_UNEXPECTED','RESPONSE_JSON_INVALID','RESPONSE_CODE_MISMATCH','BRIDGE_MARKER_MISMATCH','CACHE_POLICY_MISMATCH','UNEXPECTED_FAILURE')
    if ($result.diagnostic.phase -in $allowedPhases -and $result.diagnostic.code -in $allowedCodes) {
      $safeDiagnostic = [ordered]@{ phase = $result.diagnostic.phase; code = $result.diagnostic.code }
      if ($result.diagnostic.function_name -in @('instagram-status','instagram-prepare','instagram-publish')) { $safeDiagnostic.function_name = $result.diagnostic.function_name }
      if ($result.diagnostic.http_status -is [int] -and $result.diagnostic.http_status -ge 100 -and $result.diagnostic.http_status -le 599) { $safeDiagnostic.http_status = $result.diagnostic.http_status }
    }
    throw 'Stopped'
  }
  if ($result.function_name -ne $FunctionName -or $result.backend_version -ne 2 -or
      $result.health_http_status -ne 200 -or $result.maintenance_http_status -ne 423 -or
      $result.runtime.schema_version -ne 2 -or $result.runtime.maintenance -ne $true -or
      $result.runtime.frontend_ready -ne $false -or $result.runtime.deployment_epoch -ne $ExpectedEpoch.ToString()) { throw 'Stopped' }
  [PSCustomObject]@{ project_ref='blsezjyhiholzwmqewef'; stage3_verified=$true; drain_verified=$false;
    function_name=$FunctionName; backend_version=2; health_http_status=200; maintenance_http_status=423;
    runtime=[PSCustomObject]@{ schema_version=2; maintenance=$true; frontend_ready=$false; deployment_epoch=$ExpectedEpoch.ToString() }
  } | ConvertTo-Json -Depth 5
  $status = 0
} catch {
  if ($null -eq $safeDiagnostic) { $safeDiagnostic = [ordered]@{ phase=$phase; code=$localCode } }
  [PSCustomObject]@{ project_ref='blsezjyhiholzwmqewef'; stage3_verified=$false; drain_verified=$false; diagnostic=$safeDiagnostic } | ConvertTo-Json -Depth 4
} finally {
  $payload = $null
  if ($null -ne $keyBox) { $keyBox.Clear() }
  if ($null -ne $tokenBox) { $tokenBox.Clear() }
  if ($null -ne $form) { $form.Dispose() }
  if ($null -ne $child) {
    if ($childStarted -and -not $child.HasExited) { $child.Kill() }
    $child.Dispose()
  }
}
# Execute via powershell.exe -NoProfile -File so this exits the dedicated parent
# too. Releasing references/terminating processes is not forensic zeroization.
exit $status
