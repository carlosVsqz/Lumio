param([ValidateSet('Prepare','Seed','Run')][string]$Stage='Run')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$envFile=Join-Path $projectRoot '.env'
$localRoot=Join-Path $projectRoot 'infrastructure/odoo/local'
$composeArgs=@('compose','--env-file',$envFile,'-p','lumio-demo-local','--profile','odoo')

function New-LocalSecret { return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant() }
function Read-LocalEnvironment {
    $values=@{}
    foreach($line in [IO.File]::ReadAllLines($envFile)) { if($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $values[$Matches[1]]=$Matches[2] } }
    return $values
}
function Write-EnvironmentValues([hashtable]$values) {
    $lines=[Collections.Generic.List[string]]::new()
    $seen=@{}
    foreach($line in [IO.File]::ReadAllLines($envFile)) {
        if($line -match '^([A-Z][A-Z0-9_]*)=' -and $values.ContainsKey($Matches[1])) {
            $key=$Matches[1]; $lines.Add($key+'='+$values[$key]); $seen[$key]=$true
        } else { $lines.Add($line) }
    }
    foreach($key in $values.Keys) { if(!$seen.ContainsKey($key)) { $lines.Add($key+'='+$values[$key]) } }
    [IO.File]::WriteAllLines($envFile,$lines,[Text.UTF8Encoding]::new($false))
}
function Invoke-Compose([string[]]$arguments) {
    & docker @composeArgs @arguments
    if($LASTEXITCODE -ne 0) { throw "Docker Compose no completó la operación ($($arguments[0])). Revisa el error anterior." }
}

if(!(Test-Path -LiteralPath $envFile)) { Copy-Item -LiteralPath .env.example -Destination $envFile }
$values=Read-LocalEnvironment
if($values['ODOO_DATABASE'] -ne 'lumio_demo' -or $values['COMPOSE_PROJECT_NAME'] -ne 'lumio-demo-local') {
    throw 'Este script solo admite ODOO_DATABASE=lumio_demo y COMPOSE_PROJECT_NAME=lumio-demo-local. Conserva tu .env de otro entorno y prepara uno para la demo.'
}
foreach($key in 'ODOO_DB_PASSWORD','ODOO_DEMO_ADMIN_PASSWORD','ODOO_DEMO_MASTER_PASSWORD') { if(!$values[$key]) { $values[$key]=New-LocalSecret } }
if(!$values['ODOO_DEMO_ADMIN_LOGIN'] -or $values['ODOO_DEMO_ADMIN_LOGIN'] -eq 'demo-admin') { $values['ODOO_DEMO_ADMIN_LOGIN']='lumio-admin' }
$values['ODOO_LANGUAGE']='es_ES'
$values['ODOO_BUSINESS_NAME']=''
$values['CATALOG_PROVIDER']='odoo'
$values['COMPOSE_PROFILES']='odoo'
$values['ODOO_URL']='http://odoo:8069'
$values['ODOO_CONFIG_DIRECTORY']='./infrastructure/odoo/local/config'
$values['ODOO_ADDONS_DIRECTORY']='./infrastructure/odoo/local/addons'
Write-EnvironmentValues $values
New-Item -ItemType Directory -Path (Join-Path $localRoot 'config'),(Join-Path $localRoot 'addons') -Force | Out-Null
$config=@"
[options]
admin_passwd = $($values['ODOO_DEMO_MASTER_PASSWORD'])
addons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/lumio-addons
data_dir = /var/lib/odoo
dbfilter = ^lumio_demo$
list_db = False
proxy_mode = True
"@
[IO.File]::WriteAllText((Join-Path $localRoot 'config/odoo.conf'),$config,[Text.UTF8Encoding]::new($false))
$inputValues=@{admin_login=$values['ODOO_DEMO_ADMIN_LOGIN'];admin_password=$values['ODOO_DEMO_ADMIN_PASSWORD'];existing_api_key=$values['ODOO_API_KEY']}
if($values['ODOO_WEBSITE_ID'] -match '^[1-9][0-9]*$') { $inputValues['website_id']=[int]$values['ODOO_WEBSITE_ID'] }
[IO.File]::WriteAllText((Join-Path $localRoot 'bootstrap-input.json'),($inputValues|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Invoke-Compose @('config','--quiet')
Write-Output 'Entorno demo preparado. Secretos guardados exclusivamente en .env y infrastructure/odoo/local (ignorados).'
if($Stage -eq 'Prepare') { return }

Invoke-Compose @('up','-d','--wait','--wait-timeout','120','odoo-db')
# The initializer is intentionally separate from the live Odoo server.
Invoke-Compose @('run','--rm','-T','odoo','odoo','-d','lumio_demo','-i','website_sale,website_sale_stock,lumio_campaign,lumio_storefront','-u','lumio_storefront','--without-demo','--stop-after-init','--no-http','--log-level=warn')
$demoPath=Join-Path $projectRoot 'infrastructure/odoo/demo'
$seedArgs=$composeArgs+@('run','--rm','-T','--volume',($localRoot.Replace('\','/')+':/mnt/lumio-local'),
    '--volume',($demoPath.Replace('\','/')+':/mnt/lumio-demo:ro'),'odoo','odoo','shell','-d','lumio_demo','--no-http','--shell-interface=python','--log-level=warn')
Get-Content -Raw -LiteralPath (Join-Path $demoPath 'seed.py') | & docker @seedArgs
if($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el catálogo demo de Odoo.' }
$result=Get-Content -Raw -LiteralPath (Join-Path $localRoot 'catalog-settings.json') | ConvertFrom-Json
Write-EnvironmentValues @{ODOO_API_KEY=$result.api_key;ODOO_WEBSITE_ID=$result.website_id;ODOO_PRICELIST_ID=$result.pricelist_id;ODOO_WAREHOUSE_ID=$result.warehouse_id;ODOO_CAMPAIGNS_ENABLED='true'}
# Only public IDs belong in the committed example; credentials remain empty.
$example=[IO.File]::ReadAllText((Join-Path $projectRoot '.env.example'))
foreach($key in 'ODOO_WEBSITE_ID','ODOO_PRICELIST_ID','ODOO_WAREHOUSE_ID') {
    $property=switch($key){'ODOO_WEBSITE_ID'{'website_id'}'ODOO_PRICELIST_ID'{'pricelist_id'}'ODOO_WAREHOUSE_ID'{'warehouse_id'}}
    $example=[regex]::Replace($example,"(?m)^$key=.*$",($key+'='+$result.$property))
}
[IO.File]::WriteAllText((Join-Path $projectRoot '.env.example'),$example,[Text.UTF8Encoding]::new($false))
Invoke-Compose @('up','-d','odoo')
Write-Output "Odoo demo listo: sitio $($result.website_id), tarifa $($result.pricelist_id), almacén $($result.warehouse_id)."
if($Stage -eq 'Seed') { return }

Invoke-Compose @('up','-d','--build','lm-core')
$apiReady=$false
for($attempt=0;$attempt -lt 60;$attempt++) {
    try {
        $catalog=Invoke-RestMethod -Uri http://localhost:8080/graphql -Method Post -ContentType application/json -Body '{"query":"{catalog{name items{id}} campaigns{id}}"}' -TimeoutSec 15
        if(!$catalog.errors -and $catalog.data.catalog.items.Count -gt 0) { $apiReady=$true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if(!$apiReady) { throw 'lm-core no pudo consultar el catálogo real de Odoo. Revisa docker compose logs lm-core odoo.' }
$env:CATALOG_BUILD_API_URL='http://localhost:8080/graphql'
$env:PUBLIC_SITE_URL='http://localhost:8088'
& npm run build:storefront
if($LASTEXITCODE -ne 0) { throw 'Falló el prerenderizado contra Odoo; no se publica el escaparate.' }
Invoke-Compose @('up','-d','--build','--no-deps','lm-storefront')
Write-Output 'Demo lista: Lumio http://localhost:8088 · Odoo http://localhost:8069. Acceso administrativo en .env local.'
