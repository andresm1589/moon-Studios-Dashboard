param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'election-rules-common.ps1')

$electionPrepared = Get-ElectionPreparedSource
$electionManifest = Read-ElectionJson (Join-Path $script:ElectionQa 'test-manifest.json')
$electionResultPath = Join-Path $script:ElectionQa 'test-result.json'
$electionResults = Read-ElectionJson $electionResultPath
$electionSourcePath = Join-Path $script:ElectionQa 'proposed.rules'
$electionRequiredHashes = @{
  sourceSha256=$electionSourcePath; fragmentSha256=$script:ElectionFragmentPath;
  baselineSha256=(Join-Path $script:ElectionQa 'baseline.rules');
  baselineManifestSha256=(Join-Path $script:ElectionQa 'baseline-manifest.json');
  testFileSha256=(Join-Path $PSScriptRoot 'test-election-rules.ps1');
  commonFileSha256=(Join-Path $PSScriptRoot 'election-rules-common.ps1');
  resultSha256=$electionResultPath
}
foreach ($electionKey in $electionRequiredHashes.Keys) {
  if ($electionManifest.$electionKey -ne (Get-ElectionHash $electionRequiredHashes[$electionKey])) { throw "The verified $electionKey changed. Rerun the election rules tests." }
}
if ([IO.File]::ReadAllText($electionSourcePath) -cne $electionPrepared.source -or
    $electionManifest.baselineRuleset -ne $electionPrepared.baseline.ruleset) { throw 'The proposed source is not the tested, scoped composition of the authoritative baseline.' }
if (!$electionManifest.allPassed -or $electionManifest.caseCount -lt 100 -or
    @($electionResults.testResults).Count -ne $electionManifest.caseCount -or
    ($electionResults.testResults | Where-Object {$_.state -ne 'SUCCESS'}) -or
    ($electionResults.issues | Where-Object {$_.severity -eq 'ERROR'})) { throw 'Pass every election authorization/atomic voting test before deploying.' }

# Exact prefix/suffix preservation is checked by Get-ElectionPreparedSource.
# Keep the reviewable before/after block, rather than a misleading full-file diff.
[IO.File]::WriteAllText((Join-Path $script:ElectionQa 'diff-before.rules'),$electionPrepared.oldBlock,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $script:ElectionQa 'diff-after.rules'),$electionPrepared.fragment,[Text.UTF8Encoding]::new($false))
Write-Output "Validated $($electionManifest.caseCount) cases; only SISTEMA ELECTORAL is replaced. Scoped preview: .moon-qa/elections/diff-before.rules and diff-after.rules."
$electionHeaders = Get-ElectionHeaders
$electionActive = Get-ElectionActiveRelease $electionHeaders
if ($electionActive.rulesetName -ne $electionPrepared.baseline.ruleset) { throw 'Production rules changed since the authoritative baseline. Refresh, review and retest before deploying.' }
if ($ValidateOnly) { Write-Output 'Active baseline confirmed. ValidateOnly: no ruleset or release was created, and no Firestore data was read or written.'; return }

# Recheck file hashes after the network wait and before the first mutation.
foreach ($electionKey in $electionRequiredHashes.Keys) {
  if ($electionManifest.$electionKey -ne (Get-ElectionHash $electionRequiredHashes[$electionKey])) { throw 'A verified artifact changed before publication. Rerun the tests.' }
}
$electionCreate = @{source=@{files=@(@{name='firestore.rules';content=$electionPrepared.source})}} | ConvertTo-Json -Depth 10
$electionRuleset = Invoke-RestMethod -Method Post -Uri ($script:ElectionApi+"projects/$($script:ElectionProject)/rulesets") -Headers $electionHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($electionCreate))
$electionBeforePatch = Get-ElectionActiveRelease $electionHeaders
if ($electionBeforePatch.rulesetName -ne $electionPrepared.baseline.ruleset) { throw 'Production rules changed while the new ruleset was being prepared. The active release was preserved; review and retest against the new baseline.' }
$electionReleasePath = "projects/$($script:ElectionProject)/releases/cloud.firestore"
$electionUpdate = @{release=@{name=$electionReleasePath;rulesetName=$electionRuleset.name};updateMask='rulesetName'} | ConvertTo-Json -Depth 5
$electionPublished = Invoke-RestMethod -Method Patch -Uri ($script:ElectionApi+$electionReleasePath) -Headers $electionHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($electionUpdate))
if ($electionPublished.rulesetName -ne $electionRuleset.name) { throw 'Unexpected election rules publication result.' }
$electionConfirmed = Get-ElectionActiveRelease $electionHeaders
if ($electionConfirmed.rulesetName -ne $electionRuleset.name) { throw 'The active Firestore ruleset does not match the published election rules.' }
Write-ElectionJson (Join-Path $script:ElectionQa 'deployed.json') @{
  previousRuleset=$electionActive.rulesetName;ruleset=$electionPublished.rulesetName;release=$electionPublished.name;
  updatedAt=$electionPublished.updateTime;sourceSha256=$electionManifest.sourceSha256;caseCount=$electionManifest.caseCount
}
Write-Output "Published verified electoral rules: $($electionPublished.rulesetName). Previous ruleset retained for rollback."
