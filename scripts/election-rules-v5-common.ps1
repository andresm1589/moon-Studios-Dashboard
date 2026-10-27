# Shared, read-only preparation used by the election rules test/deploy commands.
# Nothing in this file creates a ruleset, changes a release, or reads app data.
$script:ElectionProject = 'moon-studios-16102025'
$script:ElectionApi = 'https://firebaserules.googleapis.com/v1/'
$script:ElectionExpectedBaseline = 'projects/moon-studios-16102025/rulesets/3b3292c5-8877-423f-a2f9-abefe5d6ad59'
$script:ElectionQa = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.moon-qa/elections-v5'))
$script:ElectionFragmentPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../firebase/elections.rules.fragment'))
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

function Get-ElectionActiveRelease($Headers) {
  return Invoke-RestMethod -Uri ($script:ElectionApi+"projects/$($script:ElectionProject)/releases/cloud.firestore") -Headers $Headers
}

function Save-ElectionBaseline($Headers) {
  New-Item -ItemType Directory -Path $script:ElectionQa -Force | Out-Null
  $electionRelease = Get-ElectionActiveRelease $Headers
  if ($electionRelease.rulesetName -ne $script:ElectionExpectedBaseline) { throw 'The active rules are not the reviewed baseline. Review the new baseline before composing v5.' }
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
      $electionManifest.ruleset -ne $script:ElectionExpectedBaseline -or
      $electionManifest.ruleset -ne $electionRelease.rulesetName -or $electionRuleset.name -ne $electionManifest.ruleset) {
    throw 'The authoritative baseline files disagree. Refresh the baseline and rerun the tests.'
  }
  $electionBefore = [IO.File]::ReadAllText($electionBaselinePath)
  if ([string]$electionRuleset.source.files[0].content -cne $electionBefore) { throw 'The baseline source differs from the captured active ruleset.' }
  $electionComposedBefore=$electionBefore
  $electionFragment = [IO.File]::ReadAllText($script:ElectionFragmentPath)
  $electionMatches = $script:ElectionRegion.Matches($electionComposedBefore)
  if ($electionMatches.Count -ne 1 -or $electionFragment -notmatch '^\s*// ===== SISTEMA ELECTORAL =====' -or
      $electionFragment -match 'COLECCIÓN: CLIENTES' -or $electionFragment -match 'rules_version|service cloud\.firestore') {
    throw 'Only the complete electoral fragment may replace the verified electoral region.'
  }
  $electionExpectedMatches=@('/elections/{electionId}','/candidates/{candidateId}','/votes/{voteId}','/voteRecords/{recordId}','/electionResults/{resultId}','/auditLogs/{logId}','/electoralAccess/{accessId}','/electoralInvitations/{invitationId}','/electoralAnnouncements/{announcementId}','/electoralSettings/{settingsId}')
  $electionFragmentMatches=@([regex]::Matches($electionFragment,'(?m)^\s*match\s+(/\w+/\{\w+\})\s*\{') | ForEach-Object {$_.Groups[1].Value})
  if ($electionFragmentMatches.Count -ne 10 -or @([regex]::Matches($electionFragment,'\bmatch\s+')).Count -ne 10 -or
      @(Compare-Object ($electionExpectedMatches | Sort-Object) ($electionFragmentMatches | Sort-Object)).Count -ne 0) {
    throw 'The electoral fragment may only match its ten electoral collections.'
  }
  $electionMatch = $electionMatches[0]
  $electionSource = $electionComposedBefore.Substring(0,$electionMatch.Index)+$electionFragment.TrimEnd()+"`n`n"+$electionComposedBefore.Substring($electionMatch.Index+$electionMatch.Length)
  if ($script:ElectionRegion.Matches($electionSource).Count -ne 1 -or
      $script:ElectionRegion.Replace($electionSource, '<ELECTORAL>') -cne $script:ElectionRegion.Replace($electionComposedBefore, '<ELECTORAL>')) {
    throw 'The proposed source changes rules outside the electoral block.'
  }
  return @{source=$electionSource;before=$electionBefore;baseline=$electionManifest;fragment=$electionFragment;oldBlock=$electionMatch.Value;outsideElectoralSha256=(Get-ElectionTextHash ($script:ElectionRegion.Replace($electionBefore, '<ELECTORAL>')))}
}
