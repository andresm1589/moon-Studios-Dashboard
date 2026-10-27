# Shared, read-only preparation used by the election rules test/deploy commands.
# Nothing in this file creates a ruleset, changes a release, or reads app data.
$script:ElectionProject = 'moon-studios-16102025'
$script:ElectionApi = 'https://firebaserules.googleapis.com/v1/'
$script:ElectionQa = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.moon-qa/elections-v3'))
$script:ElectionFragmentPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../firebase/elections.rules.fragment'))
$script:ElectionCompanyPatchPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../firebase/company-auth.rules.patch.json'))
$script:ElectionRegion = [regex]::new('(?ms)^[ \t]*// ===== SISTEMA ELECTORAL =====.*?(?=^[ \t]*// ===== COLECCIÓN: CLIENTES =====)')

function Get-ElectionHeaders {
  $electionAccess = gcloud auth print-access-token 2>$null
  if ($LASTEXITCODE -ne 0 -or !$electionAccess) { throw 'No authenticated Google Cloud session.' }
  return @{Authorization=('Bearer '+$electionAccess); 'x-goog-user-project'=$script:ElectionProject}
}

function Write-ElectionJson([string]$Path, $Value) {
  $electionJson = ConvertTo-Json -InputObject $Value -Depth 70
  [IO.File]::WriteAllText($Path, $electionJson, [Text.UTF8Encoding]::new($false))
}

function Read-ElectionJson([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { throw "Missing verification artifact: $Path" }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-ElectionHash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Get-ElectionTextHash([string]$Value) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Value)))
}

function Add-ElectionCompanyBoundary([string]$Source) {
  $patch=Read-ElectionJson $script:ElectionCompanyPatchPath
  $sourceLf=$Source.Replace("`r`n","`n")
  if($patch.schemaVersion -ne 1 -or $patch.sourceNormalizedSha256 -ne (Get-ElectionTextHash $sourceLf)) {
    throw 'The company authorization patch is not based on this exact authoritative baseline.'
  }
  $allowed=@('/users/{userId}','/discord/{document}','/tasks/{taskId}','/announcements/{announcementId}',
    '/forms/{formId}','/activityLogs/{logId}','/userActivityLogs/{logId}','/userSessions/{sessionId}',
    '/sessions/{sessionId}','/taskReports/{reportId}','/correos/{correoId}','/mensajeria/{mensajeId}',
    '/hilos/{hiloId}','/notifications/{notifId}','/contabilidad_transacciones/{docId}','/contabilidad_facturas/{docId}',
    '/contabilidad_presupuestos/{docId}','/contabilidad_sueldos/{docId}','/contabilidad_config/{docId}','/contabilidad_asientos/{docId}',
    '/dashboard_banners/{docId}','/dashboard_config/{docId}','/contracts/{contractId}','/conferences/{conferenceId}',
    '/userInvitations/{email}','/diseno_media/{docId}','/secretaria_docs/{docId}','/dev_projects/{projectId}',
    '/dev_changelog/{changeId}','/dev_tasks/{taskId}','/system_logs/{logId}','/libro_diario/{entryId}',
    '/maintenance/{docId}','/maintenance/history/records/{recordId}','/uptime_snapshots/{dateDoc}',
    '/bug_reports/{reportId}','/correos_panel_moonstudios/{correoId}','/moon_studios_fest_2026/{registroId}',
    '/config/{docId}','/clientes/{clienteId}','/moonStudios/equipo/items/{itemId}',
    '/moonStudios/portfolio/items/{itemId}','function:canManageMoonPortal','function:canManageMoonWebsite')
  if(@($patch.replacements).Count -ne $allowed.Count -or
    @(Compare-Object ($allowed | Sort-Object) (@($patch.replacements.path) | Sort-Object)).Count -ne 0) {
    throw 'The company authorization patch changed its reviewed collection/function scope.'
  }
  foreach($replacement in $patch.replacements) {
    if(!$replacement.before -or !$replacement.after -or
      $replacement.beforeSha256 -ne (Get-ElectionTextHash $replacement.before) -or
      $replacement.afterSha256 -ne (Get-ElectionTextHash $replacement.after) -or
      ([regex]::Matches($sourceLf,[regex]::Escape($replacement.before))).Count -ne 1 -or
      $replacement.before -match 'SISTEMA ELECTORAL|rules_version|service cloud\.firestore' -or
      $replacement.after -match 'SISTEMA ELECTORAL|rules_version|service cloud\.firestore') {
      throw "An authorization patch replacement is invalid or no longer exact: $($replacement.path)"
    }
    $beforeMatches=@([regex]::Matches($replacement.before,'\bmatch\s+([^\s]+)') | ForEach-Object {$_.Groups[1].Value})
    $afterMatches=@([regex]::Matches($replacement.after,'\bmatch\s+([^\s]+)') | ForEach-Object {$_.Groups[1].Value})
    if($beforeMatches.Count -ne $afterMatches.Count -or @(Compare-Object $beforeMatches $afterMatches).Count -ne 0) {
      throw 'Corporate authorization may not add or remove collection matches.'
    }
    $sourceLf=$sourceLf.Replace([string]$replacement.before,[string]$replacement.after)
  }
  $insertion=$patch.helpersInsertion
  $helperNames=@([regex]::Matches($insertion.text,'\bfunction\s+(\w+)') | ForEach-Object {$_.Groups[1].Value})
  if($insertion.beforeMarker -cne '    // ===== COLECCIÓN: USERS =====' -or
    ([regex]::Matches($sourceLf,[regex]::Escape($insertion.beforeMarker))).Count -ne 1 -or
    $insertion.textSha256 -ne (Get-ElectionTextHash $insertion.text) -or $insertion.text -match '\bmatch\s+|rules_version|service cloud\.firestore' -or
    @(Compare-Object @('moonCompanyStaff','moonCompanyCEO','moonCompanyAdmin','moonSelfProfileUpdate') $helperNames).Count -ne 0) {
    throw 'The reviewed corporate membership helpers changed scope or integrity.'
  }
  return @{source=$sourceLf.Replace([string]$insertion.beforeMarker,[string]$insertion.text+[string]$insertion.beforeMarker);paths=$allowed}
}

function Get-ElectionActiveRelease($Headers) {
  return Invoke-RestMethod -Uri ($script:ElectionApi+"projects/$($script:ElectionProject)/releases/cloud.firestore") -Headers $Headers
}

function Save-ElectionBaseline($Headers) {
  New-Item -ItemType Directory -Path $script:ElectionQa -Force | Out-Null
  $electionRelease = Get-ElectionActiveRelease $Headers
  $electionRuleset = Invoke-RestMethod -Uri ($script:ElectionApi+$electionRelease.rulesetName) -Headers $Headers
  $electionFiles = @($electionRuleset.source.files)
  if ($electionFiles.Count -ne 1 -or $electionFiles[0].name -ne 'firestore.rules') { throw 'Expected exactly one authoritative Firestore rules file.' }
  $electionContent = [string]$electionFiles[0].content
  if ($script:ElectionRegion.Matches($electionContent).Count -ne 1) { throw 'The active electoral boundaries are missing or ambiguous.' }
  Write-ElectionJson (Join-Path $script:ElectionQa 'baseline-release.json') $electionRelease
  Write-ElectionJson (Join-Path $script:ElectionQa 'baseline-ruleset.json') $electionRuleset
  [IO.File]::WriteAllText((Join-Path $script:ElectionQa 'baseline.rules'), $electionContent, [Text.UTF8Encoding]::new($false))
  Write-ElectionJson (Join-Path $script:ElectionQa 'baseline-manifest.json') @{
    ruleset=$electionRelease.rulesetName; sourceSha256=(Get-ElectionHash (Join-Path $script:ElectionQa 'baseline.rules'));
    capturedAt=[DateTime]::UtcNow.ToString('o')
  }
}

function Get-ElectionPreparedSource {
  $electionBaselinePath = Join-Path $script:ElectionQa 'baseline.rules'
  $electionManifest = Read-ElectionJson (Join-Path $script:ElectionQa 'baseline-manifest.json')
  $electionRelease = Read-ElectionJson (Join-Path $script:ElectionQa 'baseline-release.json')
  $electionRuleset = Read-ElectionJson (Join-Path $script:ElectionQa 'baseline-ruleset.json')
  if ($electionManifest.sourceSha256 -ne (Get-ElectionHash $electionBaselinePath) -or
      $electionManifest.ruleset -ne $electionRelease.rulesetName -or $electionRuleset.name -ne $electionManifest.ruleset) {
    throw 'The authoritative baseline files disagree. Refresh the baseline and rerun the tests.'
  }
  $electionBefore = [IO.File]::ReadAllText($electionBaselinePath)
  if ([string]$electionRuleset.source.files[0].content -cne $electionBefore) { throw 'The baseline source differs from the captured active ruleset.' }
  $electionCompany=Add-ElectionCompanyBoundary $electionBefore
  $electionComposedBefore=$electionCompany.source
  $electionFragment = [IO.File]::ReadAllText($script:ElectionFragmentPath)
  $electionMatches = $script:ElectionRegion.Matches($electionComposedBefore)
  if ($electionMatches.Count -ne 1 -or $electionFragment -notmatch '^\s*// ===== SISTEMA ELECTORAL =====' -or
      $electionFragment -match 'COLECCIÓN: CLIENTES' -or $electionFragment -match 'rules_version|service cloud\.firestore') {
    throw 'Only the complete electoral fragment may replace the verified electoral region.'
  }
  $electionExpectedMatches=@('/elections/{electionId}','/candidates/{candidateId}','/votes/{voteId}','/voteRecords/{recordId}','/electionResults/{resultId}','/auditLogs/{logId}','/electoralAccess/{accessId}')
  $electionFragmentMatches=@([regex]::Matches($electionFragment,'(?m)^\s*match\s+(/\w+/\{\w+\})\s*\{') | ForEach-Object {$_.Groups[1].Value})
  if ($electionFragmentMatches.Count -ne 7 -or @([regex]::Matches($electionFragment,'\bmatch\s+')).Count -ne 7 -or
      @(Compare-Object ($electionExpectedMatches | Sort-Object) ($electionFragmentMatches | Sort-Object)).Count -ne 0) {
    throw 'The electoral fragment may only match its seven electoral collections.'
  }
  $electionMatch = $electionMatches[0]
  $electionSource = $electionComposedBefore.Substring(0,$electionMatch.Index)+$electionFragment.TrimEnd()+"`n`n"+$electionComposedBefore.Substring($electionMatch.Index+$electionMatch.Length)
  if ($script:ElectionRegion.Matches($electionSource).Count -ne 1 -or
      $script:ElectionRegion.Replace($electionSource, '<ELECTORAL>') -cne $script:ElectionRegion.Replace($electionComposedBefore, '<ELECTORAL>')) {
    throw 'The proposed source changes rules outside the electoral block and exact reviewed corporate patch.'
  }
  return @{source=$electionSource;before=$electionBefore;baseline=$electionManifest;fragment=$electionFragment;oldBlock=$electionMatch.Value;companyPaths=$electionCompany.paths}
}
