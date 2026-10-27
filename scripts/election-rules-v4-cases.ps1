# Synthetic data only. The Rules API evaluates mocked reads and never commits.
function New-AccessData([string]$Uid='voter') {
  return @{uid=$Uid;electionId='election-1';displayName='Participante externo';email=($Uid+'@example.com');photoURL='';
    requestedVoter=$true;requestedCandidate=$false;voterStatus='pending';candidateStatus='none';createdAt=$electionNow;updatedAt=$electionNow}
}
function New-AccessState([string]$Role='external',[switch]$Nomination) {
  $data=New-ElectionData
  if($Nomination){$data.startDate='2026-10-16T14:00:00Z';$data.endDate='2026-10-16T18:00:00Z';$data.registrationEndDate='2026-10-16T13:00:00Z'}
  $profile=if($Role -eq 'external'){$null}else{@{role=$Role;isActive=$true}}
  return @{'users/voter'=$profile;'elections/election-1'=$data;'electoralAccess/voter_election-1'=$null}
}

# Every role needs explicit per-process approval, including CEO and staff.
foreach($role in @('external','CEO','ceo','Administración','Empleado','admin','moderator','superadmin','client')) {
  $state=New-VoteState
  if($role -eq 'external'){$state.before['users/voter']=$null;$state.after['users/voter']=$null}
  else{$state.before['users/voter'].role=$role;$state.after['users/voter'].role=$role}
  Add-VotingCases "$role with CEO-approved voter right can vote" 'ALLOW' $state
  foreach($status in @('none','pending','rejected','missing')) {
    $changed=Copy-ElectionData $state
    if($status -eq 'missing'){$changed.before['electoralAccess/voter_election-1']=$null;$changed.after['electoralAccess/voter_election-1']=$null}
    else{$changed.before['electoralAccess/voter_election-1'].voterStatus=$status;$changed.after['electoralAccess/voter_election-1'].voterStatus=$status}
    Add-ElectionCase "$role voter $status cannot vote" ('votes/'+$changed.voteId) 'create' 'DENY' $changed.before $changed.after
  }
}
$state=New-VoteState;$state.before['electoralAccess/voter_election-1'].uid='intruder';$state.after['electoralAccess/voter_election-1'].uid='intruder'
Add-VotingCases 'Forged approval owner cannot vote' 'DENY' $state
$state=New-VoteState;$state.before['electoralAccess/voter_election-1'].electionId='another';$state.after['electoralAccess/voter_election-1'].electionId='another'
Add-VotingCases 'Approval from a different election cannot vote' 'DENY' $state

# Access requests never promote users or self-approve. Rejections are stable.
$accessRoute='electoralAccess/voter_election-1'
$before=New-AccessState -Nomination;$after=Copy-ElectionData $before;$after[$accessRoute]=New-AccessData
Add-ElectionCase 'External user can request voter permission' $accessRoute 'create' 'ALLOW' $before $after
$after[$accessRoute].requestedCandidate=$true;$after[$accessRoute].candidateStatus='pending'
Add-ElectionCase 'External user can request both permissions' $accessRoute 'create' 'ALLOW' $before $after
foreach($fault in @('selfapprove-voter','selfapprove-candidate','fake-owner','fake-election','fake-id','both-none','reviewer','extra','forged-created','forged-updated','inactive','draft','closed','ended','late-candidate')) {
  $b=Copy-ElectionData $before;$a=Copy-ElectionData $after;$route=$accessRoute
  switch($fault) {
    'selfapprove-voter' {$a[$route].voterStatus='approved'}
    'selfapprove-candidate' {$a[$route].candidateStatus='approved'}
    'fake-owner' {$a[$route].uid='intruder'}
    'fake-election' {$a[$route].electionId='other';$b['elections/other']=$null;$a['elections/other']=$null}
    'fake-id' {$a['electoralAccess/forged']=$a[$route];$route='electoralAccess/forged'}
    'both-none' {$a[$route].requestedVoter=$false;$a[$route].requestedCandidate=$false;$a[$route].voterStatus='none';$a[$route].candidateStatus='none'}
    'reviewer' {$a[$route].reviewedAt=$electionNow;$a[$route].reviewedBy='voter'}
    'extra' {$a[$route].companyRole='CEO'}
    'forged-created' {$a[$route].createdAt=$electionStart}
    'forged-updated' {$a[$route].updatedAt=$electionStart}
    'inactive' {$b['users/voter']=@{role='CEO';isActive=$false};$a['users/voter']=$b['users/voter']}
    'draft' {$b['elections/election-1'].status='draft';$a['elections/election-1'].status='draft'}
    'closed' {$b['elections/election-1'].status='closed';$a['elections/election-1'].status='closed'}
    'ended' {$b['elections/election-1'].endDate=$electionNow;$a['elections/election-1'].endDate=$electionNow}
    'late-candidate' {$b['elections/election-1'].registrationEndDate=$electionNow;$a['elections/election-1'].registrationEndDate=$electionNow}
  }
  Add-ElectionCase "Access request rejects $fault" $route 'create' 'DENY' $b $a
}
$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before[$accessRoute].voterStatus='approved';$before[$accessRoute].reviewedAt=$electionStart;$before[$accessRoute].reviewedBy='ceo'
$after=Copy-ElectionData $before;$after[$accessRoute].requestedCandidate=$true;$after[$accessRoute].candidateStatus='pending'
Add-ElectionCase 'Approved voter can request candidate right without losing approval' $accessRoute 'update' 'ALLOW' $before $after
foreach($fault in @('selfapprove','reset-rejection','remove-right','identity','review-fields','approved-to-pending','past-deadline')) {
  $b=Copy-ElectionData $before;$a=Copy-ElectionData $after
  switch($fault) {
    'selfapprove' {$a[$accessRoute].candidateStatus='approved'}
    'reset-rejection' {$b[$accessRoute].requestedCandidate=$true;$b[$accessRoute].candidateStatus='rejected';$a[$accessRoute].candidateStatus='pending'}
    'remove-right' {$a[$accessRoute].requestedVoter=$false;$a[$accessRoute].voterStatus='none'}
    'identity' {$a[$accessRoute].email='forged@example.com'}
    'review-fields' {$a[$accessRoute].reviewedBy='voter'}
    'approved-to-pending' {$a[$accessRoute].voterStatus='pending'}
    'past-deadline' {$b['elections/election-1'].registrationEndDate=$electionNow;$a['elections/election-1'].registrationEndDate=$electionNow}
  }
  Add-ElectionCase "Self access update rejects $fault" $accessRoute 'update' 'DENY' $b $a
}

# Only exact stored CEO may review requests or administer elections, never a legacy admin.
foreach($role in @('external','CEO','ceo','Administración','Empleado','admin','moderator','superadmin','client')) {
  $before=New-AccessState $role -Nomination;$before[$accessRoute]=New-AccessData
  $after=Copy-ElectionData $before;$after[$accessRoute].voterStatus='approved';$after[$accessRoute].reviewedAt=$electionNow;$after[$accessRoute].reviewedBy='voter'
  $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "$role access review -> $expected" $accessRoute 'update' $expected $before $after
  $newElection=Copy-ElectionData $electionNewAfter['elections/new-election']
  $after['elections/new-election']=$newElection
  Add-ElectionCase "$role may create a draft -> $expected" 'elections/new-election' 'create' $expected $before $after
  $after=Copy-ElectionData $before;$after['elections/election-1'].status='closed';$after['elections/election-1'].updatedAt=$electionNow
  Add-ElectionCase "$role may close election -> $expected" 'elections/election-1' 'update' $expected $before $after
}
$before=New-AccessState 'CEO' -Nomination;$before[$accessRoute]=New-AccessData
$before[$accessRoute].requestedCandidate=$true;$before[$accessRoute].candidateStatus='rejected';$before[$accessRoute].voterStatus='approved'
$after=Copy-ElectionData $before;$after[$accessRoute].candidateStatus='approved';$after[$accessRoute].voterStatus='rejected';$after[$accessRoute].reviewedAt=$electionNow;$after[$accessRoute].reviewedBy='voter'
Add-ElectionCase 'CEO can reverse per-right approvals before deadlines' $accessRoute 'update' 'ALLOW' $before $after
foreach($fault in @('unrequested-candidate','foreign-reviewer','change-profile','late-candidate','closed-process','ended-process','invent-pending')) {
  $b=Copy-ElectionData $before;$a=Copy-ElectionData $after
  switch($fault) {
    'unrequested-candidate' {$b[$accessRoute].requestedCandidate=$false;$b[$accessRoute].candidateStatus='none';$a[$accessRoute].requestedCandidate=$false}
    'foreign-reviewer' {$a[$accessRoute].reviewedBy='other'}
    'change-profile' {$a[$accessRoute].displayName='Other person'}
    'late-candidate' {$b['elections/election-1'].startDate=$electionNow;$a['elections/election-1'].startDate=$electionNow}
    'closed-process' {$b['elections/election-1'].status='closed';$a['elections/election-1'].status='closed'}
    'ended-process' {$b['elections/election-1'].endDate=$electionNow;$a['elections/election-1'].endDate=$electionNow}
    'invent-pending' {$a[$accessRoute].candidateStatus='pending'}
  }
  Add-ElectionCase "CEO access review rejects $fault" $accessRoute 'update' 'DENY' $b $a
}

# Read boundaries support constrained participant queries and CEO review lists.
foreach($role in @('external','CEO','ceo','Empleado','admin')) {
  $before=New-AccessState $role -Nomination;$before[$accessRoute]=New-AccessData
  foreach($status in @('draft','active','closed','archived')) {
    $b=Copy-ElectionData $before;$b['elections/election-1'].status=$status
    $expected=if($status -ne 'draft' -or $role -ceq 'CEO'){'ALLOW'}else{'DENY'}
    foreach($method in @('get','list')) {Add-ElectionCase "$role $method $status election -> $expected" 'elections/election-1' $method $expected $b $b}
  }
  foreach($status in @('pending','approved','rejected')) {
    foreach($owner in @('voter','other')) {
      $b=Copy-ElectionData $before;$b['candidates/candidate-1']=New-CandidateData;$b['candidates/candidate-1'].status=$status;$b['candidates/candidate-1'].uid=$owner
      $expected=if($status -eq 'approved' -or $owner -eq 'voter' -or $role -ceq 'CEO'){'ALLOW'}else{'DENY'}
      Add-ElectionCase "$role reads $status candidacy owner $owner -> $expected" 'candidates/candidate-1' 'get' $expected $b $b
    }
  }
  Add-ElectionCase "$role reads own access" $accessRoute 'get' 'ALLOW' $before $before
  $b=Copy-ElectionData $before;$b[$accessRoute].uid='other'
  $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
  foreach($method in @('get','list')){Add-ElectionCase "$role $method another participant access -> $expected" $accessRoute $method $expected $b $b}
}
$before=New-AccessState -Nomination
Add-ElectionCase 'External can get own nonexistent access for atomic request' $accessRoute 'get' 'ALLOW' $before $before
foreach($route in @('elections/election-1',$accessRoute,'candidates/candidate-1')) {
  $b=Copy-ElectionData $before;$b[$accessRoute]=New-AccessData;$b['candidates/candidate-1']=New-CandidateData
  Add-ElectionCase "Anonymous cannot read $route" $route 'get' 'DENY' $b $b ''
}

# Deterministic candidature, approved right and server-clock registration window.
$candidateRoute='candidates/voter_election-1_0'
$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before[$accessRoute].requestedCandidate=$true;$before[$accessRoute].candidateStatus='approved';$before[$accessRoute].reviewedAt=$electionStart;$before[$accessRoute].reviewedBy='manager'
$after=Copy-ElectionData $before;$after[$candidateRoute]=New-CandidateData
$after[$candidateRoute].positionIndex=0;$after[$candidateRoute].uid='voter';$after[$candidateRoute].status='pending';$after[$candidateRoute].votes=0;$after[$candidateRoute].createdAt=$electionNow
$after[$candidateRoute].Remove('approvedAt');$after[$candidateRoute].Remove('approvedBy')
Add-ElectionCase 'External approved applicant can submit pending candidature' $candidateRoute 'create' 'ALLOW' $before $after
foreach($fault in @('unapproved','self-approve','invent-votes','other-owner','wrong-position','wrong-index','nondeterministic','forged-time','extra','draft','early','at-deadline','vote-start')) {
  $b=Copy-ElectionData $before;$a=Copy-ElectionData $after;$route=$candidateRoute
  switch($fault) {
    'unapproved' {$b[$accessRoute].candidateStatus='pending';$a[$accessRoute].candidateStatus='pending'}
    'self-approve' {$a[$route].status='approved'}
    'invent-votes' {$a[$route].votes=1}
    'other-owner' {$a[$route].uid='other'}
    'wrong-position' {$a[$route].position='Imaginary'}
    'wrong-index' {$a['candidates/voter_election-1_1']=$a[$route];$route='candidates/voter_election-1_1'}
    'nondeterministic' {$a['candidates/random']=$a[$route];$route='candidates/random'}
    'forged-time' {$a[$route].createdAt=$electionStart}
    'extra' {$a[$route].companyRole='CEO'}
    'draft' {$b['elections/election-1'].status='draft';$a['elections/election-1'].status='draft'}
    'early' {$b['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z';$a['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z'}
    'at-deadline' {$b['elections/election-1'].registrationEndDate=$electionNow;$a['elections/election-1'].registrationEndDate=$electionNow}
    'vote-start' {$b['elections/election-1'].startDate=$electionNow;$a['elections/election-1'].startDate=$electionNow}
  }
  Add-ElectionCase "Candidature rejects $fault" $route 'create' 'DENY' $b $a
}
$b=Copy-ElectionData $before;$a=Copy-ElectionData $after;$b['elections/election-1'].registrationStartDate=$electionNow;$a['elections/election-1'].registrationStartDate=$electionNow
Add-ElectionCase 'Candidature at exact registration start accepted' $candidateRoute 'create' 'ALLOW' $b $a
$b=Copy-ElectionData $before;$a=Copy-ElectionData $after
foreach($key in @('registrationStartDate','registrationEndDate')){$b['elections/election-1'].Remove($key);$a['elections/election-1'].Remove($key)}
Add-ElectionCase 'Legacy published registration defaults to createdAt and startDate' $candidateRoute 'create' 'ALLOW' $b $a

# CEO may reverse nomination review before voting, preserving every other field.
foreach($role in @('CEO','ceo','external','admin','Empleado')) {
  foreach($status in @('pending','approved','rejected')) {
    $b=Copy-ElectionData $after;$b['users/voter']=if($role -eq 'external'){$null}else{@{role=$role;isActive=$true}};$b[$candidateRoute].status=$status
    $a=Copy-ElectionData $b;$a[$candidateRoute].status=if($status -eq 'approved'){'rejected'}else{'approved'};$a[$candidateRoute].approvedAt=$electionNow;$a[$candidateRoute].approvedBy='voter'
    $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
    Add-ElectionCase "$role review $status candidature -> $expected" $candidateRoute 'update' $expected $b $a
  }
}
$b=Copy-ElectionData $after;$b['users/voter']=@{role='CEO';isActive=$true};$b['elections/election-1'].startDate=$electionNow
$a=Copy-ElectionData $b;$a[$candidateRoute].status='approved';$a[$candidateRoute].approvedAt=$electionNow;$a[$candidateRoute].approvedBy='voter'
Add-ElectionCase 'CEO cannot change accepted candidates after voting starts' $candidateRoute 'update' 'DENY' $b $a

# Published schedules stay editable before opening; ballots protect all dates.
foreach($phase in @('draft','scheduled','open','ended','closed','archived')) {
  $b=New-AccessState 'CEO' -Nomination;$b['elections/election-1'].totalVotes=0
  if($phase -eq 'draft'){$b['elections/election-1'].status='draft'}
  elseif($phase -in @('open','ended')){$b['elections/election-1'].startDate='2026-10-16T10:00:00Z';$b['elections/election-1'].registrationEndDate='2026-10-16T09:00:00Z';if($phase -eq 'ended'){$b['elections/election-1'].endDate=$electionNow}}
  elseif($phase -in @('closed','archived')){$b['elections/election-1'].status=$phase}
  foreach($field in @('name','description','startDate','endDate','registrationStartDate','registrationEndDate','positions','departments','totalVotes','createdBy')) {
    $a=Copy-ElectionData $b;$e=$a['elections/election-1'];$e.updatedAt=$electionNow
    switch($field){
      'name'{$e.name='Nombre corregido'} 'description'{$e.description='Descripción corregida'}
      'startDate'{$e.startDate='2026-10-16T15:00:00Z'} 'endDate'{$e.endDate='2026-10-16T19:00:00Z'}
      'registrationStartDate'{$e.registrationStartDate='2026-10-16T08:00:00Z'}
      'registrationEndDate'{$e.registrationEndDate='2026-10-16T08:30:00Z'}
      'positions'{$e.positions=@('Otro cargo')} 'departments'{$e.departments=@('Otra área')}
      'totalVotes'{$e.totalVotes=10} 'createdBy'{$e.createdBy='other'}
    }
    $allowed=($phase -eq 'draft' -and $field -notin @('totalVotes','createdBy')) -or ($phase -eq 'scheduled' -and $field -in @('name','description','startDate','endDate','registrationStartDate','registrationEndDate')) -or ($phase -in @('open','ended') -and $field -in @('name','description'))
    $expected=if($allowed){'ALLOW'}else{'DENY'}
    Add-ElectionCase "CEO $phase editing $field -> $expected" 'elections/election-1' 'update' $expected $b $a
  }
}
foreach($change in @(@{field='registrationStartDate';value='2026-10-16T09:00:00Z'},@{field='registrationEndDate';value='2026-10-16T11:00:00Z'},@{field='registrationEndDate';value='invalid'})) {
  $a=Copy-ElectionData $electionNewAfter;$a['elections/new-election'][$change.field]=$change.value
  Add-ElectionCase "Election rejects invalid registration $($change.field)=$($change.value)" 'elections/new-election' 'create' 'DENY' $electionNewBefore $a
}
foreach($role in @('CEO','admin','external')) {
  $b=New-AccessState $role;$b['votes/ballot']=@{voterId='voter';candidateId='secret'};$b['voteRecords/voter_election-1']=@{voterId='voter';electionId='election-1';positionsVoted=@('Dirección')}
  foreach($method in @('get','list','update','delete')){Add-ElectionCase "$role cannot expose or modify individual ballot $method" 'votes/ballot' $method 'DENY' $b $b}
  Add-ElectionCase "$role reads own participation record" 'voteRecords/voter_election-1' 'get' 'ALLOW' $b $b
  $b['voteRecords/voter_election-1'].voterId='other'
  Add-ElectionCase "$role cannot read another participation record" 'voteRecords/voter_election-1' 'get' 'DENY' $b $b
  Add-ElectionCase "$role cannot list participation records" 'voteRecords/voter_election-1' 'list' 'DENY' $b $b
}

$before=New-AccessState -Nomination;$before['candidates/voter_election-1_0']=$null
Add-ElectionCase 'Participant can get nonexistent deterministic candidature before creation' 'candidates/voter_election-1_0' 'get' 'ALLOW' $before $before
$before['users/voter']=@{role='CEO';isActive=$true};$before[$accessRoute]=New-AccessData;$before[$accessRoute].requestedCandidate=$true;$before[$accessRoute].candidateStatus='rejected'
$before[$candidateRoute]=New-CandidateData;$before[$candidateRoute].status='pending';$before[$candidateRoute].uid='voter';$before[$candidateRoute].votes=0
$after=Copy-ElectionData $before;$after[$candidateRoute].status='approved';$after[$candidateRoute].approvedAt=$electionNow;$after[$candidateRoute].approvedBy='voter'
Add-ElectionCase 'CEO cannot approve candidature after candidate permission was revoked' $candidateRoute 'update' 'DENY' $before $after
$after[$candidateRoute].status='rejected'
Add-ElectionCase 'CEO may reject candidature after candidate permission was revoked' $candidateRoute 'update' 'ALLOW' $before $after

$state=New-VoteState
Add-ElectionCase 'Existing immutable ballot cannot be updated' ('votes/'+$state.voteId) 'update' 'DENY' $state.after $state.after
$before=New-AccessState -Nomination;$after=Copy-ElectionData $before;$after[$accessRoute]=New-AccessData;$after[$accessRoute].requestedCandidate=$true;$after[$accessRoute].candidateStatus='pending'
$before['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z';$after['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z'
Add-ElectionCase 'Candidate access request before registration starts denied' $accessRoute 'create' 'DENY' $before $after
$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before[$accessRoute].requestedCandidate=$true;$before[$accessRoute].candidateStatus='approved';$before[$accessRoute].reviewedAt=$electionStart;$before[$accessRoute].reviewedBy='manager'
$after=Copy-ElectionData $before;$after[$candidateRoute]=New-CandidateData;$after[$candidateRoute].uid='voter';$after[$candidateRoute].positionIndex=0;$after[$candidateRoute].status='pending';$after[$candidateRoute].votes=0;$after[$candidateRoute].createdAt=$electionNow;$after[$candidateRoute].Remove('approvedAt');$after[$candidateRoute].Remove('approvedBy')
foreach($badIndex in @(-1,20,0.5,'0',$null)) {
  $a=Copy-ElectionData $after;$a[$candidateRoute].positionIndex=$badIndex
  Add-ElectionCase "Malformed candidature index [$badIndex] denied" $candidateRoute 'create' 'DENY' $before $a
}

$before=New-AccessState -Nomination;$after=Copy-ElectionData $before;$after[$accessRoute]=New-AccessData
$after[$accessRoute].email='forged@example.com'
Add-ElectionCase 'Access request cannot forge another contact email' $accessRoute 'create' 'DENY' $before $after
$after[$accessRoute].email='voter@example.com'
Add-ElectionCase 'Verified Discord token email may request access' $accessRoute 'create' 'ALLOW' $before $after
$electionCases[$electionCases.Count-1].request.auth.token=@{electoral_email='voter@example.com'}
$after[$accessRoute].email=''
Add-ElectionCase 'Discord without verified email requests access with empty email' $accessRoute 'create' 'ALLOW' $before $after
$electionCases[$electionCases.Count-1].request.auth.token=@{}

$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before['users/manager']=@{role='CEO';isActive=$true}
$after=Copy-ElectionData $before;$after[$accessRoute].voterStatus='approved';$after[$accessRoute].reviewedAt=$electionNow;$after[$accessRoute].reviewedBy='manager'
Add-ElectionCase 'CEO approves a different voter with a different verified email' $accessRoute 'update' 'ALLOW' $before $after 'manager'
$state=New-VoteState;$state.before['electoralAccess/voter_election-1'].requestedVoter=$false;$state.after['electoralAccess/voter_election-1'].requestedVoter=$false
Add-VotingCases 'Malformed unrequested approved right cannot vote' 'DENY' $state
$state=New-VoteState;$state.before['electoralAccess/voter_election-1'].Remove('reviewedBy');$state.after['electoralAccess/voter_election-1'].Remove('reviewedBy')
Add-VotingCases 'Approval without CEO review metadata cannot vote' 'DENY' $state

$state=New-VoteState -Second;$state.before['voteRecords/voter_election-1'].voterId='other-owner'
Add-VotingCases 'A colliding record ID cannot overwrite another owner' 'DENY' $state
$state=New-VoteState -Second;$state.before['voteRecords/voter_election-1'].electionId='other-election'
Add-VotingCases 'A colliding record ID cannot overwrite another election' 'DENY' $state

# Legacy processes may have been created at/after voting began. Missing BOTH
# nomination dates must not block history closure or a spelling correction.
foreach($legacyCreated in @($electionStart,$electionNow)) {
  $before=New-AccessState 'CEO';$before['elections/election-1'].createdAt=$legacyCreated
  $before['elections/election-1'].Remove('registrationStartDate');$before['elections/election-1'].Remove('registrationEndDate')
  $after=Copy-ElectionData $before;$after['elections/election-1'].name='Nombre legado corregido';$after['elections/election-1'].updatedAt=$electionNow
  Add-ElectionCase "Legacy process created [$legacyCreated] can correct its name" 'elections/election-1' 'update' 'ALLOW' $before $after
  $after=Copy-ElectionData $before;$after['elections/election-1'].status='closed';$after['elections/election-1'].updatedAt=$electionNow
  Add-ElectionCase "Legacy process created [$legacyCreated] can close" 'elections/election-1' 'update' 'ALLOW' $before $after
}
foreach($removed in @('both','registrationStartDate','registrationEndDate')) {
  $before=New-AccessState 'CEO' -Nomination;$after=Copy-ElectionData $before;$after['elections/election-1'].updatedAt=$electionNow
  if($removed -eq 'both'){$after['elections/election-1'].Remove('registrationStartDate');$after['elections/election-1'].Remove('registrationEndDate')}
  else{$after['elections/election-1'].Remove($removed)}
  Add-ElectionCase "Existing process cannot remove [$removed] nomination dates" 'elections/election-1' 'update' 'DENY' $before $after
  $before=Copy-ElectionData $electionNewBefore;$after=Copy-ElectionData $electionNewAfter
  if($removed -eq 'both'){$after['elections/new-election'].Remove('registrationStartDate');$after['elections/new-election'].Remove('registrationEndDate')}
  else{$after['elections/new-election'].Remove($removed)}
  Add-ElectionCase "New process cannot omit [$removed] nomination dates" 'elections/new-election' 'create' 'DENY' $before $after
}

# An anonymous Firebase credential is not a verified electoral sign-in.
$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before['candidates/public']=New-CandidateData
foreach($route in @('elections/election-1','candidates/public',$accessRoute)) {
  foreach($method in @('get','list')) {
    Add-ElectionCase "Anonymous Firebase provider cannot $method $route" $route $method 'DENY' $before $before
    $electionCases[$electionCases.Count-1].request.auth.token=@{firebase=@{sign_in_provider='anonymous'}}
  }
}
$before=New-AccessState -Nomination;$after=Copy-ElectionData $before;$after[$accessRoute]=New-AccessData;$after[$accessRoute].email=''
Add-ElectionCase 'Anonymous Firebase provider cannot request voter permission' $accessRoute 'create' 'DENY' $before $after
$electionCases[$electionCases.Count-1].request.auth.token=@{firebase=@{sign_in_provider='anonymous'}}
$state=New-VoteState
Add-VotingCases 'Anonymous Firebase provider cannot cast a previously approved ballot' 'DENY' $state
foreach($index in (($electionCases.Count-4)..($electionCases.Count-1))) {$electionCases[$index].request.auth.token=@{firebase=@{sign_in_provider='anonymous'}}}
foreach($provider in @('password','google.com','custom')) {
  $before=New-AccessState -Nomination;$after=Copy-ElectionData $before;$after[$accessRoute]=New-AccessData
  Add-ElectionCase "Verified Firebase provider $provider can request permission" $accessRoute 'create' 'ALLOW' $before $after
  $electionCases[$electionCases.Count-1].request.auth.token=@{email='voter@example.com';firebase=@{sign_in_provider=$provider}}
}

# Company and electoral access share the same activation contract: an omitted
# legacy flag defaults true; explicit values must be the boolean true.
foreach($badActive in @($null,0,'false','true')) {
  $label=if($null -eq $badActive){'null'}else{([string]$badActive)+' ['+$badActive.GetType().Name+']'}
  $state=New-VoteState;$state.before['users/voter'].isActive=$badActive;$state.after['users/voter'].isActive=$badActive
  Add-VotingCases "Malformed isActive $label cannot cast approved ballot" 'DENY' $state
  $before=New-AccessState 'CEO' -Nomination;$before['users/voter'].isActive=$badActive;$before['candidates/public']=New-CandidateData
  foreach($method in @('get','list')) {Add-ElectionCase "Malformed isActive $label cannot $method published process" 'elections/election-1' $method 'DENY' $before $before}
  Add-ElectionCase "Malformed isActive $label cannot read approved candidature" 'candidates/public' 'get' 'DENY' $before $before
  $before[$accessRoute]=New-AccessData;$after=Copy-ElectionData $before;$after[$accessRoute].voterStatus='approved';$after[$accessRoute].reviewedAt=$electionNow;$after[$accessRoute].reviewedBy='voter'
  Add-ElectionCase "Malformed isActive $label cannot review voter permission as CEO" $accessRoute 'update' 'DENY' $before $after
}
$state=New-VoteState;$state.before['users/voter'].Remove('isActive');$state.after['users/voter'].Remove('isActive')
Add-VotingCases 'Legacy missing isActive flag keeps approved voter access' 'ALLOW' $state
$before=New-AccessState 'CEO' -Nomination;$before['users/voter'].Remove('isActive');$before[$accessRoute]=New-AccessData
$after=Copy-ElectionData $before;$after[$accessRoute].voterStatus='approved';$after[$accessRoute].reviewedAt=$electionNow;$after[$accessRoute].reviewedBy='voter'
Add-ElectionCase 'Legacy missing isActive flag keeps CEO permission review' $accessRoute 'update' 'ALLOW' $before $after
Add-ElectionCase 'Legacy missing isActive flag keeps published process read' 'elections/election-1' 'get' 'ALLOW' $before $before

# A verified provider email can change without changing the stable Firebase UID.
$before=New-AccessState -Nomination;$before[$accessRoute]=New-AccessData;$before[$accessRoute].email='old-verified@example.com';$before[$accessRoute].voterStatus='approved';$before[$accessRoute].reviewedAt=$electionStart;$before[$accessRoute].reviewedBy='manager'
$after=Copy-ElectionData $before;$after[$accessRoute].email='voter@example.com';$after[$accessRoute].requestedCandidate=$true;$after[$accessRoute].candidateStatus='pending'
Add-ElectionCase 'Own request can use a new verified provider email while adding pending right' $accessRoute 'update' 'ALLOW' $before $after
$changed=Copy-ElectionData $after;$changed[$accessRoute].email='forged@example.com'
Add-ElectionCase 'Provider email refresh cannot forge an unverified contact' $accessRoute 'update' 'DENY' $before $changed
$changed=Copy-ElectionData $after;$changed[$accessRoute].candidateStatus='approved'
Add-ElectionCase 'Provider email refresh cannot self-approve the new candidate right' $accessRoute 'update' 'DENY' $before $changed
$changed=Copy-ElectionData $after;$changed[$accessRoute].reviewedBy='voter';$changed[$accessRoute].reviewedAt=$electionNow
Add-ElectionCase 'Provider email refresh cannot alter CEO review metadata' $accessRoute 'update' 'DENY' $before $changed

# CEO deletion of nomination files: only without votes, never an approved
# option while its ballot is open, and never by participants or staff.
$deleteRoute='candidates/candidate-1'
foreach($case in @(
  @{label='CEO deletes pending file before voting';role='CEO';nomination=$true;status='pending';votes=0;expected='ALLOW'},
  @{label='CEO deletes rejected file before voting';role='CEO';nomination=$true;status='rejected';votes=0;expected='ALLOW'},
  @{label='CEO deletes approved file before voting starts';role='CEO';nomination=$true;status='approved';votes=0;expected='ALLOW'},
  @{label='CEO deletes rejected file during voting';role='CEO';nomination=$false;status='rejected';votes=0;expected='ALLOW'},
  @{label='CEO cannot remove an approved option while voting is open';role='CEO';nomination=$false;status='approved';votes=0;expected='DENY'},
  @{label='CEO cannot delete a file that received votes';role='CEO';nomination=$false;status='approved';votes=2;expected='DENY'},
  @{label='CEO cannot delete a rejected file that kept votes';role='CEO';nomination=$true;status='rejected';votes=1;expected='DENY'},
  @{label='Lowercase ceo cannot delete files';role='ceo';nomination=$true;status='pending';votes=0;expected='DENY'},
  @{label='Staff cannot delete files';role='Administración';nomination=$true;status='pending';votes=0;expected='DENY'},
  @{label='Owner participant cannot delete own file';role='external';nomination=$true;status='pending';votes=0;expected='DENY';owner='voter'}
)) {
  $before=if($case.nomination){New-AccessState $case.role -Nomination}else{New-AccessState $case.role}
  $before[$deleteRoute]=New-CandidateData;$before[$deleteRoute].status=$case.status;$before[$deleteRoute].votes=$case.votes
  if($case.owner){$before[$deleteRoute].uid=$case.owner}
  $after=Copy-ElectionData $before;$after[$deleteRoute]=$null
  Add-ElectionCase $case.label $deleteRoute 'delete' $case.expected $before $after
}
$before=New-AccessState 'CEO';$before[$deleteRoute]=New-CandidateData;$before[$deleteRoute].status='rejected';$before[$deleteRoute].votes=0;$before['elections/election-1']=$null
$after=Copy-ElectionData $before;$after[$deleteRoute]=$null
Add-ElectionCase 'CEO deletes an orphan file whose process no longer exists' $deleteRoute 'delete' 'ALLOW' $before $after
$before=New-AccessState 'CEO';$before[$deleteRoute]=New-CandidateData;$before[$deleteRoute].votes=0;$before[$deleteRoute].status='pending'
Add-ElectionCase 'Anonymous cannot delete files' $deleteRoute 'delete' 'DENY' $before $before ''

# Deletion audit entries are written only by the CEO.
$auditRoute='auditLogs/delete-audit'
foreach($role in @('CEO','Administración','external')) {
  $before=New-AccessState $role;$before[$auditRoute]=$null
  $after=Copy-ElectionData $before;$after[$auditRoute]=@{action='CANDIDATE_DELETED';userId='voter';userName='Dirección';details=@{electionId='election-1';candidateId='candidate-1'};timestamp=$electionNow}
  $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "$role writes CANDIDATE_DELETED audit -> $expected" $auditRoute 'create' $expected $before $after
}

# Trash and restore: the CEO keeps the previous status and author; restoring
# always returns an archived process without trash metadata.
$electionRoute='elections/election-1'
$before=New-AccessState 'CEO';$after=Copy-ElectionData $before
$after[$electionRoute].status='deleted';$after[$electionRoute].previousStatus='active';$after[$electionRoute].deletedAt=$electionNow;$after[$electionRoute].deletedBy='voter';$after[$electionRoute].updatedAt=$electionNow
Add-ElectionCase 'CEO moves an active process to the trash' $electionRoute 'update' 'ALLOW' $before $after
foreach($fault in @('wrong-previous','other-author','old-time','extra-change','lowercase-ceo','staff')) {
  $b=if($fault -eq 'lowercase-ceo'){New-AccessState 'ceo'}elseif($fault -eq 'staff'){New-AccessState 'Administración'}else{New-AccessState 'CEO'}
  $a=Copy-ElectionData $after;$a['users/voter']=Copy-ElectionData $b['users/voter']
  switch($fault){ 'wrong-previous'{$a[$electionRoute].previousStatus='draft'} 'other-author'{$a[$electionRoute].deletedBy='other'} 'old-time'{$a[$electionRoute].deletedAt=$electionStart} 'extra-change'{$a[$electionRoute].name='Otro nombre del proceso'} }
  Add-ElectionCase "Trash rejects $fault" $electionRoute 'update' 'DENY' $b $a
}
$trashed=Copy-ElectionData $after
$restored=Copy-ElectionData $trashed;$restored[$electionRoute].status='archived';$restored[$electionRoute].Remove('previousStatus');$restored[$electionRoute].Remove('deletedAt');$restored[$electionRoute].Remove('deletedBy');$restored[$electionRoute].updatedAt=$electionNow
Add-ElectionCase 'CEO restores a trashed process as archived' $electionRoute 'update' 'ALLOW' $trashed $restored
$a=Copy-ElectionData $restored;$a[$electionRoute].status='active'
Add-ElectionCase 'Restore cannot reopen a process' $electionRoute 'update' 'DENY' $trashed $a
$a=Copy-ElectionData $restored;$a[$electionRoute].deletedBy='voter'
Add-ElectionCase 'Restore must clear trash metadata' $electionRoute 'update' 'DENY' $trashed $a
foreach($role in @('external','Empleado')) {
  $b=New-AccessState $role;$b[$electionRoute]=Copy-ElectionData $trashed[$electionRoute]
  foreach($method in @('get','list')) { Add-ElectionCase "$role cannot $method a trashed process" $electionRoute $method 'DENY' $b $b }
}
$b=New-AccessState 'CEO';$b[$electionRoute]=Copy-ElectionData $trashed[$electionRoute]
Add-ElectionCase 'CEO reads the trash' $electionRoute 'get' 'ALLOW' $b $b

# Announcements: CEO-only writes, published-only reads for participants, no deletes.
$noticeRoute='electoralAnnouncements/notice-1'
function New-Notice([string]$Status='published',[string]$Election='') {
  return @{title='Calendario confirmado';body='Las fechas del proceso ya están publicadas.';status=$Status;electionId=$Election;pinned=$true;
    startsAt=$electionStart;endsAt=$electionEnd;createdAt=$electionNow;createdBy='voter';updatedAt=$electionNow;updatedBy='voter'}
}
foreach($case in @(
  @{label='CEO creates a general notice';role='CEO';election='';expected='ALLOW'},
  @{label='CEO creates a notice linked to an active process';role='CEO';election='election-1';expected='ALLOW'},
  @{label='Staff cannot create notices';role='Administración';election='';expected='DENY'},
  @{label='Participant cannot create notices';role='external';election='';expected='DENY'},
  @{label='Notice cannot forge its author';role='CEO';election='';author='other';expected='DENY'},
  @{label='Notice needs a valid window';role='CEO';election='';badWindow=$true;expected='DENY'},
  @{label='Notice rejects unknown fields';role='CEO';election='';extra=$true;expected='DENY'}
)) {
  $b=New-AccessState $case.role;$b[$noticeRoute]=$null
  $a=Copy-ElectionData $b;$a[$noticeRoute]=New-Notice 'published' $case.election
  if($case.author){$a[$noticeRoute].createdBy=$case.author}
  if($case.badWindow){$a[$noticeRoute].endsAt=$electionStart}
  if($case.extra){$a[$noticeRoute].views=10}
  Add-ElectionCase $case.label $noticeRoute 'create' $case.expected $b $a
}
$b=New-AccessState 'CEO';$b[$noticeRoute]=$null;$b[$electionRoute].status='deleted'
$a=Copy-ElectionData $b;$a[$noticeRoute]=New-Notice 'published' 'election-1'
Add-ElectionCase 'Notice cannot point to a trashed process' $noticeRoute 'create' 'DENY' $b $a
$b=New-AccessState 'CEO';$b[$noticeRoute]=$null;$b[$electionRoute].status='draft'
$a=Copy-ElectionData $b;$a[$noticeRoute]=New-Notice 'published' 'election-1'
Add-ElectionCase 'Published notice cannot point to a private draft' $noticeRoute 'create' 'DENY' $b $a
$a=Copy-ElectionData $b;$a[$noticeRoute]=New-Notice 'draft' 'election-1'
Add-ElectionCase 'Draft notice may point to a private draft' $noticeRoute 'create' 'ALLOW' $b $a
$b=New-AccessState 'CEO';$b[$noticeRoute]=New-Notice;$b[$noticeRoute].updatedAt=$electionStart
$a=Copy-ElectionData $b;$a[$noticeRoute].status='withdrawn';$a[$noticeRoute].updatedAt=$electionNow
Add-ElectionCase 'CEO withdraws a notice' $noticeRoute 'update' 'ALLOW' $b $a
$a2=Copy-ElectionData $a;$a2[$noticeRoute].createdBy='other'
Add-ElectionCase 'Notice update cannot rewrite its author' $noticeRoute 'update' 'DENY' $b $a2
Add-ElectionCase 'CEO cannot delete a notice' $noticeRoute 'delete' 'DENY' $b $b
foreach($status in @('published','draft','withdrawn')) {
  $b=New-AccessState 'external';$b[$noticeRoute]=New-Notice $status
  $expected=if($status -eq 'published'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "Participant reads $status notice -> $expected" $noticeRoute 'get' $expected $b $b
}
$b=New-AccessState 'external';$b[$noticeRoute]=New-Notice
Add-ElectionCase 'Anonymous cannot read notices' $noticeRoute 'get' 'DENY' $b $b ''

# Closure settings: one public document, written only by the CEO.
$settingsRoute='electoralSettings/general'
function New-ClosureSettings { return @{enabled=$false;closureTitle='Elecciones cerradas';closureMessage='Nos vemos en la próxima edición.';returnYear=2027;updatedAt=$electionNow;updatedBy='voter'} }
$b=New-AccessState 'external';$b[$settingsRoute]=New-ClosureSettings
Add-ElectionCase 'Anonymous reads the public closure settings' $settingsRoute 'get' 'ALLOW' $b $b ''
foreach($case in @(
  @{label='CEO saves closure settings';role='CEO';expected='ALLOW'},
  @{label='Staff cannot save closure settings';role='Administración';expected='DENY'},
  @{label='Closure year must be in range';role='CEO';year=1990;expected='DENY'},
  @{label='Closure settings cannot forge the author';role='CEO';author='other';expected='DENY'},
  @{label='Closure settings live in a single document';role='CEO';route='electoralSettings/other';expected='DENY'}
)) {
  $route=if($case.route){$case.route}else{$settingsRoute}
  $b=New-AccessState $case.role;$b[$route]=$null
  $a=Copy-ElectionData $b;$a[$route]=New-ClosureSettings
  if($case.year){$a[$route].returnYear=$case.year}
  if($case.author){$a[$route].updatedBy=$case.author}
  Add-ElectionCase $case.label $route 'create' $case.expected $b $a
}

# New audit actions are reserved for the CEO.
foreach($action in @('ELECTION_DELETED','ELECTION_RESTORED','ANNOUNCEMENT_CREATED','ANNOUNCEMENT_UPDATED','SETTINGS_UPDATED')) {
  foreach($role in @('CEO','external')) {
    $b=New-AccessState $role;$b[$auditRoute]=$null
    $a=Copy-ElectionData $b;$a[$auditRoute]=@{action=$action;userId='voter';userName='Dirección';details=@{electionId='election-1'};timestamp=$electionNow}
    $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
    Add-ElectionCase "$role writes $action audit -> $expected" $auditRoute 'create' $expected $b $a
  }
}
