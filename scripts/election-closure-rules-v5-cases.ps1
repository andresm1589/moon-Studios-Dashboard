# Synthetic final-state closure cases. Nothing is written to Firestore.
$closureRoute='electoralSettings/general'
function New-GlobalSettings([bool]$Enabled=$true) {
  return @{enabled=$Enabled;closureTitle='Elecciones cerradas';closureMessage='Nos vemos en 2027.';returnYear=2027;updatedAt=$electionNow;updatedBy='voter'}
}
$script:ElectionExtraBudgetGroups=[System.Collections.Generic.List[object]]::new()
foreach($second in @($false,$true)) {
  foreach($role in @('CEO','external')) {
    $s=New-VoteState -Second:$second
    $s.before['users/voter']=if($role -eq 'CEO'){@{role='CEO';isActive=$true}}else{$null}
    $s.after['users/voter']=Copy-ElectionData $s.before['users/voter']
    $s.before[$closureRoute]=New-GlobalSettings;$s.after[$closureRoute]=New-GlobalSettings
    $script:ElectionExtraBudgetGroups.Add(@{label="configured open $role second=$second";offset=$electionCases.Count})
    Add-VotingCases "Configured open $role second=$second accepts all four atomic writes" 'ALLOW' $s
    foreach($fault in @('closed','missing-enabled','null-enabled','string-enabled','zero-enabled','missing-title','short-title','blank-title','missing-message','blank-message','missing-year','fractional-year','early-year','late-year')) {
      $c=Copy-ElectionData $s
      switch($fault) {
        'closed' {$c.after[$closureRoute].enabled=$false}
        'missing-enabled' {$c.after[$closureRoute].Remove('enabled')}
        'null-enabled' {$c.after[$closureRoute].enabled=$null}
        'string-enabled' {$c.after[$closureRoute].enabled='true'}
        'zero-enabled' {$c.after[$closureRoute].enabled=0}
        'missing-title' {$c.after[$closureRoute].Remove('closureTitle')}
        'short-title' {$c.after[$closureRoute].closureTitle='ab'}
        'blank-title' {$c.after[$closureRoute].closureTitle='     '}
        'missing-message' {$c.after[$closureRoute].Remove('closureMessage')}
        'blank-message' {$c.after[$closureRoute].closureMessage='  '}
        'missing-year' {$c.after[$closureRoute].Remove('returnYear')}
        'fractional-year' {$c.after[$closureRoute].returnYear=2027.5}
        'early-year' {$c.after[$closureRoute].returnYear=1999}
        'late-year' {$c.after[$closureRoute].returnYear=2201}
      }
      $c.before[$closureRoute]=Copy-ElectionData $c.after[$closureRoute]
      Add-VotingCases "Global $fault $role second=$second blocks every ballot component" 'DENY' $c
    }
    $c=Copy-ElectionData $s;$c.after[$closureRoute].enabled=$false
    Add-VotingCases "Same commit closes existing configuration $role second=$second" 'DENY' $c
    $c.before[$closureRoute]=$null
    Add-VotingCases "Same commit creates closed configuration $role second=$second" 'DENY' $c
  }
}
# Reopening and casting an approved ballot may be atomic for the real CEO;
# final-state open is the authority and the settings write has its own rule.
$s=New-VoteState -Second;$s.before['users/voter'].role='CEO';$s.after['users/voter'].role='CEO'
$s.before[$closureRoute]=New-GlobalSettings $false;$s.after[$closureRoute]=New-GlobalSettings
Add-VotingCases 'Verified CEO reopens and casts approved ballot atomically' 'ALLOW' $s
Add-ElectionCase 'Verified CEO atomic reopen is itself authorized' $closureRoute 'update' 'ALLOW' $s.before $s.after

# Every active participation path, including administrative review, is gated.
foreach($role in @('CEO','external')) {
  foreach($enabled in @($true,$false)) {
    $expected=if($enabled){'ALLOW'}else{'DENY'}
    $b=New-AccessState $role -Nomination;$b[$closureRoute]=New-GlobalSettings $enabled
    $a=Copy-ElectionData $b;$a[$accessRoute]=New-AccessData
    Add-ElectionCase "$role access creation global enabled=$enabled" $accessRoute 'create' $expected $b $a
    $b[$accessRoute]=New-AccessData;$a=Copy-ElectionData $b
    $a[$accessRoute].requestedCandidate=$true;$a[$accessRoute].candidateStatus='pending'
    Add-ElectionCase "$role self access expansion global enabled=$enabled" $accessRoute 'update' $expected $b $a
    $b[$accessRoute].requestedCandidate=$true;$b[$accessRoute].candidateStatus='approved';$b[$accessRoute].reviewedAt=$electionStart;$b[$accessRoute].reviewedBy='voter'
    $a=Copy-ElectionData $b;$a[$candidateRoute]=New-CandidateData
    $a[$candidateRoute].uid='voter';$a[$candidateRoute].positionIndex=0;$a[$candidateRoute].status='pending';$a[$candidateRoute].votes=0;$a[$candidateRoute].createdAt=$electionNow
    $a[$candidateRoute].Remove('approvedAt');$a[$candidateRoute].Remove('approvedBy')
    Add-ElectionCase "$role candidature creation global enabled=$enabled" $candidateRoute 'create' $expected $b $a
    $s=New-InvitationAcceptance -Candidate;$s.before['users/voter']=if($role -eq 'CEO'){@{role='CEO';isActive=$true}}else{$null};$s.after['users/voter']=Copy-ElectionData $s.before['users/voter']
    $s.before[$closureRoute]=New-GlobalSettings $enabled;$s.after[$closureRoute]=New-GlobalSettings $enabled
    Add-ElectionCase "$role invitation acceptance global enabled=$enabled" $invitationRoute 'update' $expected $s.before $s.after
    Add-ElectionCase "$role invitation pending access global enabled=$enabled" $invitationAccessRoute 'create' $expected $s.before $s.after
  }
}
foreach($enabled in @($true,$false)) {
  $expected=if($enabled){'ALLOW'}else{'DENY'}
  $b=New-AccessState 'CEO' -Nomination;$b[$closureRoute]=New-GlobalSettings $enabled;$b[$accessRoute]=New-AccessData
  $a=Copy-ElectionData $b;$a[$accessRoute].voterStatus='approved';$a[$accessRoute].reviewedAt=$electionNow;$a[$accessRoute].reviewedBy='voter'
  Add-ElectionCase "CEO voter review global enabled=$enabled" $accessRoute 'update' $expected $b $a
  $b[$accessRoute].requestedCandidate=$true;$b[$accessRoute].candidateStatus='approved';$b[$accessRoute].reviewedAt=$electionStart;$b[$accessRoute].reviewedBy='voter'
  $b[$candidateRoute]=New-CandidateData;$b[$candidateRoute].status='pending';$b[$candidateRoute].votes=0;$b[$candidateRoute].uid='voter'
  $a=Copy-ElectionData $b;$a[$candidateRoute].status='approved';$a[$candidateRoute].approvedAt=$electionNow;$a[$candidateRoute].approvedBy='voter'
  Add-ElectionCase "CEO candidate approval global enabled=$enabled" $candidateRoute 'update' $expected $b $a
  $a[$candidateRoute].status='rejected'
  Add-ElectionCase "CEO candidate rejection global enabled=$enabled" $candidateRoute 'update' $expected $b $a
  $b=New-AccessState 'CEO' -Nomination;$b[$closureRoute]=New-GlobalSettings $enabled
  $a=Copy-ElectionData $b;$a[$invitationRoute]=New-InvitationData -Candidate
  Add-ElectionCase "CEO invitation creation global enabled=$enabled" $invitationRoute 'create' $expected $b $a
}
# Closure must never lock the owner out of maintenance and publication.
$b=New-AccessState 'CEO' -Nomination;$b[$closureRoute]=New-GlobalSettings $false
$a=Copy-ElectionData $b;$a[$electionRoute].status='deleted';$a[$electionRoute].previousStatus='active';$a[$electionRoute].deletedAt=$electionNow;$a[$electionRoute].deletedBy='voter';$a[$electionRoute].updatedAt=$electionNow
Add-ElectionCase 'CEO moves process to trash while portal closed' $electionRoute 'update' 'ALLOW' $b $a
$b=Copy-ElectionData $a;$a=Copy-ElectionData $b;$a[$electionRoute].status='archived';$a[$electionRoute].Remove('previousStatus');$a[$electionRoute].Remove('deletedAt');$a[$electionRoute].Remove('deletedBy')
Add-ElectionCase 'CEO restores process archived while portal closed' $electionRoute 'update' 'ALLOW' $b $a
$b=New-InvitationState 'CEO';$b[$closureRoute]=New-GlobalSettings $false
$a=Copy-ElectionData $b;$a[$invitationRoute].label='Etiqueta durante cierre'
Add-ElectionCase 'CEO edits invitation while portal closed' $invitationRoute 'update' 'ALLOW' $b $a
$a=Copy-ElectionData $b;$a[$invitationRoute].status='revoked'
Add-ElectionCase 'CEO revokes invitation while portal closed' $invitationRoute 'update' 'ALLOW' $b $a
$b=New-AccessState 'CEO';$b[$closureRoute]=New-GlobalSettings $false
$a=Copy-ElectionData $b;$a[$noticeRoute]=New-Notice
Add-ElectionCase 'CEO publishes general announcement while portal closed' $noticeRoute 'create' 'ALLOW' $b $a
foreach($role in @('CEO','ceo','Ceo','CEO ','external','Administración')) {
  $b=New-AccessState $role;$b[$closureRoute]=New-GlobalSettings $false
  $a=Copy-ElectionData $b;$a[$closureRoute]=New-GlobalSettings
  $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "Exact role [$role] closure management" $closureRoute 'update' $expected $b $a
  Add-ElectionCase "Exact role [$role] cannot delete global settings" $closureRoute 'delete' 'DENY' $b $b
}
foreach($status in @('published','draft','withdrawn')) {
  $b=New-AccessState 'external';$b[$closureRoute]=New-GlobalSettings $false;$b[$noticeRoute]=New-Notice $status
  $expected=if($status -eq 'published'){'ALLOW'}else{'DENY'}
  foreach($method in @('get','list')) { Add-ElectionCase "Anonymous $method $status announcement during closure" $noticeRoute $method $expected $b $b '' }
}
# A partial batch must have at least one denied operation. Test every nonempty
# subset of the four writes and mutate omitted AFTER documents back to BEFORE.
# Full commits accept; all fourteen proper subsets reject. The expectation
# below models where the proof lives, and a separate cross-proof ledger asserts
# that a partial commit can never consist entirely of permitted operations.
$script:ElectionProofGroups=[System.Collections.Generic.List[object]]::new()
foreach($second in @($false,$true)) {
  for($mask=1;$mask -lt 16;$mask++) {
    $s=New-VoteState -Second:$second;$s.before[$closureRoute]=New-GlobalSettings;$s.after[$closureRoute]=New-GlobalSettings
    $routes=@(('votes/'+$s.voteId),'voteRecords/voter_election-1','candidates/candidate-1','elections/election-1')
    for($i=0;$i -lt 4;$i++){if(($mask -band (1 -shl $i)) -eq 0){$s.after[$routes[$i]]=Copy-ElectionData $s.before[$routes[$i]]}}
    $indices=[System.Collections.Generic.List[int]]::new()
    for($i=0;$i -lt 4;$i++) {
      if(($mask -band (1 -shl $i)) -eq 0){continue}
      # Ballot requires changed record. Record requires all four writes.
      # Aggregates require new ballot, changed record links and both counters.
      $allowed=if($i -eq 0){($mask -band 3) -eq 3}else{$mask -eq 15}
      $expected=if($allowed){'ALLOW'}else{'DENY'}
      $indices.Add($electionCases.Count)
      $method=if($i -eq 0 -or ($i -eq 1 -and !$second)){'create'}else{'update'}
      Add-ElectionCase "Atomic subset mask=$mask second=$second write=$i" $routes[$i] $method $expected $s.before $s.after
    }
    $script:ElectionProofGroups.Add(@{label="subset $mask second=$second";indices=$indices.ToArray();shouldAllow=($mask -eq 15)})
  }
}
