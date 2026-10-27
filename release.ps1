<#
Publica el dashboard web y el instalador Windows firmado con una sola versión.
Ejemplo: .\release.ps1 -Version 2.1.58 -Notes 'Rediseño completo del dashboard.'
No crea commits, no altera el índice y no hace git push.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')]
    [string]$Version,
    [string]$Notes = 'Mejoras de Moon Studios.',
    [switch]$CheckOnly,
    [switch]$Resume
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = 'pandita1589/moon-Studios-Dashboard'
$siteId = '63c833fa-109e-4fe4-942e-3bf188c2e440'
$siteUrl = 'https://moon-studios-dashboard.netlify.app'
$tag = "v$Version"
$utf8 = New-Object System.Text.UTF8Encoding $false
$workDir = $PSScriptRoot
$tauriPath = Join-Path $workDir 'src-tauri\tauri.conf.json'
$cargoPath = Join-Path $workDir 'src-tauri\Cargo.toml'
$lockPath = Join-Path $workDir 'src-tauri\Cargo.lock'
$bundleDir = Join-Path $workDir 'src-tauri\target\release\bundle\nsis'
$distDir = Join-Path $workDir 'dist'
$keyPath = Join-Path $env:USERPROFILE 'moonStudios.key'
$passwordPath = Join-Path $env:USERPROFILE '.moon-studios\signing-password.dpapi'
$releaseDir = Join-Path $workDir ".moon-qa\releases\$tag"
$releaseCreated = $false
$releasePublished = $false
$webPublished = $false
$previousPrivateKey = [Environment]::GetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY', 'Process')
$previousPassword = [Environment]::GetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', 'Process')

function Step([string]$Message) { Write-Host "`n$Message" -ForegroundColor Cyan }
function Save-Utf8([string]$Path, [string]$Text) { [IO.File]::WriteAllText($Path, $Text, $utf8) }
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command terminó con código $LASTEXITCODE. Se detuvo la publicación." }
}
function Read-CommandJson {
    param([string]$Command, [string[]]$Arguments)
    $errorPath = Join-Path $env:TEMP ('moon-release-' + [guid]::NewGuid().ToString('N') + '.log')
    try {
        $output = & $Command @Arguments 2> $errorPath
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $detail = [IO.File]::ReadAllText($errorPath).Trim()
            $detail = [regex]::Replace($detail, [string][char]27 + '\[[0-9;]*[A-Za-z]', '')
            foreach ($secretName in @('TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD', 'GH_TOKEN', 'GITHUB_TOKEN', 'NETLIFY_AUTH_TOKEN')) {
                $secretValue = [Environment]::GetEnvironmentVariable($secretName, 'Process')
                if (-not [string]::IsNullOrEmpty($secretValue)) { $detail = $detail.Replace($secretValue, '[redactado]') }
            }
            $detail = [regex]::Replace($detail, '(?i)(Bearer\s+|(?:authorization|token|password)\s*[:=]\s*)\S+', '$1[redactado]')
            $detail = [regex]::Replace($detail, '(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|nfp_[A-Za-z0-9_]{20,})', '[redactado]')
            if ($detail.Length -gt 600) { $detail = $detail.Substring(0, 600) + '…' }
            throw "$Command terminó con código $exitCode. $detail"
        }
        try { return (($output -join "`n") | ConvertFrom-Json) }
        catch { throw "$Command no devolvió el JSON esperado; no se continuará con datos incompletos." }
    } finally { Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue }
}

function Get-ReleaseByTag([string]$Repository, [string]$ReleaseTag) {
    # Los drafts pueden existir antes de que GitHub materialice su etiqueta.
    $pages = @(Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$Repository/releases?per_page=100", '--paginate', '--slurp'))
    $matching = @($pages | ForEach-Object { foreach ($candidate in @($_)) { if ($candidate.tag_name -eq $ReleaseTag) { $candidate } } })
    if ($matching.Count -ne 1) { throw "No se encontró una publicación única para $ReleaseTag." }
    return (Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$Repository/releases/$($matching[0].id)"))
}
function Get-WebDistHash([string]$Directory) {
    $files = @(Get-ChildItem -LiteralPath $Directory -File -Recurse | Where-Object { $_.Name -ne 'moon-release.json' } | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($Directory.Length).Replace('\','/') + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() })
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($files -join [string][char]10))))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}

function Read-PackageVersion([string]$Text) {
    $package = [regex]::Match($Text, '(?ms)^\[package\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
    if (-not $package.Success) { throw 'No se encontró [package] en Cargo.toml.' }
    $match = [regex]::Match($package.Groups['body'].Value, '(?m)^version\s*=\s*"(?<version>[^"]+)"')
    if (-not $match.Success) { throw 'No se encontró la versión del paquete Rust.' }
    return $match.Groups['version'].Value
}

# Verifica las dos firmas Ed25519 de Minisign y el identificador de la clave.
# El formato coincide con minisign-verify, dependencia del updater de Tauri.
$signatureVerifier = @"
const fs = require('node:fs');
const crypto = require('node:crypto');
try {
  const [exePath, sigPath, configPath] = process.argv.slice(2);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  const keyLines = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8').trim().split(/\r?\n/);
  const key = Buffer.from(keyLines[1], 'base64');
  const sigLines = Buffer.from(fs.readFileSync(sigPath, 'utf8').trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const packet = Buffer.from(sigLines[1], 'base64');
  const globalSignature = Buffer.from(sigLines[3], 'base64');
  if (key.length !== 42 || packet.length !== 74 || globalSignature.length !== 64 || !sigLines[2].startsWith('trusted comment: ')) throw new Error('Formato Minisign inválido.');
  if (!key.subarray(2, 10).equals(packet.subarray(2, 10))) throw new Error('La firma no corresponde a la clave pública del updater.');
  const publicKey = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]), type: 'spki', format: 'der' });
  const algorithm = packet.subarray(0, 2).toString('ascii');
  const binary = fs.readFileSync(exePath);
  const signedData = algorithm === 'ED' ? crypto.createHash('blake2b512').update(binary).digest() : algorithm === 'Ed' ? binary : null;
  if (!signedData || !crypto.verify(null, signedData, publicKey, packet.subarray(10))) throw new Error('La firma del instalador no es válida.');
  const globalData = Buffer.concat([packet.subarray(10), Buffer.from(sigLines[2].slice(17), 'utf8')]);
  if (!crypto.verify(null, globalData, publicKey, globalSignature)) throw new Error('El comentario firmado de Minisign no es válido.');
  console.log('Firma del instalador verificada con la clave pública de la aplicación.');
} catch (error) { console.error(error.message); process.exit(1); }
"@

Push-Location -LiteralPath $workDir
try {
    Step '1/7 · Comprobaciones previas'
    foreach ($command in @('node', 'npm', 'cargo', 'gh', 'netlify', 'git')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Falta $command en PATH." }
    }
    if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw 'No se encontró la clave privada de firma en USERPROFILE\moonStudios.key.' }
    if (-not (Test-Path -LiteralPath $passwordPath -PathType Leaf) -and $null -eq $previousPassword) { throw 'No se encontró la credencial local de firma. Consulta docs/PUBLICAR-DASHBOARD.md.' }
    $tauriText = [IO.File]::ReadAllText($tauriPath)
    $tauriConfig = $tauriText | ConvertFrom-Json
    $cargoText = [IO.File]::ReadAllText($cargoPath)
    $cargoVersion = Read-PackageVersion $cargoText
    if ($cargoVersion -ne $tauriConfig.version) { throw 'Cargo.toml y tauri.conf.json tienen versiones distintas; corrígelas antes de publicar.' }
    if ([version]$Version -lt [version]$tauriConfig.version) { throw 'La versión solicitada es inferior a la versión local.' }
    $expectedEndpoint = "https://github.com/$repo/releases/latest/download/latest.json"
    if (@($tauriConfig.plugins.updater.endpoints) -notcontains $expectedEndpoint) { throw 'El updater no apunta al repositorio esperado.' }
    if (-not $tauriConfig.bundle.createUpdaterArtifacts) { throw 'Tauri debe generar los artefactos firmados del updater.' }
    $repoInfo = Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$repo")
    $canonicalRepo = $repoInfo.full_name
    if (-not $repoInfo.permissions.push) { throw 'La cuenta de GitHub no puede publicar en el repositorio del dashboard.' }
    if ($repoInfo.private) { throw 'El repositorio del updater debe permitir descargar públicamente los artefactos.' }
    $releases = @(Read-CommandJson -Command 'gh' -Arguments @('release', 'list', '--repo', $repo, '--limit', '1000', '--json', 'tagName,isDraft,isPrerelease'))
    $existingRelease = @($releases | Where-Object { $_.tagName -eq $tag })
    if ($Resume) {
        if ($existingRelease.Count -ne 1 -or -not $existingRelease[0].isDraft) { throw '-Resume requiere un único borrador existente de esa misma versión.' }
        if ($Version -ne $tauriConfig.version) { throw 'Para reanudar, la versión local debe coincidir con los artefactos solicitados.' }
        $releaseCreated = $true
    } elseif ($existingRelease.Count -gt 0) { throw "Ya existe la publicación $tag. No se sobrescribirá; usa -Resume si es un borrador tuyo pendiente." }
    foreach ($release in $releases) {
        if (-not $release.isDraft -and -not $release.isPrerelease -and $release.tagName -match '^v?([0-9]+\.[0-9]+\.[0-9]+)$') {
            if ([version]$Version -le [version]$Matches[1]) { throw 'La nueva versión debe superar las versiones estables ya publicadas.' }
        }
    }
    $existingRefs = @(Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$repo/git/matching-refs/tags/$tag"))
    if (-not $Resume -and @($existingRefs | Where-Object { $_.ref -eq "refs/tags/$tag" }).Count -gt 0) { throw "Ya existe la etiqueta $tag en GitHub. Usa otra versión o revisa la publicación anterior." }
    $remoteCommit = Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$repo/commits/$($repoInfo.default_branch)")
    $sites = @(Read-CommandJson -Command 'netlify' -Arguments @('sites:list', '--json'))
    $site = @($sites | Where-Object { $_.id -eq $siteId })
    if ($site.Count -ne 1) { throw 'La cuenta de Netlify no tiene acceso al sitio existente del dashboard.' }
    Write-Host "Versión $Version · GitHub y Netlify preparados."
    if ($CheckOnly) { Write-Host 'Comprobación terminada sin compilar, modificar versiones ni publicar.' -ForegroundColor Green; return }

    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    if (-not $Resume) {
    Step '2/7 · Sincronizar versiones de Tauri y Rust'
    $tauriVersionPattern = '(?m)^(  "version"\s*:\s*")[^"]+("\s*,?\s*)$'
    if ([regex]::Matches($tauriText, $tauriVersionPattern).Count -ne 1) { throw 'No se pudo localizar de forma única la versión raíz de Tauri.' }
    $tauriUpdated = [regex]::Replace($tauriText, $tauriVersionPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $match.Groups[1].Value + $Version + $match.Groups[2].Value })
    $packagePattern = '(?ms)^\[package\]\s*\r?\n(?<body>.*?)(?=^\[|\z)'
    $cargoUpdated = [regex]::Replace($cargoText, $packagePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) [regex]::Replace($match.Value, '(?m)^(version\s*=\s*")[^"]+("\s*)$', [System.Text.RegularExpressions.MatchEvaluator]{ param($versionMatch) $versionMatch.Groups[1].Value + $Version + $versionMatch.Groups[2].Value }) })
    Save-Utf8 $tauriPath $tauriUpdated
    Save-Utf8 $cargoPath $cargoUpdated
    if (Test-Path -LiteralPath $lockPath) {
        $lockText = [IO.File]::ReadAllText($lockPath)
        $lockPattern = '(?m)(^\[\[package\]\]\r?\nname = "moon-studios"\r?\nversion = ")[^"]+("\r?$)'
        if ([regex]::Matches($lockText, $lockPattern).Count -ne 1) { throw 'No se encontró el paquete moon-studios de forma única en Cargo.lock.' }
        $lockUpdated = [regex]::Replace($lockText, $lockPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $match.Groups[1].Value + $Version + $match.Groups[2].Value })
        Save-Utf8 $lockPath $lockUpdated
    }

    Step '3/7 · Compilar y firmar Windows (incluye la compilación web)'
    $env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText($keyPath, [Text.Encoding]::UTF8)
    if ($null -ne $previousPassword) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword }
    else {
        $securePassword = ([IO.File]::ReadAllText($passwordPath) | ConvertTo-SecureString)
        $credential = New-Object System.Management.Automation.PSCredential('moon-release', $securePassword)
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $credential.GetNetworkCredential().Password
    }
    $buildStarted = [DateTime]::UtcNow
    Invoke-Checked -Command 'npm' -Arguments @('run', 'tauri', '--', 'build', '--bundles', 'nsis')
    $installer = Join-Path $bundleDir "moon Studios_${Version}_x64-setup.exe"
    $signaturePath = "$installer.sig"
    foreach ($file in @($installer, $signaturePath, (Join-Path $distDir 'index.html'))) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Falta un artefacto exacto de la versión solicitada; no se elegirá otro instalador por fecha.' }
    }
    if ((Get-Item -LiteralPath $installer).LastWriteTimeUtc -lt $buildStarted.AddSeconds(-2)) { throw 'El instalador es anterior a esta compilación.' }
    if (([IO.File]::ReadAllText($tauriPath) | ConvertFrom-Json).version -ne $Version -or (Read-PackageVersion ([IO.File]::ReadAllText($cargoPath))) -ne $Version) { throw 'Las versiones cambiaron durante la compilación.' }
    $signatureVerifier | & node '-' $installer $signaturePath $tauriPath
    if ($LASTEXITCODE -ne 0) { throw 'La comprobación criptográfica del instalador falló.' }

    Step '4/7 · Preparar assets y descriptor de actualización'
    $assetName = "moon.Studios_${Version}_x64-setup.exe"
    $assetPath = Join-Path $releaseDir $assetName
    $assetSignaturePath = "$assetPath.sig"
    Copy-Item -LiteralPath $installer -Destination $assetPath -Force
    Copy-Item -LiteralPath $signaturePath -Destination $assetSignaturePath -Force
    $signature = [IO.File]::ReadAllText($assetSignaturePath).Trim()
    $downloadUrl = "https://github.com/$canonicalRepo/releases/download/$tag/$assetName"
    $latest = [ordered]@{ version = $Version; notes = $Notes; pub_date = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); platforms = [ordered]@{ 'windows-x86_64' = [ordered]@{ signature = $signature; url = $downloadUrl } } }
    $latestPath = Join-Path $releaseDir 'latest.json'
    Save-Utf8 $latestPath ($latest | ConvertTo-Json -Depth 6)
    $notesPath = Join-Path $releaseDir 'notes.md'
    Save-Utf8 $notesPath $Notes
    $sourceCommit = (& git rev-parse HEAD) -join ''
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar el commit local.' }
    $sourceStatus = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado del workspace.' }
    $webHash = Get-WebDistHash $distDir
    $buildInfo = [ordered]@{ version = $Version; built_at = [DateTime]::UtcNow.ToString('o'); source_commit = $sourceCommit; source_dirty = $sourceStatus.Count -gt 0; release_tag_commit = $remoteCommit.sha; installer_sha256 = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant(); web_dist_sha256 = $webHash }
    $buildInfoPath = Join-Path $releaseDir 'build-info.json'
    Save-Utf8 $buildInfoPath ($buildInfo | ConvertTo-Json)
    Save-Utf8 (Join-Path $distDir 'moon-release.json') ($buildInfo | ConvertTo-Json)


    } else {
        Step '2–4/7 · Reutilizar artefactos existentes sin volver a compilar'
        $assetName = "moon.Studios_${Version}_x64-setup.exe"
        $assetPath = Join-Path $releaseDir $assetName
        $assetSignaturePath = "$assetPath.sig"
        $latestPath = Join-Path $releaseDir 'latest.json'
        $buildInfoPath = Join-Path $releaseDir 'build-info.json'
        $notesPath = Join-Path $releaseDir 'notes.md'
        foreach ($required in @($assetPath, $assetSignaturePath, $latestPath, $buildInfoPath, $notesPath, (Join-Path $distDir 'index.html'), (Join-Path $distDir 'moon-release.json'))) {
            if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw '-Resume requiere todos los artefactos originales y el dist de aquella compilación.' }
        }
        $latest = [IO.File]::ReadAllText($latestPath) | ConvertFrom-Json
        $buildInfo = [IO.File]::ReadAllText($buildInfoPath) | ConvertFrom-Json
        $webMetadata = [IO.File]::ReadAllText((Join-Path $distDir 'moon-release.json')) | ConvertFrom-Json
        $signature = [IO.File]::ReadAllText($assetSignaturePath).Trim()
        $downloadUrl = "https://github.com/$canonicalRepo/releases/download/$tag/$assetName"
        if ($latest.version -ne $Version -or $buildInfo.version -ne $Version -or $webMetadata.version -ne $Version) { throw 'Los manifiestos no corresponden a la versión que se intenta reanudar.' }
        if ($latest.platforms.'windows-x86_64'.signature -ne $signature -or $latest.platforms.'windows-x86_64'.url -ne $downloadUrl) { throw 'latest.json no corresponde al instalador y firma originales.' }
        if ((Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $buildInfo.installer_sha256) { throw 'El instalador cambió desde la compilación original.' }
        $webHash = Get-WebDistHash $distDir
        if ($webHash -ne $buildInfo.web_dist_sha256 -or $webMetadata.web_dist_sha256 -ne $webHash -or $webMetadata.installer_sha256 -ne $buildInfo.installer_sha256) { throw 'El contenido de dist cambió desde la compilación original; no se reanudará con otra web.' }
        $signatureVerifier | & node '-' $assetPath $assetSignaturePath $tauriPath
        if ($LASTEXITCODE -ne 0) { throw 'La firma del instalador guardado no es válida.' }
        Write-Host 'Artefactos originales verificados. Se conservarán también sus notas y fecha de compilación.'
    }

    Step '5/7 · Preparar y validar el borrador de GitHub'
    if (-not $Resume) {
        Invoke-Checked -Command 'gh' -Arguments @('release', 'create', $tag, $assetPath, $assetSignaturePath, $latestPath, $buildInfoPath, '--repo', $repo, '--draft', '--target', $remoteCommit.sha, '--title', "moon Studios $tag", '--notes-file', $notesPath)
        $releaseCreated = $true
    }
    $draft = Get-ReleaseByTag $repo $tag
    if (-not $draft.draft) { throw 'Se esperaba una publicación en borrador antes de desplegar la web.' }
    foreach ($expectedFile in @($assetPath, $assetSignaturePath, $latestPath, $buildInfoPath)) {
        $localFile = Get-Item -LiteralPath $expectedFile
        $uploaded = @($draft.assets | Where-Object { $_.name -eq $localFile.Name })
        if ($uploaded.Count -ne 1 -or $uploaded[0].size -ne $localFile.Length) { throw "El asset $($localFile.Name) no se subió íntegramente." }
        $localDigest = 'sha256:' + (Get-FileHash -LiteralPath $localFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($uploaded[0].PSObject.Properties.Name -contains 'digest' -and $uploaded[0].digest) {
            if ($uploaded[0].digest -ne $localDigest) { throw "El contenido del asset $($localFile.Name) difiere de su SHA-256 local." }
        } elseif ($Resume) { throw "GitHub no devolvió un SHA-256 para $($localFile.Name); no se reanudará sin verificar su contenido." }
    }

    Step '6/7 · Publicar el dashboard web existente en Netlify'
    $deployment = Read-CommandJson -Command 'netlify' -Arguments @('deploy', '--dir', $distDir, '--site', $siteId, '--prod', '--no-build', '--message', "Moon Studios dashboard $tag", '--json')
    if ($deployment.site_id -ne $siteId -or [string]::IsNullOrWhiteSpace($deployment.deploy_id)) { throw 'Netlify no confirmó un deploy del sitio esperado.' }
    $webPublished = $true
    Save-Utf8 (Join-Path $releaseDir 'netlify-deploy.json') ($deployment | ConvertTo-Json -Depth 8)

    Step '7/7 · Publicar Windows y verificar ambos canales'
    Invoke-Checked -Command 'gh' -Arguments @('release', 'edit', $tag, '--repo', $repo, '--draft=false', '--latest')
    $releasePublished = $true
    $published = Read-CommandJson -Command 'gh' -Arguments @('api', "repos/$repo/releases/$($draft.id)")
    if ($published.draft -or $published.prerelease) { throw 'GitHub no confirmó una publicación estable.' }
    $publishedInstaller = @($published.assets | Where-Object { $_.name -eq $assetName })
    if ($publishedInstaller.Count -ne 1 -or $publishedInstaller[0].browser_download_url -ne $downloadUrl) { throw 'La URL publicada del instalador no coincide con latest.json.' }
    if ($publishedInstaller[0].PSObject.Properties.Name -contains 'digest' -and $publishedInstaller[0].digest -and $publishedInstaller[0].digest -ne "sha256:$($buildInfo.installer_sha256)") { throw 'El SHA-256 del asset en GitHub no coincide con el instalador compilado.' }
    $verified = $false
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        try {
            $webMetadata = Invoke-RestMethod -Uri "$siteUrl/moon-release.json?version=$Version&check=$attempt" -UseBasicParsing
            $remoteLatest = Invoke-RestMethod -Uri "$expectedEndpoint`?version=$Version&check=$attempt" -UseBasicParsing
            if ($webMetadata.version -eq $Version -and $webMetadata.web_dist_sha256 -eq $webHash -and $remoteLatest.version -eq $Version -and $remoteLatest.platforms.'windows-x86_64'.url -eq $downloadUrl -and $remoteLatest.platforms.'windows-x86_64'.signature -eq $signature) { $verified = $true; break }
        } catch { if ($attempt -eq 8) { throw 'Ambos canales están publicados, pero no se pudo confirmar su respuesta HTTP final.' } }
        Start-Sleep -Seconds 3
    }
    if (-not $verified) { throw 'La versión servida por web o updater no coincide con la publicación.' }
    Save-Utf8 (Join-Path $workDir 'latest.json') ($latest | ConvertTo-Json -Depth 6)
    Write-Host "`nPublicado y verificado: $Version" -ForegroundColor Green
    Write-Host "Web: $siteUrl"
    Write-Host "Windows: $($published.html_url)"
    Write-Host "Instalador local: $assetPath"
    Write-Host 'No se crearon commits ni se modificó el índice de Git.'
} catch {
    Write-Host "`nPublicación detenida: $($_.Exception.Message)" -ForegroundColor Red
    if ($webPublished) { Write-Host "La web ya se publicó: $siteUrl" }
    if ($releasePublished) { Write-Host "Windows ya se publicó: https://github.com/$repo/releases/tag/$tag" }
    elseif ($releaseCreated) { Write-Host "Se conserva el borrador de GitHub $tag para revisar o completar. No se publicará automáticamente." }
    throw
} finally {
    [Environment]::SetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY', $previousPrivateKey, 'Process')
    [Environment]::SetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', $previousPassword, 'Process')
    Pop-Location
}
