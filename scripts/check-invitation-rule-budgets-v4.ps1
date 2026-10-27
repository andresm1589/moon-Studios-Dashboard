$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'election-rules-v4-common.ps1')
$manifest=Read-ElectionJson (Join-Path $script:ElectionQa 'test-manifest.json')
$results=Read-ElectionJson (Join-Path $script:ElectionQa 'test-result.json')
$labels=@(Read-ElectionJson (Join-Path $script:ElectionQa 'test-labels.json'))
if(!$manifest.allPassed -or $manifest.resultSha256 -ne (Get-ElectionHash (Join-Path $script:ElectionQa 'test-result.json')) -or
  $manifest.sourceSha256 -ne (Get-ElectionHash (Join-Path $script:ElectionQa 'proposed.rules')) -or
  $labels.Count -ne $manifest.caseCount -or @($results.testResults).Count -ne $manifest.caseCount){throw 'Run and pass the complete v4 Rules API suite before checking budgets.'}
$groups=@(
  @{name='create';labels=@('Invitation create exact role [CEO] -> ALLOW','CEO audit INVITATION_CREATED -> ALLOW')},
  @{name='edit';labels=@('CEO can edit active invitation label and expiry','CEO audit INVITATION_UPDATED -> ALLOW')},
  @{name='revoke';labels=@('Invitation revoke exact role [CEO] -> ALLOW','CEO audit INVITATION_REVOKED -> ALLOW')},
  @{name='accept voter';labels=@('Guest accepts invitation candidate=False','Invitation atomically creates pending access candidate=False','external audit INVITATION_ACCEPTED -> ALLOW')},
  @{name='accept voter and candidate';labels=@('Guest accepts invitation candidate=True','Invitation atomically creates pending access candidate=True','external audit INVITATION_ACCEPTED -> ALLOW')},
  @{name='accept existing approved rights';labels=@('Invitation accepts with existing approved rights without access rewrite','external audit INVITATION_ACCEPTED -> ALLOW')}
)
$budgets=[System.Collections.Generic.List[object]]::new()
foreach($group in $groups){
  $union=[System.Collections.Generic.HashSet[string]]::new()
  $writes=[System.Collections.Generic.List[object]]::new()
  foreach($label in $group.labels){
    $index=[Array]::IndexOf($labels,$label)
    if($index -lt 0 -or $results.testResults[$index].state -ne 'SUCCESS'){throw "Missing passing case: $label"}
    $calls=@($results.testResults[$index].functionCalls | Where-Object {$_.function -in @('get','exists','getAfter','existsAfter')} | ForEach-Object {$_.function+':'+[string]$_.args[0]} | Sort-Object -Unique)
    if($calls.Count -gt 10){throw "Invitation write exceeds Rules document access budget: $label"}
    foreach($call in $calls){[void]$union.Add($call)}
    $writes.Add(@{case=$label;distinctFunctionPathCount=$calls.Count;calls=$calls})
  }
  if($union.Count -gt 20){throw "Invitation commit exceeds Rules document access budget: $($group.name)"}
  $budgets.Add(@{commit=$group.name;distinctFunctionPathCount=$union.Count;writes=$writes;calls=@($union | Sort-Object)})
}
Write-ElectionJson (Join-Path $script:ElectionQa 'invitation-access-budget.json') @{
  sourceSha256=$manifest.sourceSha256;allWithinBudget=$true;
  note='Synthetic Rules API trace inventory, not SDK emulator or production commits. Includes audit and pending-access writes; exists/get remain distinct while identical function/path accesses are cached.';
  budgets=$budgets
}
$budgets | Select-Object commit,distinctFunctionPathCount
