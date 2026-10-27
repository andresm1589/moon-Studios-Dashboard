param([switch]$RefreshBaseline)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'election-rules-common.ps1')
$electionHeaders = Get-ElectionHeaders
if ($RefreshBaseline -or !(Test-Path -LiteralPath (Join-Path $script:ElectionQa 'baseline-manifest.json'))) { Save-ElectionBaseline $electionHeaders }
$electionPrepared = Get-ElectionPreparedSource
$electionActive = Get-ElectionActiveRelease $electionHeaders
if ($electionActive.rulesetName -ne $electionPrepared.baseline.ruleset) { throw 'The active ruleset changed. Review the new authoritative baseline with -RefreshBaseline before testing.' }
$electionSourcePath = Join-Path $script:ElectionQa 'proposed.rules'
[IO.File]::WriteAllText($electionSourcePath,$electionPrepared.source,[Text.UTF8Encoding]::new($false))
$electionManifestPath = Join-Path $script:ElectionQa 'test-manifest.json'
if (Test-Path -LiteralPath $electionManifestPath) { Remove-Item -LiteralPath $electionManifestPath }
$electionVerifiedHashes = @{
  sourceSha256=(Get-ElectionHash $electionSourcePath);fragmentSha256=(Get-ElectionHash $script:ElectionFragmentPath);
  baselineSha256=(Get-ElectionHash (Join-Path $script:ElectionQa 'baseline.rules'));
  baselineManifestSha256=(Get-ElectionHash (Join-Path $script:ElectionQa 'baseline-manifest.json'));
  testFileSha256=(Get-ElectionHash $PSCommandPath);commonFileSha256=(Get-ElectionHash (Join-Path $PSScriptRoot 'election-rules-common.ps1'))
}
$electionNow = '2026-10-16T12:00:00Z'
$electionStart = '2026-10-16T10:00:00Z'
$electionEnd = '2026-10-16T14:00:00Z'
$electionPrefix = '/databases/(default)/documents/'
$electionCases = [System.Collections.Generic.List[object]]::new()
$electionLabels = [System.Collections.Generic.List[string]]::new()

function Copy-ElectionData($Value) { return ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $Value -Depth 50) -AsHashtable }
function New-ElectionData {
  return @{name='Elecciones de prueba';description='Proceso electoral interno de prueba.';startDate=$electionStart;endDate=$electionEnd;
    status='active';positions=@('Dirección','Tesorería');departments=@('General');createdBy='manager';createdAt=$electionStart;totalVotes=5}
}
function New-CandidateData([string]$Position='Dirección') {
  return @{uid='candidate-owner';name='Persona candidata';photoURL='';position=$Position;department='General';proposals=@('Mejorar procesos del equipo');
    slogan='Un equipo unido';party='';status='approved';electionId='election-1';votes=2;createdAt=$electionStart;approvedAt=$electionStart;approvedBy='manager'}
}
function New-VoteState([switch]$Second) {
  $electionData = New-ElectionData
  $electionIndex = if ($Second) { 1 } else { 0 }
  $electionPosition = $electionData.positions[$electionIndex]
  $electionCandidate = New-CandidateData $electionPosition
  $electionVoteId = "voter_election-1_$electionIndex"
  $electionRecord = @{voterId='voter';electionId='election-1';positionsVoted=@($electionPosition);votedAt=$electionNow;
    lastVoteId=$electionVoteId;lastCandidateId='candidate-1';lastPositionIndex=$electionIndex}
  $electionPrevious = $null
  if ($Second) {
    $electionPrevious = @{voterId='voter';electionId='election-1';positionsVoted=@('Dirección');votedAt=$electionStart;
      lastVoteId='voter_election-1_0';lastCandidateId='previous-candidate';lastPositionIndex=0}
    $electionRecord.positionsVoted=@('Dirección','Tesorería')
  }
  $electionBefore = @{'users/voter'=@{role='Empleado';isActive=$true};'elections/election-1'=$electionData;'candidates/candidate-1'=$electionCandidate;
    'voteRecords/voter_election-1'=$electionPrevious;"votes/$electionVoteId"=$null}
  $electionAfter = Copy-ElectionData $electionBefore
  $electionAfter['elections/election-1'].totalVotes=6
  $electionAfter['candidates/candidate-1'].votes=3
  $electionAfter['voteRecords/voter_election-1']=$electionRecord
  $electionAfter["votes/$electionVoteId"]=@{voterId='voter';candidateId='candidate-1';electionId='election-1';position=$electionPosition;positionIndex=$electionIndex;timestamp=$electionNow}
  return @{before=$electionBefore;after=$electionAfter;voteId=$electionVoteId;index=$electionIndex;position=$electionPosition}
}

# Every database-dependent function is mocked by its exact path. Missing mocks
# fail inside Rules API evaluation; the test command never queries app documents.
function Add-ElectionCase([string]$Label,[string]$Route,[string]$Method,[string]$Expected,$Before,$After,[string]$Uid='voter',[string]$Time=$electionNow) {
  if ($Uid -and $Uid -ne 'voter' -and !$Before.Contains(('users/'+$Uid))) {
    $Before['users/'+$Uid]=@{role='Empleado';isActive=$true}
    $After['users/'+$Uid]=@{role='Empleado';isActive=$true}
  }
  $electionRequest = @{path=($electionPrefix+$Route);method=$Method;time=$Time;auth=$null}
  if ($Uid) { $electionRequest.auth=@{uid=$Uid;token=@{email=($Uid+'@example.com')}} }
  if ($Method -in @('create','update')) { $electionRequest.resource=@{data=$After[$Route]} }
  $electionCase = @{expectation=$Expected;request=$electionRequest;expressionReportLevel='NONE'}
  if ($null -ne $Before[$Route]) { $electionCase.resource=@{data=$Before[$Route]} }
  $electionRoutes = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($electionRoute in @($Before.Keys)+@($After.Keys)) { [void]$electionRoutes.Add([string]$electionRoute) }
  $electionMocks = [System.Collections.Generic.List[object]]::new()
  foreach ($electionRoute in $electionRoutes) {
    foreach ($electionFunction in @('get','getAfter','exists','existsAfter')) {
      $electionMap = if ($electionFunction -in @('get','exists')) { $Before } else { $After }
      $electionValue = $electionMap[$electionRoute]
      $electionResult = if ($electionFunction -in @('exists','existsAfter')) { @{value=($null -ne $electionValue)} }
                        elseif ($null -eq $electionValue) { @{undefined=@{}} }
                        else { @{value=@{data=$electionValue}} }
      $electionMocks.Add(@{function=$electionFunction;args=@(@{exactValue=($electionPrefix+$electionRoute)});result=$electionResult})
    }
  }
  $electionCase.functionMocks=$electionMocks.ToArray()
  $electionCases.Add($electionCase);$electionLabels.Add($Label)
}

function Add-VotingCases([string]$Label,[string]$Expected,$State,[string]$Uid='voter',[string]$Time=$electionNow) {
  if($Uid -and $Uid -ne 'voter') {
    $electionOtherRecord='voteRecords/'+$Uid+'_election-1'
    $State.before[$electionOtherRecord]=$null
    $State.after[$electionOtherRecord]=Copy-ElectionData $State.after['voteRecords/voter_election-1']
    $State.after[$electionOtherRecord].voterId=$Uid
  }
  foreach ($electionWrite in @(@{route=('votes/'+$State.voteId);method='create'},@{route='voteRecords/voter_election-1';method=$(if($null -eq $State.before['voteRecords/voter_election-1']){'create'}else{'update'})},@{route='candidates/candidate-1';method='update'},@{route='elections/election-1';method='update'})) {
    Add-ElectionCase "$Label / $($electionWrite.route)" $electionWrite.route $electionWrite.method $Expected $State.before $State.after $Uid $Time
  }
}

Add-VotingCases 'First atomic ballot accepted' 'ALLOW' (New-VoteState)
Add-VotingCases 'Second position ballot accepted' 'ALLOW' (New-VoteState -Second)
foreach ($electionRole in @('CEO','ceo','Administración','Diseño','Secretaría','Programación','Contador','Empleado','employee','candidate','admin','moderator','superadmin')) {
  $electionState=New-VoteState;$electionState.before['users/voter'].role=$electionRole;$electionState.after['users/voter'].role=$electionRole
  Add-VotingCases "$electionRole can cast a complete atomic ballot" 'ALLOW' $electionState
}
foreach ($electionRole in @('client','invalid')) {
  $electionState=New-VoteState;$electionState.before['users/voter'].role=$electionRole;$electionState.after['users/voter'].role=$electionRole
  Add-ElectionCase "$electionRole cannot cast staff ballot" ('votes/'+$electionState.voteId) 'create' 'DENY' $electionState.before $electionState.after
}
$electionState=New-VoteState;$electionState.before['users/voter'].isActive=$false;$electionState.after['users/voter'].isActive=$false
Add-VotingCases 'Inactive staff denied' 'DENY' $electionState
Add-VotingCases 'Anonymous ballot denied' 'DENY' (New-VoteState) ''
Add-VotingCases 'Another UID cannot submit voter ballot' 'DENY' (New-VoteState) 'intruder'

foreach ($electionFault in @('duplicate','closed','draft','archived','not-started','ended','wrong-election','wrong-position','unapproved','counter-jump','candidate-counter-rollback','election-counter-rollback','no-record','no-vote','no-candidate-increment','no-election-increment','record-other-owner','record-extra-position','record-duplicate-position','wrong-index','vote-forged-time','record-forged-time','vote-extra-field','record-extra-field')) {
  $electionState=New-VoteState
  switch ($electionFault) {
    'duplicate' { $electionState.before['votes/'+$electionState.voteId]=Copy-ElectionData $electionState.after['votes/'+$electionState.voteId] }
    'closed' { $electionState.before['elections/election-1'].status='closed';$electionState.after['elections/election-1'].status='closed' }
    'draft' { $electionState.before['elections/election-1'].status='draft';$electionState.after['elections/election-1'].status='draft' }
    'archived' { $electionState.before['elections/election-1'].status='archived';$electionState.after['elections/election-1'].status='archived' }
    'not-started' { $electionState.before['elections/election-1'].startDate='2026-10-16T13:00:00Z';$electionState.after['elections/election-1'].startDate='2026-10-16T13:00:00Z' }
    'ended' { $electionState.before['elections/election-1'].endDate=$electionNow;$electionState.after['elections/election-1'].endDate=$electionNow }
    'wrong-election' { $electionState.before['candidates/candidate-1'].electionId='another-election';$electionState.after['candidates/candidate-1'].electionId='another-election' }
    'wrong-position' { $electionState.before['candidates/candidate-1'].position='Tesorería';$electionState.after['candidates/candidate-1'].position='Tesorería' }
    'unapproved' { $electionState.before['candidates/candidate-1'].status='pending';$electionState.after['candidates/candidate-1'].status='pending' }
    'counter-jump' { $electionState.after['candidates/candidate-1'].votes=4;$electionState.after['elections/election-1'].totalVotes=7 }
    'candidate-counter-rollback' { $electionState.after['candidates/candidate-1'].votes=1 }
    'election-counter-rollback' { $electionState.after['elections/election-1'].totalVotes=4 }
    'no-record' { $electionState.after['voteRecords/voter_election-1']=$null }
    'no-vote' { $electionState.after['votes/'+$electionState.voteId]=$null }
    'no-candidate-increment' { $electionState.after['candidates/candidate-1'].votes=2 }
    'no-election-increment' { $electionState.after['elections/election-1'].totalVotes=5 }
    'record-other-owner' { $electionState.after['voteRecords/voter_election-1'].voterId='intruder' }
    'record-extra-position' { $electionState.after['voteRecords/voter_election-1'].positionsVoted=@('Dirección','Tesorería') }
    'record-duplicate-position' { $electionState.after['voteRecords/voter_election-1'].positionsVoted=@('Dirección','Dirección') }
    'wrong-index' { $electionState.after['votes/'+$electionState.voteId].positionIndex=1 }
    'vote-forged-time' { $electionState.after['votes/'+$electionState.voteId].timestamp=$electionStart }
    'record-forged-time' { $electionState.after['voteRecords/voter_election-1'].votedAt=$electionStart }
    'vote-extra-field' { $electionState.after['votes/'+$electionState.voteId].forged=$true }
    'record-extra-field' { $electionState.after['voteRecords/voter_election-1'].forged=$true }
  }
  # The writer being omitted has no write operation in that batch. Its peers
  # must nevertheless reject the incomplete commit through getAfter checks.
  $electionSkip = if ($electionFault -eq 'no-record') {'voteRecords/voter_election-1'} elseif ($electionFault -eq 'no-vote') {'votes/'+$electionState.voteId} else {''}
  foreach ($electionWrite in @(@{route=('votes/'+$electionState.voteId);method='create'},@{route='voteRecords/voter_election-1';method='create'},@{route='candidates/candidate-1';method='update'},@{route='elections/election-1';method='update'})) {
    if ($electionWrite.route -ne $electionSkip) { Add-ElectionCase "Atomic ballot rejects $electionFault / $($electionWrite.route)" $electionWrite.route $electionWrite.method 'DENY' $electionState.before $electionState.after }
  }
}

$electionState=New-VoteState
Add-ElectionCase 'Non-deterministic vote ID denied' 'votes/random-vote' 'create' 'DENY' $electionState.before (@{ 'votes/random-vote'=$electionState.after['votes/'+$electionState.voteId] }+$electionState.after)
$electionState=New-VoteState
Add-ElectionCase 'Non-deterministic vote record ID denied' 'voteRecords/random-record' 'create' 'DENY' $electionState.before (@{'voteRecords/random-record'=$electionState.after['voteRecords/voter_election-1']}+$electionState.after)
$electionState=New-VoteState
$electionState.after['votes/'+$electionState.voteId].timestamp=$electionStart
$electionState.after['voteRecords/voter_election-1'].votedAt=$electionStart
Add-VotingCases 'Voting at exact start accepted' 'ALLOW' $electionState 'voter' $electionStart

# A legacy record lacks the new last-vote fields. It may append another valid
# position atomically, but prior participation remains immutable.
$electionState=New-VoteState -Second
foreach ($electionKey in @('lastVoteId','lastCandidateId','lastPositionIndex')) { $electionState.before['voteRecords/voter_election-1'].Remove($electionKey) }
Add-VotingCases 'Legacy record can append unvoted position' 'ALLOW' $electionState
$electionState=New-VoteState -Second
$electionState.after['voteRecords/voter_election-1'].positionsVoted=@('Tesorería')
Add-VotingCases 'Cannot roll back prior participation' 'DENY' $electionState
$electionState=New-VoteState -Second
$electionState.before['voteRecords/voter_election-1'].positionsVoted=@('Dirección','Tesorería')
Add-VotingCases 'Cannot vote twice for same position' 'DENY' $electionState

# Reads, nomination, election management and role boundaries.
foreach ($electionRole in @('CEO','Administración','Empleado','client','admin','moderator','superadmin')) {
  $electionBefore=@{'users/voter'=@{role=$electionRole};'elections/election-1'=(New-ElectionData);'candidates/candidate-1'=(New-CandidateData)}
  $electionAfter=Copy-ElectionData $electionBefore
  $electionManageExpected=if($electionRole -in @('CEO','ceo','superadmin','admin','moderator')){'ALLOW'}else{'DENY'}
  $electionAfter['elections/new-election']=New-ElectionData
  $electionAfter['elections/new-election'].createdBy='voter';$electionAfter['elections/new-election'].createdAt=$electionNow
  $electionAfter['elections/new-election'].updatedAt=$electionNow
  $electionAfter['elections/new-election'].status='draft';$electionAfter['elections/new-election'].totalVotes=0
  Add-ElectionCase "$electionRole election create -> $electionManageExpected" 'elections/new-election' 'create' $electionManageExpected $electionBefore $electionAfter
  $electionAfter=Copy-ElectionData $electionBefore;$electionAfter['elections/election-1'].status='closed';$electionAfter['elections/election-1'].updatedAt=$electionNow
  Add-ElectionCase "$electionRole election close -> $electionManageExpected" 'elections/election-1' 'update' $electionManageExpected $electionBefore $electionAfter
  $electionReviewBefore=Copy-ElectionData $electionBefore
  $electionReviewBefore['elections/election-1'].status='draft';$electionReviewBefore['candidates/candidate-1'].status='pending';$electionReviewBefore['candidates/candidate-1'].votes=0
  $electionReviewBefore['candidates/candidate-1'].Remove('approvedAt');$electionReviewBefore['candidates/candidate-1'].Remove('approvedBy')
  $electionAfter=Copy-ElectionData $electionReviewBefore;$electionAfter['candidates/candidate-1'].status='rejected';$electionAfter['candidates/candidate-1'].approvedAt=$electionNow;$electionAfter['candidates/candidate-1'].approvedBy='voter'
  Add-ElectionCase "$electionRole candidate review -> $electionManageExpected" 'candidates/candidate-1' 'update' $electionManageExpected $electionReviewBefore $electionAfter
}

$electionBefore=@{'users/voter'=@{role='Empleado'};'elections/election-1'=(New-ElectionData)}
$electionBefore['elections/election-1'].status='draft'
$electionAfter=Copy-ElectionData $electionBefore;$electionAfter['candidates/new-candidate']=New-CandidateData
$electionAfter['candidates/new-candidate'].uid='voter';$electionAfter['candidates/new-candidate'].status='pending';$electionAfter['candidates/new-candidate'].votes=0;$electionAfter['candidates/new-candidate'].createdAt=$electionNow
$electionAfter['candidates/new-candidate'].Remove('approvedAt');$electionAfter['candidates/new-candidate'].Remove('approvedBy')
Add-ElectionCase 'Staff can submit own pending nomination' 'candidates/new-candidate' 'create' 'ALLOW' $electionBefore $electionAfter
foreach ($electionFault in @('self-approve','invent-votes','other-owner','wrong-election','wrong-position','unknown-field')) {
  $electionChanged=Copy-ElectionData $electionAfter
  switch($electionFault){
    'self-approve' {$electionChanged['candidates/new-candidate'].status='approved'}
    'invent-votes' {$electionChanged['candidates/new-candidate'].votes=1}
    'other-owner' {$electionChanged['candidates/new-candidate'].uid='intruder'}
    'wrong-election' {$electionChanged['candidates/new-candidate'].electionId='missing-election';$electionBefore['elections/missing-election']=$null;$electionChanged['elections/missing-election']=$null}
    'wrong-position' {$electionChanged['candidates/new-candidate'].position='Imaginary position'}
    'unknown-field' {$electionChanged['candidates/new-candidate'].admin=$true}
  }
  Add-ElectionCase "Nomination rejects $electionFault" 'candidates/new-candidate' 'create' 'DENY' $electionBefore $electionChanged
}
$electionBefore=Copy-ElectionData $electionAfter;$electionAfter=Copy-ElectionData $electionBefore
$electionAfter['candidates/new-candidate'].status='approved';$electionAfter['candidates/new-candidate'].approvedAt=$electionNow;$electionAfter['candidates/new-candidate'].approvedBy='voter'
Add-ElectionCase 'Candidate cannot approve own nomination' 'candidates/new-candidate' 'update' 'DENY' $electionBefore $electionAfter

foreach ($electionRoute in @('votes/voter_election-1_0','voteRecords/voter_election-1','candidates/candidate-1','elections/election-1')) {
  $electionState=New-VoteState;$electionBefore=Copy-ElectionData $electionState.after;$electionAfter=Copy-ElectionData $electionBefore
  $electionBefore['users/voter'].role='CEO';$electionAfter['users/voter'].role='CEO'
  Add-ElectionCase "CEO cannot delete electoral history $electionRoute" $electionRoute 'delete' 'DENY' $electionBefore $electionAfter
}
foreach ($electionMethod in @('get','list')) {
  $electionState=New-VoteState;$electionBefore=Copy-ElectionData $electionState.after
  foreach($electionRoute in @('elections/election-1','candidates/candidate-1')) {
    Add-ElectionCase "Signed staff $electionMethod $electionRoute" $electionRoute $electionMethod 'ALLOW' $electionBefore $electionBefore
    Add-ElectionCase "Anonymous $electionMethod $electionRoute denied" $electionRoute $electionMethod 'DENY' $electionBefore $electionBefore ''
  }
  $electionOwnExpected=if($electionMethod -eq 'get'){'ALLOW'}else{'DENY'}
  Add-ElectionCase "Own participation $electionMethod -> $electionOwnExpected" 'voteRecords/voter_election-1' $electionMethod $electionOwnExpected $electionBefore $electionBefore
  Add-ElectionCase "Other UID participation $electionMethod denied" 'voteRecords/voter_election-1' $electionMethod 'DENY' $electionBefore $electionBefore 'intruder'
}

foreach($electionRole in @('CEO','Administración','Empleado','admin','client')) {
  $electionState=New-VoteState;$electionBefore=Copy-ElectionData $electionState.after
  $electionBefore['users/voter'].role=$electionRole
  foreach($electionMethod in @('get','list','update')) {
    Add-ElectionCase "$electionRole cannot expose or change individual ballots ($electionMethod)" ('votes/'+$electionState.voteId) $electionMethod 'DENY' $electionBefore $electionBefore
  }
}
$electionState=New-VoteState;$electionState.before['users/voter'].Remove('isActive');$electionState.after['users/voter'].Remove('isActive')
Add-ElectionCase 'Legacy staff without isActive flag can vote' ('votes/'+$electionState.voteId) 'create' 'ALLOW' $electionState.before $electionState.after
$electionState=New-VoteState
$electionState.before['users/voter'].role='CEO';$electionState.after['users/voter'].role='CEO'
$electionState.before['elections/election-1'].positions+=@(3..20 | ForEach-Object {"Cargo $_"})
$electionState.before['elections/election-1'].departments+=@(2..30 | ForEach-Object {"Área $_"})
$electionState.after['elections/election-1'].positions=Copy-ElectionData $electionState.before['elections/election-1'].positions
$electionState.after['elections/election-1'].departments=Copy-ElectionData $electionState.before['elections/election-1'].departments
Add-VotingCases 'CEO can vote with maximum electoral configuration' 'ALLOW' $electionState
foreach($electionCounter in @('candidate-negative','candidate-fractional','candidate-overflow','election-negative','election-fractional','election-overflow')) {
  $electionState=New-VoteState
  $electionPrevious=if($electionCounter -like '*negative'){-1}elseif($electionCounter -like '*fractional'){2.5}else{9007199254740991L}
  if($electionCounter -like 'candidate-*') {$electionState.before['candidates/candidate-1'].votes=$electionPrevious;$electionState.after['candidates/candidate-1'].votes=$electionPrevious+1}
  else {$electionState.before['elections/election-1'].totalVotes=$electionPrevious;$electionState.after['elections/election-1'].totalVotes=$electionPrevious+1}
  Add-VotingCases "Invalid $electionCounter counter denied" 'DENY' $electionState
}
foreach($electionRole in @('CEO','superadmin','admin','moderator')) {
  $electionBefore=@{'users/voter'=@{role='Empleado';email='voter@example.com'}};$electionAfter=Copy-ElectionData $electionBefore
  $electionAfter['users/voter'].role=$electionRole
  Add-ElectionCase "User cannot self-promote to electoral manager $electionRole" 'users/voter' 'update' 'DENY' $electionBefore $electionAfter
}

$electionNewBefore=@{'users/voter'=@{role='CEO';isActive=$true}}
$electionNewAfter=Copy-ElectionData $electionNewBefore;$electionNewAfter['elections/new-election']=New-ElectionData
$electionNewAfter['elections/new-election'].createdBy='voter';$electionNewAfter['elections/new-election'].createdAt=$electionNow
$electionNewAfter['elections/new-election'].updatedAt=$electionNow;$electionNewAfter['elections/new-election'].status='draft';$electionNewAfter['elections/new-election'].totalVotes=0
foreach($electionChange in @(
  @{field='name';value='ab';label='short name'},@{field='name';value=('a'*161);label='oversized name'},
  @{field='description';value=('a'*3001);label='oversized description'},@{field='startDate';value='invalid-date';label='invalid date'},
  @{field='endDate';value=$electionStart;label='end at start'},@{field='status';value='active';label='skip draft'},
  @{field='positions';value=@();label='no positions'},@{field='positions';value=@('Dirección','Dirección');label='duplicate positions'},
  @{field='positions';value=@('');label='empty position'},@{field='positions';value=@(123);label='non-string position'},
  @{field='positions';value=@($null);label='null position'},@{field='positions';value=@($true);label='boolean position'},
  @{field='positions';value=@(@{label='Cargo'});label='map position'},@{field='positions';value=@("Cargo`nOtro cargo");label='embedded position newline'},
  @{field='positions';value=@(('a'*101));label='oversized position'},
  @{field='departments';value=@('General','General');label='duplicate departments'},@{field='departments';value=@(123);label='non-string department'},
  @{field='departments';value=@($null);label='null department'},@{field='departments';value=@($false);label='boolean department'},
  @{field='departments';value=@(@{label='Área'});label='map department'},@{field='departments';value=@("Área`nOtra área");label='embedded department newline'},
  @{field='departments';value=@(('a'*101));label='oversized department'},
  @{field='totalVotes';value=1;label='invented starting votes'},@{field='totalVotes';value=-1;label='negative votes'},
  @{field='createdBy';value='intruder';label='forged author'},@{field='createdAt';value=$electionStart;label='forged creation time'},
  @{field='updatedAt';value=$electionStart;label='forged update time'},@{field='admin';value=$true;label='unknown field'}
)) {
  $electionAfter=Copy-ElectionData $electionNewAfter;$electionAfter['elections/new-election'][$electionChange.field]=$electionChange.value
  Add-ElectionCase "Election schema rejects $($electionChange.label)" 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionAfter
}
foreach($electionField in @('positions','departments')) {
  $electionAfter=Copy-ElectionData $electionNewAfter;$electionAfter['elections/new-election'][$electionField]=@(,@('nested','list'))
  Add-ElectionCase "Election schema rejects nested $electionField list" 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionAfter
}
$electionAfter=Copy-ElectionData $electionNewAfter;$electionAfter['elections/new-election'].positions=@(('a'*100));$electionAfter['elections/new-election'].departments=@()
Add-ElectionCase '100-character position and unrestricted departments accepted' 'elections/new-election' 'create' 'ALLOW' $electionNewBefore $electionAfter
foreach($electionTransition in @(@{from='draft';to='active';allowed=$true},@{from='active';to='closed';allowed=$true},@{from='closed';to='archived';allowed=$true},
  @{from='closed';to='active';allowed=$false},@{from='archived';to='active';allowed=$false},@{from='active';to='draft';allowed=$false},@{from='active';to='archived';allowed=$false})) {
  $electionBefore=Copy-ElectionData $electionNewAfter
  $electionBefore['elections/new-election'].status=$electionTransition.from
  $electionAfter=Copy-ElectionData $electionBefore;$electionAfter['elections/new-election'].status=$electionTransition.to
  $electionExpected=if($electionTransition.allowed){'ALLOW'}else{'DENY'}
  Add-ElectionCase "CEO transition $($electionTransition.from) to $($electionTransition.to) -> $electionExpected" 'elections/new-election' 'update' $electionExpected $electionBefore $electionAfter
}
$electionAfter=Copy-ElectionData $electionNewAfter
$electionAfter['elections/new-election'].positions=@(1..20 | ForEach-Object {"Cargo $_"})
$electionAfter['elections/new-election'].departments=@(1..30 | ForEach-Object {"Área $_"})
Add-ElectionCase 'Exact maximum positions and departments accepted' 'elections/new-election' 'create' 'ALLOW' $electionNewBefore $electionAfter
$electionLastPosition=Copy-ElectionData $electionAfter;$electionLastPosition['elections/new-election'].positions[19]=123
Add-ElectionCase 'Last permitted position must also be a non-empty string' 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionLastPosition
$electionLastDepartment=Copy-ElectionData $electionAfter;$electionLastDepartment['elections/new-election'].departments[29]=''
Add-ElectionCase 'Last permitted department must also be a non-empty string' 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionLastDepartment
$electionTooMany=Copy-ElectionData $electionAfter;$electionTooMany['elections/new-election'].positions+=@('Cargo 21')
Add-ElectionCase 'Too many positions denied' 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionTooMany
$electionTooMany=Copy-ElectionData $electionAfter;$electionTooMany['elections/new-election'].departments+=@('Área 31')
Add-ElectionCase 'Too many departments denied' 'elections/new-election' 'create' 'DENY' $electionNewBefore $electionTooMany
$electionBefore=Copy-ElectionData $electionNewAfter;$electionBefore['elections/new-election'].status='active';$electionBefore['elections/new-election'].totalVotes=5
$electionAfter=Copy-ElectionData $electionBefore;$electionAfter['elections/new-election'].positions=@('Otro cargo');$electionAfter['elections/new-election'].updatedAt=$electionNow
Add-ElectionCase 'CEO cannot reconfigure active election positions' 'elections/new-election' 'update' 'DENY' $electionBefore $electionAfter
$electionAfter=Copy-ElectionData $electionBefore;$electionAfter['elections/new-election'].totalVotes=10;$electionAfter['elections/new-election'].updatedAt=$electionNow
Add-ElectionCase 'CEO cannot manually invent aggregate votes' 'elections/new-election' 'update' 'DENY' $electionBefore $electionAfter

# Persisted result documents are legacy read models, never a client-controlled
# authority for tallies. Current results derive from candidates' atomic counters.
foreach($electionMethod in @('create','update','delete')) {
  $electionBefore=@{'users/voter'=@{role='CEO'};'electionResults/legacy'=@{electionId='election-1';totalVotes=5}}
  Add-ElectionCase "CEO cannot forge legacy result documents ($electionMethod)" 'electionResults/legacy' $electionMethod 'DENY' $electionBefore $electionBefore
}

# Synthetic Rules API tests execute no commits. Request resources and every
# referenced get/getAfter/exists/existsAfter document are provided as mocks.
Write-ElectionJson (Join-Path $script:ElectionQa 'test-labels.json') $electionLabels.ToArray()
$electionResult=@{testResults=[System.Collections.Generic.List[object]]::new();issues=[System.Collections.Generic.List[object]]::new()}
# Bounded batches avoid a large test-suite response timing out at the API edge.
# The source is identical in every batch and hashes are rechecked at the end.
for($electionOffset=0;$electionOffset -lt $electionCases.Count;$electionOffset+=60) {
  $electionLast=[Math]::Min($electionOffset+59,$electionCases.Count-1)
  $electionBatch=@($electionCases.ToArray()[$electionOffset..$electionLast])
  $electionBody=@{source=@{files=@(@{name='firestore.rules';content=$electionPrepared.source})};testSuite=@{testCases=$electionBatch}} | ConvertTo-Json -Depth 70
  $electionBatchResult=Invoke-RestMethod -Method Post -Uri ($script:ElectionApi+"projects/$($script:ElectionProject):test") -Headers $electionHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($electionBody)) -MaximumRetryCount 2 -RetryIntervalSec 3
  foreach($electionIssue in @($electionBatchResult.issues)) {if($null -ne $electionIssue){$electionResult.issues.Add($electionIssue)}}
  foreach($electionItem in @($electionBatchResult.testResults)) {if($null -ne $electionItem){$electionResult.testResults.Add($electionItem)}}
  Write-Output "Rules API evaluated cases $($electionOffset+1)-$($electionLast+1) / $($electionCases.Count)."
  if($electionBatchResult.issues | Where-Object {$_.severity -eq 'ERROR'}) {break}
}
$electionResultPath=Join-Path $script:ElectionQa 'test-result.json'
Write-ElectionJson $electionResultPath $electionResult
if ($electionResult.issues | Where-Object {$_.severity -eq 'ERROR'}) { $electionResult.issues | ConvertTo-Json -Depth 10; throw 'Election rules compilation failed.' }
if (@($electionResult.testResults).Count -ne $electionCases.Count) { throw 'Rules API did not return a result for every case.' }
$electionFailures=0
for($electionIndex=0;$electionIndex -lt $electionCases.Count;$electionIndex++) {
  $electionState=$electionResult.testResults[$electionIndex].state
  Write-Output "$electionState | $($electionLabels[$electionIndex])"
  if($electionState -ne 'SUCCESS') {$electionFailures++;$electionResult.testResults[$electionIndex] | Select-Object state,debugMessages,errorPosition,functionCalls | ConvertTo-Json -Depth 12}
}
if($electionFailures -gt 0) { throw "$electionFailures election rules cases failed." }
$electionHashPaths=@{sourceSha256=$electionSourcePath;fragmentSha256=$script:ElectionFragmentPath;baselineSha256=(Join-Path $script:ElectionQa 'baseline.rules');baselineManifestSha256=(Join-Path $script:ElectionQa 'baseline-manifest.json');testFileSha256=$PSCommandPath;commonFileSha256=(Join-Path $PSScriptRoot 'election-rules-common.ps1')}
foreach($electionKey in $electionHashPaths.Keys) {if($electionVerifiedHashes[$electionKey] -ne (Get-ElectionHash $electionHashPaths[$electionKey])) {throw 'An input changed during verification. Run the tests again.'}}
$electionVerifiedHashes.resultSha256=Get-ElectionHash $electionResultPath
$electionVerifiedHashes.baselineRuleset=$electionPrepared.baseline.ruleset
$electionVerifiedHashes.caseCount=$electionCases.Count;$electionVerifiedHashes.allPassed=$true;$electionVerifiedHashes.testedAt=[DateTime]::UtcNow.ToString('o')
Write-ElectionJson $electionManifestPath $electionVerifiedHashes
Write-Output "Verified $($electionCases.Count) election cases against the scoped authoritative source. No Firestore data writes or rules deployment performed."
