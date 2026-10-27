# Company boundary cases run against the same mocked Rules API source as elections.
# Every document below is synthetic; these cases never read or write app data.
function New-CompanyAuthState([string]$Role='external',[bool]$Active=$true) {
  $profile=if($Role -eq 'external'){$null}else{@{uid='voter';email='voter@example.com';name='Persona';displayName='Persona';role=$Role;isActive=$Active;createdAt=$electionStart}}
  return @{'users/voter'=$profile}
}
$companyGeneralReads=@(
  'users/other','discord/config','tasks/protected','announcements/protected',
  'dashboard_banners/welcome','dashboard_config/general','dev_projects/project','dev_tasks/task',
  'maintenance/bot','notifications/notice','hilos/thread','hilos/thread/replies/reply',
  'hilos/thread/presence/other','conferences/conference','conferences/conference/messages/message',
  'conferences/conference/participants/other','conferences/conference/calls/call',
  'conferences/conference/calls/call/callerCandidates/ice','conferences/conference/calls/call/calleeCandidates/ice',
  'conferences/conference/requests/request'
)
foreach($role in @('external','client','employee','admin','superadmin','moderator','ceo','unknown')) {
  foreach($route in $companyGeneralReads) {
    $b=New-CompanyAuthState $role;$b[$route]=@{uid='other';role='Empleado';userId='other';authorUid='other'}
    foreach($method in @('get','list')) {
      Add-ElectionCase "Company boundary: $role cannot $method $route" $route $method 'DENY' $b $b
    }
  }
  foreach($route in @('userSessions/private','sessions/private','activityLogs/private','userActivityLogs/private','taskReports/private','correos/private','mensajeria/private','contracts/private','system_logs/private','diseno_media/private','secretaria_docs/private','dev_changelog/private','libro_diario/private','contabilidad_sueldos/private','userInvitations/other@example.com','bug_reports/private')) {
    $b=New-CompanyAuthState $role;$b[$route]=@{uid='other';reportedBy='other';fromUid='other';toUid='other';deletedBy='other';userId='other'}
    foreach($method in @('get','list')) {Add-ElectionCase "Company private: $role cannot $method $route" $route $method 'DENY' $b $b}
  }
}
foreach($role in @('CEO','Administración','Empleado','Contador','Diseño','Secretaría','Programación')) {
  foreach($route in $companyGeneralReads) {
    $b=New-CompanyAuthState $role;$b[$route]=@{uid='other';role='Empleado';userId='other';authorUid='other'}
    foreach($method in @('get','list')) {Add-ElectionCase "Existing company directory: $role can $method $route" $route $method 'ALLOW' $b $b}
  }
  foreach($route in @('tasks/protected','users/other','discord/config','announcements/protected','notifications/notice','conferences/conference')) {
    $b=New-CompanyAuthState $role $false;$b[$route]=@{uid='other';role='Empleado'}
    foreach($method in @('get','list')) {Add-ElectionCase "Inactive company: $role cannot $method $route" $route $method 'DENY' $b $b}
  }
}
# Membership cannot be self-created, copied from a provider, or restored by self-edit.
foreach($role in @('Empleado','employee','CEO','Administración','admin','external')) {
  $b=New-CompanyAuthState;$a=Copy-ElectionData $b
  $a['users/voter']=@{uid='voter';name='Nueva persona';email='voter@example.com';role=$role;createdAt=$electionNow}
  Add-ElectionCase "Public registration cannot self-create $role" 'users/voter' 'create' 'DENY' $b $a
}
$b=New-CompanyAuthState;$a=Copy-ElectionData $b
$a['users/voter']=@{uid='voter';name='Cliente del portal';email='voter@example.com';role='client';createdAt=$electionNow}
Add-ElectionCase 'Public customer portal may create its exact client profile' 'users/voter' 'create' 'ALLOW' $b $a
foreach($fault in @('otheruid','otheremail','fake-active','fake-provider','fake-createdBy','fake-permissions','fake-emailVerified','fake-photoURL','forged-time')) {
  $changed=Copy-ElectionData $a
  switch($fault) {
    'otheruid' {$changed['users/voter'].uid='other'}
    'otheremail' {$changed['users/voter'].email='other@example.com'}
    'fake-active' {$changed['users/voter'].isActive=$true}
    'fake-provider' {$changed['users/voter'].provider='google.com'}
    'fake-createdBy' {$changed['users/voter'].createdBy='CEO'}
    'fake-permissions' {$changed['users/voter'].permissions=@('admin')}
    'fake-emailVerified' {$changed['users/voter'].emailVerified=$true}
    'fake-photoURL' {$changed['users/voter'].photoURL='https://example.com/avatar.png'}
    'forged-time' {$changed['users/voter'].createdAt=$electionStart}
  }
  Add-ElectionCase "Client self-create rejects $fault" 'users/voter' 'create' 'DENY' $b $changed
}
foreach($role in @('external','client','Empleado','CEO')) {
  $b=New-CompanyAuthState $role
  Add-ElectionCase "$role can get its own profile, including a missing profile" 'users/voter' 'get' 'ALLOW' $b $b
}
foreach($role in @('client','Empleado','Administración')) {
  foreach($field in @('role','isActive','createdBy','createdAt','uid','permissions','employeeId','department','isAdmin','email','provider','emailVerified')) {
    $b=New-CompanyAuthState $role;$a=Copy-ElectionData $b
    $a['users/voter'][$field]=switch($field){'role'{'CEO'};'isActive'{$false};'createdAt'{$electionNow};default{'forged'}}
    Add-ElectionCase "Self profile: $role cannot change protected $field" 'users/voter' 'update' 'DENY' $b $a
  }
}
$b=New-CompanyAuthState 'Empleado' $false;$a=Copy-ElectionData $b;$a['users/voter'].isActive=$true
Add-ElectionCase 'Inactive employee cannot reactivate its own account' 'users/voter' 'update' 'DENY' $b $a
foreach($role in @('client','Empleado','Administración','CEO')) {
  foreach($field in @('name','displayName','phone','bio','website','avatar','avatarHistory','settings','dispositivos','isFirstLogin')) {
    $b=New-CompanyAuthState $role;$a=Copy-ElectionData $b
    $a['users/voter'][$field]=switch($field){
      'avatarHistory' {@(@{url='https://example.com/avatar.png';createdAt=$electionNow})}
      'settings' {@{theme='light';animations=$true;loginAlerts=$true}}
      'dispositivos' {@(@{id='device-test';nombre='Equipo de prueba';visto=$electionNow})}
      'isFirstLogin' {$false}
      default {'Perfil actualizado'}
    }
    Add-ElectionCase "Existing profile preferences: $role may update $field" 'users/voter' 'update' 'ALLOW' $b $a
  }
}
$b=New-CompanyAuthState 'Empleado';$b['users/voter'].isFirstLogin=$false;$a=Copy-ElectionData $b;$a['users/voter'].isFirstLogin=$true
Add-ElectionCase 'Employee cannot reset first-login verification flag' 'users/voter' 'update' 'DENY' $b $a
foreach($role in @('CEO','Administración','Empleado','client','external')) {
  foreach($newRole in @('Empleado','Contador','CEO')) {
    $b=New-CompanyAuthState $role;$a=Copy-ElectionData $b
    $a['users/new-user']=@{uid='new-user';email='new-user@example.com';displayName='Nueva cuenta';role=$newRole;isActive=$true;createdAt=$electionNow}
    $expected=if($role -eq 'CEO' -or ($role -eq 'Administración' -and $newRole -eq 'Empleado')){'ALLOW'}else{'DENY'}
    Add-ElectionCase "Operator $role creates $newRole -> $expected" 'users/new-user' 'create' $expected $b $a
  }
}
# Existing company authorization and owner-scoped settings/session flows remain.
foreach($role in @('CEO','Administración','Empleado','Contador','Diseño','Secretaría','Programación')) {
  foreach($route in @('userSessions/own','sessions/own','userActivityLogs/own','taskReports/own','correos/own','mensajeria/own')) {
    $b=New-CompanyAuthState $role;$b[$route]=@{uid='voter';reportedBy='voter';toUid='voter';fromUid='voter';deletedBy='voter';userId='voter'}
    Add-ElectionCase "Owner record $role reads $route" $route 'get' 'ALLOW' $b $b
  }
  foreach($route in @('tasks/new','announcements/new','conferences/new','contracts/new')) {
    $b=New-CompanyAuthState $role;$a=Copy-ElectionData $b;$a[$route]=@{createdBy='voter';title='Trabajo interno'}
    $expected=if($role -in @('CEO','Administración')){'ALLOW'}else{'DENY'}
    Add-ElectionCase "Existing administration $role creates $route -> $expected" $route 'create' $expected $b $a
  }
  $b=New-CompanyAuthState $role;$a=Copy-ElectionData $b;$a['userSessions/new']=@{uid='voter';sessionKey='test-session'}
  Add-ElectionCase "Session registration $role can create own session" 'userSessions/new' 'create' 'ALLOW' $b $a
  $a['userSessions/new'].uid='other'
  Add-ElectionCase "Session registration $role cannot forge another owner" 'userSessions/new' 'create' 'DENY' $b $a
}
foreach($role in @('CEO','Contador','Empleado','external','client')) {
  foreach($route in @('contabilidad_transacciones/entry','contabilidad_facturas/entry','contabilidad_presupuestos/entry','contabilidad_sueldos/entry','contabilidad_config/entry','contabilidad_asientos/entry','libro_diario/entry')) {
    $b=New-CompanyAuthState $role;$b[$route]=@{createdBy='other'}
    $expected=if($role -in @('CEO','Contador')){'ALLOW'}else{'DENY'}
    Add-ElectionCase "Existing accounting $role reads $route -> $expected" $route 'get' $expected $b $b
  }
}
# Marketing and client portal ownership do not become corporate membership.
foreach($route in @('moonStudios/solicitudes/items/own','moonStudios/socios/items/own','clientes/voter')) {
  $b=New-CompanyAuthState 'client';$b[$route]=@{uid='voter';role='client';email='voter@example.com'}
  Add-ElectionCase "Existing portal client reads own $route" $route 'get' 'ALLOW' $b $b
}
foreach($route in @('moonStudios/solicitudes/items/private','moonStudios/socios/items/private','clientes/other')) {
  $b=New-CompanyAuthState 'client';$b[$route]=@{uid='other';role='client';email='other@example.com'}
  Add-ElectionCase "Client cannot read another customer's $route" $route 'get' 'DENY' $b $b
}
$b=New-CompanyAuthState 'client';$a=Copy-ElectionData $b
$a['moonStudios/solicitudes/items/new']=@{uid='voter';tipo='cotizacion';titulo='Proyecto de prueba';descripcion='Quiero una web para mi proyecto de prueba.';estado='pendiente';imageUrl=$null;creadoEn=$electionNow;actualizadoEn=$electionNow;nota=''}
Add-ElectionCase 'Existing client can submit its own portal request' 'moonStudios/solicitudes/items/new' 'create' 'ALLOW' $b $a
foreach($route in @('moonStudios/web','moonStudios/equipo/items/person','moonStudios/portfolio/items/project','config/public','moon_studios_fest_2026/entry')) {
  $b=@{$route=@{public='unchanged'}}
  Add-ElectionCase "Anonymous public marketing read preserved: $route" $route 'get' 'ALLOW' $b $b ''
}
$b=@{};$a=@{'correos_panel_moonstudios/contact'=@{nombre='Visitante';email='visitante@example.com';mensaje='Solicitud pública de contacto para un proyecto.';fecha=$electionNow;leido=$false;origen='web_contacto'}}
Add-ElectionCase 'Anonymous public contact form remains available' 'correos_panel_moonstudios/contact' 'create' 'ALLOW' $b $a ''
foreach($role in @('CEO','Administración','external','client')) {
  $b=New-CompanyAuthState $role;$b['moonStudios/webDraft']=@{content=@{version=1}}
  $expected=if($role -in @('CEO','Administración')){'ALLOW'}else{'DENY'}
  Add-ElectionCase "CMS draft $role -> $expected" 'moonStudios/webDraft' 'get' $expected $b $b
}
# Known public infrastructure collections stay byte-for-byte unchanged by this patch.
foreach($route in @('allies/ally','incidents/status','_system/heartbeat')) {
  $b=@{$route=@{public='baseline'}};$a=@{$route=@{public='baseline'}}
  foreach($method in @('get','update')) {Add-ElectionCase "Unrelated baseline public path retained: $method $route" $route $method 'ALLOW' $b $a ''}
}