# Extra synthetic proof groups, sourced AFTER election-closure-rules-v5-cases.ps1.
# Every AFTER document is a mock. No application reads, votes or commits occur.
# Individual rules may delegate a proof to another mandatory operation; the
# complete group must always contain a denied operation for an invalid commit.
if ($null -eq $script:ElectionProofGroups) {
  $script:ElectionProofGroups=[System.Collections.Generic.List[object]]::new()
}

# Replay uses an already-existing ballot with an adversarial timestamp exactly
# equal to request.time. Do not rely on time advancing or on a consistent legacy
# record: both the missing-record and empty-record cases must still be safe.
# There is NO ballot operation in these batches. The record can pass its local
# rule, but BOTH aggregate rules reject because the ballot existed BEFORE.
foreach($role in @('CEO','external')) {
  foreach($recordMode in @('missing','empty','already-voted')) {
    $s=New-VoteState
    $s.before['users/voter']=if($role -ceq 'CEO'){@{role='CEO';isActive=$true}}else{$null}
    $s.after['users/voter']=Copy-ElectionData $s.before['users/voter']
    $s.before[$closureRoute]=New-GlobalSettings
    $s.after[$closureRoute]=New-GlobalSettings
    $s.before[('votes/'+$s.voteId)]=Copy-ElectionData $s.after[('votes/'+$s.voteId)]
    if($recordMode -eq 'empty') {
      $s.before['voteRecords/voter_election-1']=@{voterId='voter';electionId='election-1';positionsVoted=@();votedAt=$electionStart}
    } elseif($recordMode -eq 'already-voted') {
      $s.before['voteRecords/voter_election-1']=Copy-ElectionData $s.after['voteRecords/voter_election-1']
    }
    $indices=[System.Collections.Generic.List[int]]::new()
    foreach($entry in @(
      @{route='voteRecords/voter_election-1';method=$(if($recordMode -eq 'missing'){'create'}else{'update'});expected=$(if($recordMode -eq 'already-voted'){'DENY'}else{'ALLOW'})},
      @{route='candidates/candidate-1';method='update';expected='DENY'},
      @{route='elections/election-1';method='update';expected='DENY'}
    )) {
      $indices.Add($electionCases.Count)
      Add-ElectionCase "Existing ballot replay $role record=$recordMode / $($entry.route)" $entry.route $entry.method $entry.expected $s.before $s.after
    }
    $script:ElectionProofGroups.Add(@{label="existing ballot replay $role record=$recordMode";indices=$indices.ToArray();shouldAllow=$false})
    Add-ElectionCase "Existing ballot cannot update even with same timestamp $role record=$recordMode" ('votes/'+$s.voteId) 'update' 'DENY' $s.before $s.after
    Add-ElectionCase "Existing ballot cannot delete $role record=$recordMode" ('votes/'+$s.voteId) 'delete' 'DENY' $s.before $s.after
  }
}

# A forged AFTER open setting may make vote-component rules pass in isolation.
# The settings write is independently authorized; only exact verified CEO may
# complete all FIVE operations. Other roles cannot reopen through a vote batch.
foreach($second in @($false,$true)) {
  foreach($role in @('CEO','external','ceo','Ceo','CEO ','Administración')) {
    $s=New-VoteState -Second:$second
    $s.before['users/voter']=if($role -eq 'external'){$null}else{@{role=$role;isActive=$true}}
    $s.after['users/voter']=Copy-ElectionData $s.before['users/voter']
    $s.before[$closureRoute]=New-GlobalSettings $false
    $s.after[$closureRoute]=New-GlobalSettings
    $indices=[System.Collections.Generic.List[int]]::new()
    $offset=$electionCases.Count
    Add-VotingCases "Atomic reopen vote components role=[$role] second=$second" 'ALLOW' $s
    for($index=$offset;$index -lt $electionCases.Count;$index++){$indices.Add($index)}
    $indices.Add($electionCases.Count)
    $settingsExpected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
    Add-ElectionCase "Atomic reopen settings role=[$role] second=$second" $closureRoute 'update' $settingsExpected $s.before $s.after
    $script:ElectionProofGroups.Add(@{label="five-write reopen role=[$role] second=$second";indices=$indices.ToArray();shouldAllow=($role -ceq 'CEO')})
  }
  # Closing has the opposite result: the CEO may write the closure, but every
  # vote component sees final-state false, so no combined close+vote can pass.
  $s=New-VoteState -Second:$second
  $s.before['users/voter']=@{role='CEO';isActive=$true}
  $s.after['users/voter']=Copy-ElectionData $s.before['users/voter']
  $s.before[$closureRoute]=New-GlobalSettings
  $s.after[$closureRoute]=New-GlobalSettings $false
  $indices=[System.Collections.Generic.List[int]]::new()
  $offset=$electionCases.Count
  Add-VotingCases "Atomic CEO close vote components second=$second" 'DENY' $s
  for($index=$offset;$index -lt $electionCases.Count;$index++){$indices.Add($index)}
  $indices.Add($electionCases.Count)
  Add-ElectionCase "Atomic CEO close settings second=$second" $closureRoute 'update' 'ALLOW' $s.before $s.after
  $script:ElectionProofGroups.Add(@{label="five-write CEO close second=$second";indices=$indices.ToArray();shouldAllow=$false})
}
