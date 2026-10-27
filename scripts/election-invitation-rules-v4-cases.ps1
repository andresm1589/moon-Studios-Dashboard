# All resources are synthetic Rules API mocks. No invitation is created in Firestore.
$invitationRoute='electoralInvitations/AbCdEfGhIjKlMnOpQrSt'
$invitationAccessRoute='electoralAccess/voter_election-1'
function New-InvitationData([switch]$Candidate,[string]$Email='') {
  return @{electionId='election-1';label='Invitación de prueba';email=$Email;requestedVoter=$true;requestedCandidate=[bool]$Candidate;
    status='active';expiresAt=$(if($Candidate){'2026-10-16T13:00:00Z'}else{'2026-10-16T17:00:00Z'});
    createdAt=$electionNow;createdBy='voter';updatedAt=$electionNow}
}
function New-InvitationState([string]$Role='external',[switch]$Candidate,[string]$Email='') {
  $before=New-AccessState $Role -Nomination
  $before[$invitationRoute]=New-InvitationData -Candidate:$Candidate -Email $Email
  return $before
}
function New-InvitationAcceptance([switch]$Candidate,[string]$Email='') {
  $before=New-InvitationState -Candidate:$Candidate -Email $Email
  $after=Copy-ElectionData $before
  $after[$invitationRoute].status='accepted';$after[$invitationRoute].acceptedAt=$electionNow;$after[$invitationRoute].acceptedBy='voter'
  $after[$invitationAccessRoute]=New-AccessData
  if($Candidate){$after[$invitationAccessRoute].requestedCandidate=$true;$after[$invitationAccessRoute].candidateStatus='pending'}
  return @{before=$before;after=$after}
}

# Stored CEO is the sole manager, regardless of legacy aliases or token claims.
foreach($role in @('CEO','ceo','Ceo',' CEO','CEO ','external','Administración','Empleado','employee','admin','moderator','superadmin','client')) {
  $b=New-AccessState $role -Nomination;$a=Copy-ElectionData $b;$a[$invitationRoute]=New-InvitationData
  $expected=if($role -ceq 'CEO'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "Invitation create exact role [$role] -> $expected" $invitationRoute 'create' $expected $b $a
  $b=New-InvitationState $role;$a=Copy-ElectionData $b;$a[$invitationRoute].label='Etiqueta corregida'
  Add-ElectionCase "Invitation edit exact role [$role] -> $expected" $invitationRoute 'update' $expected $b $a
  Add-ElectionCase "Invitation list exact role [$role] -> $expected" $invitationRoute 'list' $expected $b $b
  $a=Copy-ElectionData $b;$a[$invitationRoute].status='revoked'
  Add-ElectionCase "Invitation revoke exact role [$role] -> $expected" $invitationRoute 'update' $expected $b $a
}
$b=New-AccessState -Nomination;$a=Copy-ElectionData $b;$a[$invitationRoute]=New-InvitationData
Add-ElectionCase 'Token-only CEO cannot create invitation without stored CEO profile' $invitationRoute 'create' 'DENY' $b $a
$electionCases[$electionCases.Count-1].request.auth.token=@{email='voter@example.com';role='CEO';admin=$true}

$b=New-AccessState 'CEO' -Nomination;$a=Copy-ElectionData $b;$a[$invitationRoute]=New-InvitationData
foreach($field in @('electionId','label','email','requestedVoter','requestedCandidate','status','expiresAt','createdAt','createdBy','updatedAt')) {
  $changed=Copy-ElectionData $a;$changed[$invitationRoute].Remove($field)
  Add-ElectionCase "Invitation schema requires $field" $invitationRoute 'create' 'DENY' $b $changed
}
foreach($fault in @('short-label','oversized-label','uppercase-email','invalid-email','oversized-email','no-rights','nonbool-right','invalid-expiry','past-expiry','at-expiry','after-election-end','forged-created','forged-updated','forged-author','accepted-status','revoked-status','accept-metadata','extra-role','empty-election','missing-election','draft-election','closed-election','archived-election','ended-election','inactive-ceo')) {
  $before=Copy-ElectionData $b;$after=Copy-ElectionData $a
  switch($fault){
    'short-label'{$after[$invitationRoute].label=123}
    'oversized-label'{$after[$invitationRoute].label='a'*161}
    'uppercase-email'{$after[$invitationRoute].email='Voter@example.com'}
    'invalid-email'{$after[$invitationRoute].email='not-an-email'}
    'oversized-email'{$after[$invitationRoute].email=('a'*310)+'@example.com'}
    'no-rights'{$after[$invitationRoute].requestedVoter=$false}
    'nonbool-right'{$after[$invitationRoute].requestedVoter='true'}
    'invalid-expiry'{$after[$invitationRoute].expiresAt='tomorrow'}
    'past-expiry'{$after[$invitationRoute].expiresAt=$electionStart}
    'at-expiry'{$after[$invitationRoute].expiresAt=$electionNow}
    'after-election-end'{$after[$invitationRoute].expiresAt='2026-10-16T18:00:01Z'}
    'forged-created'{$after[$invitationRoute].createdAt=$electionStart}
    'forged-updated'{$after[$invitationRoute].updatedAt=$electionStart}
    'forged-author'{$after[$invitationRoute].createdBy='other'}
    'accepted-status'{$after[$invitationRoute].status='accepted';$after[$invitationRoute].acceptedAt=$electionNow;$after[$invitationRoute].acceptedBy='voter'}
    'revoked-status'{$after[$invitationRoute].status='revoked'}
    'accept-metadata'{$after[$invitationRoute].acceptedBy='voter';$after[$invitationRoute].acceptedAt=$electionNow}
    'extra-role'{$after[$invitationRoute].companyRole='CEO'}
    'empty-election'{$after[$invitationRoute].electionId='';$before['elections/']=$null;$after['elections/']=$null}
    'missing-election'{$after[$invitationRoute].electionId='missing';$before['elections/missing']=$null;$after['elections/missing']=$null}
    'draft-election'{$before['elections/election-1'].status='draft';$after['elections/election-1'].status='draft'}
    'closed-election'{$before['elections/election-1'].status='closed';$after['elections/election-1'].status='closed'}
    'archived-election'{$before['elections/election-1'].status='archived';$after['elections/election-1'].status='archived'}
    'ended-election'{$before['elections/election-1'].endDate=$electionNow;$after['elections/election-1'].endDate=$electionNow}
    'inactive-ceo'{$before['users/voter'].isActive=$false;$after['users/voter'].isActive=$false}
  }
  Add-ElectionCase "Invitation create rejects $fault" $invitationRoute 'create' 'DENY' $before $after
}
foreach($id in @('short',('a'*19),('a'*129),('@'*20),('a'*20),('a'*128),'safe_id-with-dash_1234')) {
  $route='electoralInvitations/'+$id;$changed=Copy-ElectionData $a;$changed[$route]=$changed[$invitationRoute]
  $expected=if($id -cmatch '^[A-Za-z0-9_-]{20,128}$'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "Invitation ID length/type $($id.Length) -> $expected" $route 'create' $expected $b $changed
}
$changed=Copy-ElectionData $a;$changed[$invitationRoute].label='AB';$changed[$invitationRoute].expiresAt='2026-10-16T18:00:00Z'
Add-ElectionCase 'Open invitation may expire exactly at election end and use minimum label' $invitationRoute 'create' 'ALLOW' $b $changed
$changed=Copy-ElectionData $a;$changed[$invitationRoute]=New-InvitationData -Candidate
Add-ElectionCase 'Candidate invitation may expire at registration end' $invitationRoute 'create' 'ALLOW' $b $changed
$changed[$invitationRoute].expiresAt='2026-10-16T13:00:01Z'
Add-ElectionCase 'Candidate invitation cannot outlive registration end' $invitationRoute 'create' 'DENY' $b $changed
$before=Copy-ElectionData $b;$after=Copy-ElectionData $a;$before['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z';$after['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z';$after[$invitationRoute]=New-InvitationData -Candidate
Add-ElectionCase 'CEO may prepare candidate invitation before registration opens' $invitationRoute 'create' 'ALLOW' $before $after
$before=Copy-ElectionData $b;$after=Copy-ElectionData $a
foreach($field in @('registrationStartDate','registrationEndDate')){$before['elections/election-1'].Remove($field);$after['elections/election-1'].Remove($field)}
$after[$invitationRoute]=New-InvitationData -Candidate;$after[$invitationRoute].expiresAt='2026-10-16T14:00:00Z'
Add-ElectionCase 'Legacy candidate invitation uses startDate as deadline' $invitationRoute 'create' 'ALLOW' $before $after

# Only label, expiry and revocation can change. Historical targets never mutate.
$b=New-InvitationState 'CEO';$a=Copy-ElectionData $b;$a[$invitationRoute].label='Nueva etiqueta';$a[$invitationRoute].expiresAt='2026-10-16T16:00:00Z'
Add-ElectionCase 'CEO can edit active invitation label and expiry' $invitationRoute 'update' 'ALLOW' $b $a
foreach($field in @('electionId','email','requestedVoter','requestedCandidate','createdAt','createdBy','acceptedAt','acceptedBy','extra')) {
  $changed=Copy-ElectionData $a
  $changed[$invitationRoute][$field]=switch($field){'createdAt'{$electionStart};'requestedVoter'{$false};'requestedCandidate'{$true};'acceptedAt'{$electionNow};default{'forged'}}
  Add-ElectionCase "CEO cannot change invitation $field" $invitationRoute 'update' 'DENY' $b $changed
}
foreach($prior in @('accepted','revoked')){
  $before=Copy-ElectionData $b;$before[$invitationRoute].status=$prior
  if($prior -eq 'accepted'){$before[$invitationRoute].acceptedBy='other';$before[$invitationRoute].acceptedAt=$electionStart}
  $after=Copy-ElectionData $before;$after[$invitationRoute].status='active';$after[$invitationRoute].Remove('acceptedBy');$after[$invitationRoute].Remove('acceptedAt')
  Add-ElectionCase "CEO cannot reactivate $prior invitation" $invitationRoute 'update' 'DENY' $before $after
}
$before=Copy-ElectionData $b;$before[$invitationRoute].expiresAt=$electionStart;$after=Copy-ElectionData $before;$after[$invitationRoute].expiresAt='2026-10-16T17:00:00Z'
Add-ElectionCase 'CEO can extend an expired active invitation before process end' $invitationRoute 'update' 'ALLOW' $before $after
foreach($status in @('active','closed','archived')){
  $before=Copy-ElectionData $b;$before['elections/election-1'].status=$status;$before['elections/election-1'].endDate=$electionNow
  $after=Copy-ElectionData $before;$after[$invitationRoute].status='revoked'
  Add-ElectionCase "CEO can revoke old invitation after process $status ends" $invitationRoute 'update' 'ALLOW' $before $after
  $after=Copy-ElectionData $before;$after[$invitationRoute].label='Late edit'
  Add-ElectionCase "CEO cannot edit invitation after process $status ends" $invitationRoute 'update' 'DENY' $before $after
}
foreach($role in @('CEO','external')){
  $before=New-InvitationState $role
  Add-ElectionCase "$role cannot delete invitation history" $invitationRoute 'delete' 'DENY' $before $before
}

# Known links can be opened, but recipients can never enumerate the directory.
foreach($status in @('active','accepted','revoked')){
  $before=New-InvitationState;$before[$invitationRoute].status=$status
  if($status -eq 'accepted'){$before[$invitationRoute].acceptedBy='voter';$before[$invitationRoute].acceptedAt=$electionStart}
  Add-ElectionCase "Authenticated guest can inspect known open-email $status link" $invitationRoute 'get' 'ALLOW' $before $before
  Add-ElectionCase "Guest cannot list $status invitation" $invitationRoute 'list' 'DENY' $before $before
}
foreach($spec in @(
  @{label='verified Google email';token=@{email='VOTER@EXAMPLE.COM';email_verified=$true};expected='ALLOW'},
  @{label='unverified password email';token=@{email='voter@example.com';email_verified=$false};expected='DENY'},
  @{label='missing verification flag';token=@{email='voter@example.com'};expected='DENY'},
  @{label='verified different email';token=@{email='other@example.com';email_verified=$true};expected='DENY'},
  @{label='verified Discord custom email';token=@{electoral_email='Voter@Example.com'};expected='ALLOW'},
  @{label='different Discord custom email';token=@{electoral_email='other@example.com'};expected='DENY'},
  @{label='missing provider email';token=@{};expected='DENY'}
)){
  $before=New-InvitationState -Email 'voter@example.com'
  Add-ElectionCase "Targeted invitation reads with $($spec.label) -> $($spec.expected)" $invitationRoute 'get' $spec.expected $before $before
  $electionCases[$electionCases.Count-1].request.auth.token=$spec.token
}
foreach($fault in @('anonymous','firebase-anonymous','inactive','malformed-active','null-active')){
  $before=New-InvitationState
  $uid='voter'
  if($fault -eq 'anonymous'){$uid=''}
  elseif($fault -eq 'inactive'){$before['users/voter']=@{role='CEO';isActive=$false}}
  elseif($fault -eq 'malformed-active'){$before['users/voter']=@{role='CEO';isActive='true'}}
  elseif($fault -eq 'null-active'){$before['users/voter']=@{role='CEO';isActive=$null}}
  Add-ElectionCase "Invitation get rejects $fault" $invitationRoute 'get' 'DENY' $before $before $uid
  if($fault -eq 'firebase-anonymous'){$electionCases[$electionCases.Count-1].request.auth.token=@{firebase=@{sign_in_provider='anonymous'}}}
}
$before=New-InvitationState 'CEO' -Email 'other@example.com'
Add-ElectionCase 'Stored CEO can inspect invitation bound to another email' $invitationRoute 'get' 'ALLOW' $before $before

# Redemption is single-use and only requests pending rights. The invitation and
# access operations are evaluated independently as members of one atomic commit.
foreach($candidate in @($false,$true)){
  $state=New-InvitationAcceptance -Candidate:$candidate
  Add-ElectionCase "Guest accepts invitation candidate=$candidate" $invitationRoute 'update' 'ALLOW' $state.before $state.after
  Add-ElectionCase "Invitation atomically creates pending access candidate=$candidate" $invitationAccessRoute 'create' 'ALLOW' $state.before $state.after
}
foreach($fault in @('expired','at-expiry','revoked','accepted','closed','draft','archived','ended','no-access','wrong-access-owner','wrong-access-election','missing-requested-voter','invalid-status','forged-accepted-at','forged-updated-at','foreign-accepted-by','edited-label','edited-email','edited-rights','extra-role','inactive','anonymous')){
  $state=New-InvitationAcceptance
  switch($fault){
    'expired'{$state.before[$invitationRoute].expiresAt=$electionStart;$state.after[$invitationRoute].expiresAt=$electionStart}
    'at-expiry'{$state.before[$invitationRoute].expiresAt=$electionNow;$state.after[$invitationRoute].expiresAt=$electionNow}
    'revoked'{$state.before[$invitationRoute].status='revoked'}
    'accepted'{$state.before[$invitationRoute].status='accepted';$state.before[$invitationRoute].acceptedAt=$electionStart;$state.before[$invitationRoute].acceptedBy='other'}
    'closed'{$state.before['elections/election-1'].status='closed';$state.after['elections/election-1'].status='closed'}
    'draft'{$state.before['elections/election-1'].status='draft';$state.after['elections/election-1'].status='draft'}
    'archived'{$state.before['elections/election-1'].status='archived';$state.after['elections/election-1'].status='archived'}
    'ended'{$state.before['elections/election-1'].endDate=$electionNow;$state.after['elections/election-1'].endDate=$electionNow}
    'no-access'{$state.after[$invitationAccessRoute]=$null}
    'wrong-access-owner'{$state.after[$invitationAccessRoute].uid='other'}
    'wrong-access-election'{$state.after[$invitationAccessRoute].electionId='other'}
    'missing-requested-voter'{$state.after[$invitationAccessRoute].requestedVoter=$false;$state.after[$invitationAccessRoute].voterStatus='none';$state.after[$invitationAccessRoute].requestedCandidate=$true;$state.after[$invitationAccessRoute].candidateStatus='pending'}
    'invalid-status'{$state.after[$invitationRoute].status='unknown'}
    'forged-accepted-at'{$state.after[$invitationRoute].acceptedAt=$electionStart}
    'forged-updated-at'{$state.after[$invitationRoute].updatedAt=$electionStart}
    'foreign-accepted-by'{$state.after[$invitationRoute].acceptedBy='other'}
    'edited-label'{$state.after[$invitationRoute].label='Stolen'}
    'edited-email'{$state.after[$invitationRoute].email='other@example.com'}
    'edited-rights'{$state.after[$invitationRoute].requestedCandidate=$true}
    'extra-role'{$state.after[$invitationRoute].role='CEO'}
    'inactive'{$state.before['users/voter']=@{role='CEO';isActive=$false};$state.after['users/voter']=$state.before['users/voter']}
  }
  $uid=if($fault -eq 'anonymous'){''}else{'voter'}
  Add-ElectionCase "Invitation acceptance rejects $fault" $invitationRoute 'update' 'DENY' $state.before $state.after $uid
}
foreach($window in @('early','deadline','vote-start')){
  $state=New-InvitationAcceptance -Candidate
  if($window -eq 'early'){$state.before['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z';$state.after['elections/election-1'].registrationStartDate='2026-10-16T12:30:00Z'}
  elseif($window -eq 'deadline'){$state.before['elections/election-1'].registrationEndDate=$electionNow;$state.after['elections/election-1'].registrationEndDate=$electionNow}
  else{$state.before['elections/election-1'].startDate=$electionNow;$state.after['elections/election-1'].startDate=$electionNow}
  Add-ElectionCase "Candidate invitation rejects $window registration window" $invitationRoute 'update' 'DENY' $state.before $state.after
}
$state=New-InvitationAcceptance -Candidate;$state.before['elections/election-1'].registrationStartDate=$electionNow;$state.after['elections/election-1'].registrationStartDate=$electionNow
Add-ElectionCase 'Candidate invitation accepts at exact registration opening' $invitationRoute 'update' 'ALLOW' $state.before $state.after
foreach($spec in @(
  @{label='verified matching email';token=@{email='VOTER@example.com';email_verified=$true};expected='ALLOW'},
  @{label='unverified matching email';token=@{email='voter@example.com';email_verified=$false};expected='DENY'},
  @{label='different verified email';token=@{email='other@example.com';email_verified=$true};expected='DENY'},
  @{label='verified Discord email';token=@{electoral_email='voter@example.com'};expected='ALLOW'},
  @{label='missing verified email';token=@{};expected='DENY'}
)){
  $state=New-InvitationAcceptance -Email 'voter@example.com'
  Add-ElectionCase "Invitation consume with $($spec.label) -> $($spec.expected)" $invitationRoute 'update' $spec.expected $state.before $state.after
  $electionCases[$electionCases.Count-1].request.auth.token=$spec.token
}
foreach($status in @('pending','approved','rejected')){
  $state=New-InvitationAcceptance -Candidate;$state.before[$invitationAccessRoute]=Copy-ElectionData $state.after[$invitationAccessRoute]
  $state.before[$invitationAccessRoute].voterStatus=$status;$state.before[$invitationAccessRoute].candidateStatus=$status
  $state.before[$invitationAccessRoute].createdAt=$electionStart
  if($status -ne 'pending'){$state.before[$invitationAccessRoute].reviewedAt=$electionStart;$state.before[$invitationAccessRoute].reviewedBy='ceo'}
  $state.after[$invitationAccessRoute]=Copy-ElectionData $state.before[$invitationAccessRoute]
  Add-ElectionCase "Invitation accepts with existing $status rights without access rewrite" $invitationRoute 'update' 'ALLOW' $state.before $state.after
  if($status -ne 'pending'){
    $state.after[$invitationAccessRoute].voterStatus='pending';$state.after[$invitationAccessRoute].candidateStatus='pending'
    Add-ElectionCase "Invitation cannot reset existing $status access" $invitationAccessRoute 'update' 'DENY' $state.before $state.after
  }
}
$state=New-InvitationAcceptance -Candidate
$state.before[$invitationAccessRoute]=New-AccessData;$state.before[$invitationAccessRoute].createdAt=$electionStart;$state.before[$invitationAccessRoute].voterStatus='approved';$state.before[$invitationAccessRoute].reviewedAt=$electionStart;$state.before[$invitationAccessRoute].reviewedBy='ceo'
$state.after[$invitationAccessRoute]=Copy-ElectionData $state.before[$invitationAccessRoute];$state.after[$invitationAccessRoute].requestedCandidate=$true;$state.after[$invitationAccessRoute].candidateStatus='pending'
Add-ElectionCase 'Invitation adds pending candidate access while keeping approved vote' $invitationAccessRoute 'update' 'ALLOW' $state.before $state.after
$state.after[$invitationAccessRoute].candidateStatus='approved'
Add-ElectionCase 'Invitation cannot self-approve new candidate access' $invitationAccessRoute 'update' 'DENY' $state.before $state.after
$state=New-InvitationAcceptance;$state.after[$invitationAccessRoute].voterStatus='approved'
Add-ElectionCase 'Invitation cannot self-approve new voter access' $invitationAccessRoute 'create' 'DENY' $state.before $state.after
$state=New-InvitationAcceptance -Candidate;$state.after[$invitationAccessRoute].requestedCandidate=$false;$state.after[$invitationAccessRoute].candidateStatus='none'
Add-ElectionCase 'Candidate invitation needs requestedCandidate in atomic access result' $invitationRoute 'update' 'DENY' $state.before $state.after
$state=New-InvitationAcceptance;$b=Copy-ElectionData $state.after;$a=Copy-ElectionData $b
Add-ElectionCase 'Invitation acceptance replay by same UID is denied' $invitationRoute 'update' 'DENY' $b $a
$b['electoralAccess/other_election-1']=New-AccessData 'other';$a=Copy-ElectionData $b;$a[$invitationRoute].acceptedBy='other'
Add-ElectionCase 'Invitation acceptance replay by other UID is denied' $invitationRoute 'update' 'DENY' $b $a 'other'

foreach($action in @('INVITATION_CREATED','INVITATION_UPDATED','INVITATION_REVOKED','INVITATION_ACCEPTED')){
  foreach($role in @('CEO','external','ceo')){
    $b=New-InvitationState $role;$a=Copy-ElectionData $b;$a['auditLogs/invitation-audit']=@{action=$action;userId='voter';userName='Participante';details=@{invitationId='AbCdEfGhIjKlMnOpQrSt'};timestamp=$electionNow}
    $expected=if($role -ceq 'CEO' -or $action -eq 'INVITATION_ACCEPTED'){'ALLOW'}else{'DENY'}
    Add-ElectionCase "$role audit $action -> $expected" 'auditLogs/invitation-audit' 'create' $expected $b $a
  }
}
