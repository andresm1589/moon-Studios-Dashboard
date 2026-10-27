$ErrorActionPreference = 'Stop'
$moonProject = 'moon-studios-16102025'
$moonAccess = gcloud auth print-access-token 2>$null
if ($LASTEXITCODE -ne 0 -or !$moonAccess) { throw 'No authenticated Google Cloud session.' }
$moonHeaders = @{ Authorization = ('Bearer ' + $moonAccess); 'x-goog-user-project' = $moonProject }
$moonVerifiedSourceHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../firebase/firestore.rules') -Algorithm SHA256).Hash
$moonVerifiedTestHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
$moonRules = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../firebase/firestore.rules') -Raw
$moonCases = [System.Collections.Generic.List[object]]::new()
$moonLabels = [System.Collections.Generic.List[string]]::new()

function Add-MoonRuleCase($label, $route, $method, $expectation, $role = $null, $revision = 1, $previous = $null, $author = 'cms-test', $extra = $false) {
  $moonRequest = @{ path = ('/databases/(default)/documents/moonStudios/' + $route); method = $method; time = '2026-10-14T12:00:00Z'; auth = $null }
  if ($role) { $moonRequest.auth = @{ uid = 'cms-test' } }
  if ($method -in @('create','update')) {
    $moonData = @{ content = @{ version = 1; brand = @{}; hero = @{}; sections = @(@{id='inicio';visible=$true}) }; revision = $revision; updatedAt = $moonRequest.time; updatedBy = $author }
    if ($extra) { $moonData.unexpected = 'blocked' }
    $moonRequest.resource = @{ data = $moonData }
  }
  $moonCase = @{ expectation = $expectation; request = $moonRequest }
  if ($role) { $moonCase.functionMocks = @(@{ function = 'get'; args = @(@{ anyValue = @{} }); result = @{value = @{data = @{role = $role}}} }) }
  if ($null -ne $previous) { $moonCase.resource = @{ data = @{revision = $previous} } }
  $moonCases.Add($moonCase)
  $moonLabels.Add($label)
}

Add-MoonRuleCase 'Anonymous published read' 'web' 'get' 'ALLOW'
Add-MoonRuleCase 'Anonymous draft denied' 'webDraft' 'get' 'DENY'
Add-MoonRuleCase 'CEO draft read' 'webDraft' 'get' 'ALLOW' 'CEO'
Add-MoonRuleCase 'Administration draft read' 'webDraft' 'get' 'ALLOW' 'Administración'
Add-MoonRuleCase 'Employee draft denied' 'webDraft' 'get' 'DENY' 'Empleado'
foreach ($moonRoute in @('web','webDraft')) {
  Add-MoonRuleCase "$moonRoute anonymous write denied" $moonRoute 'create' 'DENY'
  Add-MoonRuleCase "$moonRoute employee write denied" $moonRoute 'create' 'DENY' 'Empleado'
  Add-MoonRuleCase "$moonRoute CEO create" $moonRoute 'create' 'ALLOW' 'CEO'
  Add-MoonRuleCase "$moonRoute Administration create" $moonRoute 'create' 'ALLOW' 'Administración'
  Add-MoonRuleCase "$moonRoute revision update" $moonRoute 'update' 'ALLOW' 'CEO' 2 1
  Add-MoonRuleCase "$moonRoute stale revision denied" $moonRoute 'update' 'DENY' 'CEO' 1 1
  Add-MoonRuleCase "$moonRoute wrong author denied" $moonRoute 'create' 'DENY' 'CEO' 1 $null 'someone-else'
  Add-MoonRuleCase "$moonRoute extra field denied" $moonRoute 'create' 'DENY' 'CEO' 1 $null 'cms-test' $true
  Add-MoonRuleCase "$moonRoute deletion denied" $moonRoute 'delete' 'DENY' 'CEO'
}
foreach ($moonRole in @('client','employee','Empleado','CEO','Administración')) {
  $moonExpectation = if ($moonRole -in @('client','employee','Empleado')) { 'ALLOW' } else { 'DENY' }
  $moonCases.Add(@{expectation=$moonExpectation;request=@{path='/databases/(default)/documents/users/cms-test';method='create';auth=@{uid='cms-test';token=@{email='cms-test@example.com'}};resource=@{data=@{email='cms-test@example.com';role=$moonRole}}};functionMocks=@(@{function='get';args=@(@{anyValue=@{}});result=@{value=@{data=@{role='client'}}}})})
  $moonLabels.Add("Public signup role $moonRole -> $moonExpectation")
}
foreach ($moonOperator in @('CEO','Administración')) {
  foreach ($moonAssigned in @('Empleado','Diseño')) {
    $moonExpectation = if ($moonOperator -eq 'CEO' -or $moonAssigned -eq 'Empleado') { 'ALLOW' } else { 'DENY' }
    $moonCases.Add(@{expectation=$moonExpectation;request=@{path='/databases/(default)/documents/users/new-staff';method='create';auth=@{uid='cms-test';token=@{email='operator@example.com'}};resource=@{data=@{email='new-staff@example.com';role=$moonAssigned}}};functionMocks=@(@{function='get';args=@(@{anyValue=@{}});result=@{value=@{data=@{role=$moonOperator}}}})})
    $moonLabels.Add("$moonOperator creates $moonAssigned -> $moonExpectation")
  }
}

# Portal authorization tests use synthetic requests/resources only. They do not
# query production client documents or write to Firestore.
$moonPortalTime = '2026-10-14T12:00:00Z'
function New-MoonSolicitudData {
  return @{
    uid='cms-test';tipo='cotizacion';titulo='Mi nuevo proyecto';descripcion='Necesito una web para mi tienda.';
    estado='pendiente';imageUrl=$null;creadoEn=$moonPortalTime;actualizadoEn=$moonPortalTime;nota=''
  }
}
function New-MoonSocioData {
  return @{
    uid='cms-test';nombre='Cliente de prueba';email='cms-test@example.com';monto=1000;metodo='transferencia';
    mensaje='';tierLabel='Socio Plata';fileUrl=$null;estado='pendiente';creadoEn=$moonPortalTime
  }
}
function Add-MoonPortalCase($label, $route, $method, $expectation, $data = $null, $existing = $null, $role = 'client', $signedIn = $true) {
  $moonRequest = @{path="/databases/(default)/documents/moonStudios/$route/items/portal-test";method=$method;time=$moonPortalTime;auth=$null}
  if ($signedIn) { $moonRequest.auth = @{uid='cms-test';token=@{email='cms-test@example.com'}} }
  if ($null -ne $data) { $moonRequest.resource = @{data=$data} }
  $moonCase = @{expectation=$expectation;request=$moonRequest}
  if ($null -ne $existing) { $moonCase.resource = @{data=$existing} }
  if ($signedIn) { $moonCase.functionMocks = @(@{function='get';args=@(@{anyValue=@{}});result=@{value=@{data=@{role=$role}}}}) }
  $moonCases.Add($moonCase)
  $moonLabels.Add($label)
}

foreach ($moonRoute in @('solicitudes','socios')) {
  $moonOwner = @{uid='cms-test';estado='pendiente'}
  $moonOther = @{uid='another-client';estado='pendiente'}
  foreach ($moonMethod in @('get','list')) {
    Add-MoonPortalCase "$moonRoute anonymous $moonMethod denied" $moonRoute $moonMethod 'DENY' $null $moonOwner 'client' $false
    Add-MoonPortalCase "$moonRoute owner $moonMethod allowed" $moonRoute $moonMethod 'ALLOW' $null $moonOwner
    foreach ($moonRole in @('client','employee','Empleado','Diseño','Secretaría','Programación','Contador','CEO','Administración')) {
      $moonExpectation = if ($moonRole -in @('CEO','Administración')) { 'ALLOW' } else { 'DENY' }
      Add-MoonPortalCase "$moonRoute $moonRole $moonMethod another owner -> $moonExpectation" $moonRoute $moonMethod $moonExpectation $null $moonOther $moonRole
    }
  }
  foreach ($moonRole in @('client','employee','Empleado','CEO','Administración')) {
    $moonData = if ($moonRoute -eq 'solicitudes') { New-MoonSolicitudData } else { New-MoonSocioData }
    Add-MoonPortalCase "$moonRoute $moonRole legitimate own create" $moonRoute 'create' 'ALLOW' $moonData $null $moonRole
  }
  foreach ($moonMethod in @('update','delete')) {
    foreach ($moonRole in @('client','employee','Empleado','Diseño','Secretaría','Programación','Contador','CEO','Administración')) {
      $moonExpectation = if ($moonRole -in @('CEO','Administración')) { 'ALLOW' } else { 'DENY' }
      # CEO/Admin updates retain the existing dashboard review fields, including
      # local Timestamp.now()/new Date() rather than requiring request.time.
      $moonData = @{uid='cms-test';estado='aprobado';nota='Revisado por el equipo';actualizadoEn='2026-10-14T11:59:59Z';pagoConfirmado=$true;pagoEn='2026-10-14T11:59:59Z';revisadoPor='operator@example.com'}
      Add-MoonPortalCase "$moonRoute $moonRole owner $moonMethod -> $moonExpectation" $moonRoute $moonMethod $moonExpectation $moonData $moonOwner $moonRole
    }
  }
  $moonData = if ($moonRoute -eq 'solicitudes') { New-MoonSolicitudData } else { New-MoonSocioData }
  Add-MoonPortalCase "$moonRoute anonymous create denied" $moonRoute 'create' 'DENY' $moonData $null 'client' $false
  $moonData = $moonData.Clone(); $moonData.uid = 'another-client'
  Add-MoonPortalCase "$moonRoute create for another owner denied" $moonRoute 'create' 'DENY' $moonData
  foreach ($moonExtra in @('pagoConfirmado','pagoEn','revisadoPor','unexpected')) {
    $moonData = if ($moonRoute -eq 'solicitudes') { New-MoonSolicitudData } else { New-MoonSocioData }
    $moonData[$moonExtra] = 'forged'
    Add-MoonPortalCase "$moonRoute create with $moonExtra denied" $moonRoute 'create' 'DENY' $moonData
  }
  $moonData = if ($moonRoute -eq 'solicitudes') { New-MoonSolicitudData } else { New-MoonSocioData }
  $moonData.creadoEn = '2026-01-01T00:00:00Z'
  Add-MoonPortalCase "$moonRoute forged creation timestamp denied" $moonRoute 'create' 'DENY' $moonData
  $moonData = if ($moonRoute -eq 'solicitudes') { New-MoonSolicitudData } else { New-MoonSocioData }
  $moonData.Remove('uid')
  Add-MoonPortalCase "$moonRoute missing uid denied" $moonRoute 'create' 'DENY' $moonData
}

foreach ($moonType in @('cotizacion','ticket','alianza','soporte')) {
  $moonData = New-MoonSolicitudData; $moonData.tipo = $moonType
  Add-MoonPortalCase "solicitudes supported type $moonType" 'solicitudes' 'create' 'ALLOW' $moonData
}
foreach ($moonChange in @(
  @{field='estado';value='completado';label='forged completed state'},
  @{field='estado';value='en_proceso';label='forged in-progress state'},
  @{field='nota';value='Nota falsa del equipo';label='forged team note'},
  @{field='actualizadoEn';value='2026-01-01T00:00:00Z';label='forged update timestamp'},
  @{field='tipo';value='inventado';label='unsupported type'},
  @{field='titulo';value='abc';label='short title'},
  @{field='titulo';value=('a' * 121);label='oversized title'},
  @{field='titulo';value=123;label='invalid title type'},
  @{field='descripcion';value='muy corto';label='short description'},
  @{field='descripcion';value=('a' * 2001);label='oversized description'},
  @{field='imageUrl';value='javascript:alert(1)';label='javascript attachment'},
  @{field='imageUrl';value='http://example.com/reference.png';label='unencrypted attachment'},
  @{field='imageUrl';value=('https://example.com/' + ('a' * 2048));label='oversized attachment'}
)) {
  $moonData = New-MoonSolicitudData; $moonData[$moonChange.field] = $moonChange.value
  Add-MoonPortalCase "solicitudes $($moonChange.label) denied" 'solicitudes' 'create' 'DENY' $moonData
}
$moonData = New-MoonSolicitudData; $moonData.imageUrl = 'https://example.supabase.co/storage/v1/object/public/solicitudes/solicitudes/cms-test_ref.png'
Add-MoonPortalCase 'solicitudes HTTPS reference allowed' 'solicitudes' 'create' 'ALLOW' $moonData
$moonData = New-MoonSolicitudData; $moonData.titulo = ('a' * 120); $moonData.descripcion = ('a' * 2000)
Add-MoonPortalCase 'solicitudes exact maximum field lengths allowed' 'solicitudes' 'create' 'ALLOW' $moonData

foreach ($moonTier in @(
  @{amount=100;label='Socio Semilla'},@{amount=999;label='Socio Semilla'},
  @{amount=1000;label='Socio Plata'},@{amount=2499;label='Socio Plata'},
  @{amount=2500;label='Socio Oro'},@{amount=4999;label='Socio Oro'},
  @{amount=5000;label='Socio Platino'},@{amount=9999;label='Socio Platino'},
  @{amount=10000;label='Socio Fundador'}
)) {
  $moonData = New-MoonSocioData; $moonData.monto = $moonTier.amount; $moonData.tierLabel = $moonTier.label
  Add-MoonPortalCase "socios correct tier at $($moonTier.amount) allowed" 'socios' 'create' 'ALLOW' $moonData
}
foreach ($moonChange in @(
  @{field='estado';value='aprobado';label='self-approved investment'},
  @{field='estado';value='rechazado';label='forged staff state'},
  @{field='nota';value='Nota falsa del equipo';label='forged team note'},
  @{field='actualizadoEn';value=$moonPortalTime;label='forged review timestamp'},
  @{field='monto';value=99;label='amount below minimum'},
  @{field='monto';value=-1000;label='negative amount'},
  @{field='monto';value='1000';label='string amount'},
  @{field='monto';value=1000.5;label='fractional amount'},
  @{field='monto';value=9007199254740992;label='unsafe numeric amount'},
  @{field='metodo';value='tarjeta';label='unsupported payment method'},
  @{field='nombre';value='';label='empty client name'},
  @{field='nombre';value=('a' * 321);label='oversized client name'},
  @{field='email';value='someone-else@example.com';label='forged client email'},
  @{field='tierLabel';value='Socio Fundador';label='forged higher tier'},
  @{field='mensaje';value=('a' * 1001);label='oversized message'},
  @{field='fileUrl';value='javascript:alert(1)';label='javascript attachment'},
  @{field='fileUrl';value='http://example.com/proposal.pdf';label='unencrypted attachment'}
)) {
  $moonData = New-MoonSocioData; $moonData[$moonChange.field] = $moonChange.value
  Add-MoonPortalCase "socios $($moonChange.label) denied" 'socios' 'create' 'DENY' $moonData
}
$moonData = New-MoonSocioData; $moonData.metodo = 'efectivo'; $moonData.fileUrl = 'https://example.supabase.co/storage/v1/object/public/solicitudes/socios/cms-test_proposal.pdf'; $moonData.mensaje = ('a' * 1000)
Add-MoonPortalCase 'socios cash and HTTPS attachment allowed' 'socios' 'create' 'ALLOW' $moonData

$moonBody = @{ source = @{ files = @(@{name = 'firestore.rules'; content = $moonRules}) }; testSuite = @{testCases = $moonCases.ToArray()} } | ConvertTo-Json -Depth 30
$moonResult = Invoke-RestMethod -Method Post -Uri "https://firebaserules.googleapis.com/v1/projects/${moonProject}:test" -Headers $moonHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($moonBody))
$moonResult | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../.moon-qa/rules-test-result.json') -Encoding utf8
if ($moonResult.issues | Where-Object { $_.severity -eq 'ERROR' }) { $moonResult.issues | ConvertTo-Json -Depth 8; throw 'Rules compilation failed' }
$moonFailures = 0
for ($moonIndex = 0; $moonIndex -lt $moonCases.Count; $moonIndex++) {
  $moonState = $moonResult.testResults[$moonIndex].state
  Write-Output "$moonState | $($moonLabels[$moonIndex])"
  if ($moonState -ne 'SUCCESS') { $moonFailures++; $moonResult.testResults[$moonIndex] | ConvertTo-Json -Depth 10 }
}
if ($moonFailures -gt 0) { throw "$moonFailures rule tests failed" }
if ($moonVerifiedSourceHash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../firebase/firestore.rules') -Algorithm SHA256).Hash -or
    $moonVerifiedTestHash -ne (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash) {
  throw 'The rules or test script changed while verification was running. Run the tests again.'
}
@{
  sourceSha256=$moonVerifiedSourceHash
  testFileSha256=$moonVerifiedTestHash
  caseCount=$moonCases.Count
  allPassed=$true
  testedAt=[DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../.moon-qa/rules-test-manifest.json') -Encoding utf8
Write-Output "Verified $($moonCases.Count) CMS, signup and portal authorization/validation cases. No data writes performed."
