param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$moonProject = 'moon-studios-16102025'
$moonQa = Join-Path $PSScriptRoot '../.moon-qa'
$moonPrior = Get-Content -LiteralPath (Join-Path $moonQa 'rules-before.json') -Raw | ConvertFrom-Json
$moonTest = Get-Content -LiteralPath (Join-Path $moonQa 'rules-test-result.json') -Raw | ConvertFrom-Json
$moonTestManifest = Get-Content -LiteralPath (Join-Path $moonQa 'rules-test-manifest.json') -Raw | ConvertFrom-Json
$moonRulesPath = Join-Path $PSScriptRoot '../firebase/firestore.rules'
if (!$moonTestManifest.allPassed -or $moonTestManifest.caseCount -lt 100 -or
    $moonTest.testResults.Count -ne $moonTestManifest.caseCount -or
    ($moonTest.testResults | Where-Object {$_.state -ne 'SUCCESS'}) -or
    ($moonTest.issues | Where-Object {$_.severity -eq 'ERROR'})) { throw 'Run and pass the CMS and portal rule tests first.' }
if ($moonTestManifest.sourceSha256 -ne (Get-FileHash -LiteralPath $moonRulesPath -Algorithm SHA256).Hash -or
    $moonTestManifest.testFileSha256 -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'test-moon-rules.ps1') -Algorithm SHA256).Hash) {
  throw 'The rules or tests changed after verification. Run the rule tests again before deploying.'
}
$moonBefore = Get-Content -LiteralPath (Join-Path $moonQa 'firestore-before.rules') -Raw
$moonFragment = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../firebase/moon-content.rules.fragment') -Raw
$moonSource = Get-Content -LiteralPath $moonRulesPath -Raw
$moonExpected = $moonBefore.Replace('  } // cierra match /databases/{database}/documents', $moonFragment + [Environment]::NewLine + '  } // cierra match /databases/{database}/documents')
$moonOldCreate = @'
                        request.resource.data.email == request.auth.token.email) ||
                       (request.auth != null &&
                        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO');
'@
$moonNewCreate = @'
                        request.resource.data.email == request.auth.token.email &&
                        request.resource.data.role in ['client', 'employee', 'Empleado']) ||
                       (request.auth != null &&
                        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO' ||
                         (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Administración' &&
                          request.resource.data.role == 'Empleado')));
'@
$moonExpected = $moonExpected.Replace("`r`n", "`n").Replace($moonOldCreate.Replace("`r`n", "`n"), $moonNewCreate.Replace("`r`n", "`n"))
$moonPortalRegion = [regex]::new('(?s)    // ===== COLECCIÓN: MOON STUDIOS - SOLICITUDES =====.*?(?=    // ===== COLECCIÓN: MOON STUDIOS - EQUIPO =====)')
$moonNormalizedSource = $moonSource.Replace("`r`n", "`n")
if ($moonPortalRegion.Matches($moonExpected).Count -ne 1 -or $moonPortalRegion.Matches($moonNormalizedSource).Count -ne 1) {
  throw 'The verified portal rule boundaries are missing or ambiguous.'
}
# Only the audited portal block may differ from the previous scoped CMS rules.
# Its exact source is bound to the successful test run by the SHA256 manifest.
$moonExpectedOutsidePortal = $moonPortalRegion.Replace($moonExpected, '    // verified portal rules', 1)
$moonSourceOutsidePortal = $moonPortalRegion.Replace($moonNormalizedSource, '    // verified portal rules', 1)
if ($moonSourceOutsidePortal.Trim() -ne $moonExpectedOutsidePortal.Trim()) { throw 'The full rules file must preserve prior rules outside the verified CMS, signup and portal changes.' }
if ($ValidateOnly) {
  Write-Output "Validated local rules, scoped diff and $($moonTestManifest.caseCount) passing cases. No network access or deployment performed."
  return
}
$moonAccess = gcloud auth print-access-token 2>$null
if ($LASTEXITCODE -ne 0 -or !$moonAccess) { throw 'No authenticated Google Cloud session.' }
$moonHeaders = @{Authorization=('Bearer '+$moonAccess);'x-goog-user-project'=$moonProject}
$moonApi = 'https://firebaserules.googleapis.com/v1/'
$moonReleasePath = "projects/$moonProject/releases/cloud.firestore"
$moonRelease = Invoke-RestMethod -Uri ($moonApi+$moonReleasePath) -Headers $moonHeaders
$moonExpectedRuleset = $moonPrior.name
if (Test-Path -LiteralPath (Join-Path $moonQa 'rules-deployed.json')) { $moonExpectedRuleset = (Get-Content -LiteralPath (Join-Path $moonQa 'rules-deployed.json') -Raw | ConvertFrom-Json).ruleset }
if ($moonRelease.rulesetName -ne $moonExpectedRuleset) { throw 'Production rules changed since the backup. Refresh and merge before deploying.' }
$moonCreate = @{source=@{files=@(@{name='firestore.rules';content=$moonSource})}} | ConvertTo-Json -Depth 12
$moonRuleset = Invoke-RestMethod -Method Post -Uri ($moonApi+"projects/$moonProject/rulesets") -Headers $moonHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($moonCreate))
$moonUpdate = @{release=@{name=$moonReleasePath;rulesetName=$moonRuleset.name};updateMask='rulesetName'} | ConvertTo-Json -Depth 5
$moonPublished = Invoke-RestMethod -Method Patch -Uri ($moonApi+$moonReleasePath) -Headers $moonHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($moonUpdate))
if ($moonPublished.rulesetName -ne $moonRuleset.name) { throw 'Unexpected deployment result.' }
@{previousRuleset=$moonRelease.rulesetName;ruleset=$moonPublished.rulesetName;release=$moonPublished.name;updatedAt=$moonPublished.updateTime} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $moonQa 'rules-deployed.json') -Encoding utf8
Write-Output "Deployed verified website CMS and client portal rules: $($moonPublished.rulesetName). Previous ruleset retained for rollback."
