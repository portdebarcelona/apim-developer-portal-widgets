[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri] $SpaUrl,

    [Parameter(Mandatory)]
    [uri] $BffUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-HttpsBaseUrl {
    param([uri] $Uri, [string] $Name)

    if (-not $Uri.IsAbsoluteUri -or $Uri.Scheme -ne 'https') {
        throw "$Name must be an absolute HTTPS URL."
    }

    if ($Uri.Query -or $Uri.Fragment) {
        throw "$Name must not contain a query string or fragment."
    }
}

function Join-DeploymentUri {
    param([uri] $BaseUri, [string] $Path)

    $authority = $BaseUri.GetLeftPart([System.UriPartial]::Authority)
    return [uri]::new("$authority$Path")
}

function Invoke-DeploymentRequest {
    param(
        [uri] $Uri,
        [string] $Method = 'GET',
        [hashtable] $Headers = @{}
    )

    return Invoke-WebRequest `
        -Uri $Uri `
        -Method $Method `
        -Headers $Headers `
        -MaximumRedirection 0 `
        -SkipHttpErrorCheck `
        -TimeoutSec 30
}

function Get-HeaderValue {
    param($Response, [string] $Name)

    $values = $Response.Headers[$Name]
    if ($null -eq $values) { return '' }
    return [string]::Join(', ', [string[]] $values)
}

function Assert-Status {
    param($Response, [int[]] $Expected, [string] $Message)

    if ([int] $Response.StatusCode -notin $Expected) {
        throw "$Message Expected $($Expected -join '/') but received $([int] $Response.StatusCode)."
    }
}

function Assert-SecurityHeaders {
    param($Response, [string] $Target)

    $csp = Get-HeaderValue $Response 'Content-Security-Policy'
    if (-not $csp -or $csp -notmatch "frame-ancestors\s+'none'") {
        throw "$Target is missing a restrictive Content-Security-Policy frame-ancestors directive."
    }
    if ((Get-HeaderValue $Response 'X-Content-Type-Options') -ne 'nosniff') {
        throw "$Target is missing X-Content-Type-Options: nosniff."
    }
    if (-not (Get-HeaderValue $Response 'Referrer-Policy')) {
        throw "$Target is missing Referrer-Policy."
    }
    if (-not (Get-HeaderValue $Response 'Permissions-Policy')) {
        throw "$Target is missing Permissions-Policy."
    }
    if (-not (Get-HeaderValue $Response 'Strict-Transport-Security')) {
        throw "$Target is missing Strict-Transport-Security."
    }
}

function Invoke-Check {
    param([string] $Name, [scriptblock] $Check)

    try {
        & $Check
        Write-Host "PASS  $Name" -ForegroundColor Green
    }
    catch {
        $failures.Add("${Name}: $($_.Exception.Message)")
        Write-Host "FAIL  $Name" -ForegroundColor Red
        Write-Host "      $($_.Exception.Message)" -ForegroundColor Red
    }
}

Assert-HttpsBaseUrl $SpaUrl 'SpaUrl'
Assert-HttpsBaseUrl $BffUrl 'BffUrl'

$spaOrigin = $SpaUrl.GetLeftPart([System.UriPartial]::Authority)
$spaRootUri = Join-DeploymentUri $SpaUrl '/'
$bffHealthUri = Join-DeploymentUri $BffUrl '/healthz'
$bffCatalogUri = Join-DeploymentUri $BffUrl '/api/catalog/apis'

Invoke-Check 'SPA root and security headers' {
    $response = Invoke-DeploymentRequest $spaRootUri
    Assert-Status $response @(200) 'SPA root failed.'
    if ($response.Content -notmatch 'id=["'']app["'']') {
        throw 'SPA root did not return the Vue application shell.'
    }
    Assert-SecurityHeaders $response 'SPA'
    if ((Get-HeaderValue $response 'Content-Security-Policy') -match '__BFF_CONNECT_SOURCE__') {
        throw 'SPA CSP contains an unresolved BFF placeholder.'
    }
}

Invoke-Check 'BFF health and security headers' {
    $response = Invoke-DeploymentRequest $bffHealthUri
    Assert-Status $response @(200) 'BFF health check failed.'
    Assert-SecurityHeaders $response 'BFF'
    if ($response.Content -match '(?i)(developer exception|stack trace|ASPNETCORE_ENVIRONMENT|AUTHENTICATION_MODE)') {
        throw 'BFF health response exposes development or configuration details.'
    }
}

Invoke-Check 'Physical Swagger OAuth callback assets' {
    $html = Invoke-DeploymentRequest (Join-DeploymentUri $SpaUrl '/oauth2/swagger-callback.html')
    Assert-Status $html @(200) 'Swagger callback HTML was not found.'
    if ($html.Content -match 'id=["'']app["'']' -or $html.Content -notmatch 'swagger-callback\.js') {
        throw 'Swagger callback HTML was rewritten to the SPA shell or is malformed.'
    }

    $script = Invoke-DeploymentRequest (Join-DeploymentUri $SpaUrl '/oauth2/swagger-callback.js')
    Assert-Status $script @(200) 'Swagger callback JavaScript was not found.'
    if ($script.Content -notmatch 'swaggerUIRedirectOauth2') {
        throw 'Swagger callback JavaScript does not contain the expected OAuth callback implementation.'
    }
}

Invoke-Check 'Vue Router history fallback' {
    $response = Invoke-DeploymentRequest (Join-DeploymentUri $SpaUrl '/api/phase4-history-check/scalar?version=v1')
    Assert-Status $response @(200) 'SPA history route failed.'
    if ($response.Content -notmatch 'id=["'']app["'']') {
        throw 'History route did not return the Vue application shell.'
    }
}

Invoke-Check 'BFF allows the configured SPA origin' {
    $response = Invoke-DeploymentRequest $bffCatalogUri 'OPTIONS' @{
        Origin = $spaOrigin
        'Access-Control-Request-Method' = 'GET'
        'Access-Control-Request-Headers' = 'authorization'
    }
    Assert-Status $response @(200, 204) 'Expected CORS preflight to succeed.'
    $allowedOrigin = Get-HeaderValue $response 'Access-Control-Allow-Origin'
    if ($allowedOrigin -ne $spaOrigin) {
        throw "Expected Access-Control-Allow-Origin '$spaOrigin' but received '$allowedOrigin'."
    }
}

Invoke-Check 'BFF rejects an arbitrary CORS origin' {
    $arbitraryOrigin = 'https://not-authorized.invalid'
    $response = Invoke-DeploymentRequest $bffCatalogUri 'OPTIONS' @{
        Origin = $arbitraryOrigin
        'Access-Control-Request-Method' = 'GET'
        'Access-Control-Request-Headers' = 'authorization'
    }
    $allowedOrigin = Get-HeaderValue $response 'Access-Control-Allow-Origin'
    if ($allowedOrigin -eq '*' -or $allowedOrigin -eq $arbitraryOrigin) {
        throw "BFF accepted arbitrary CORS origin '$arbitraryOrigin'."
    }
}

Invoke-Check 'BFF APIs fail closed without credentials' {
    $response = Invoke-DeploymentRequest $bffCatalogUri
    Assert-Status $response @(401) 'Unauthenticated catalog request did not fail closed.'
    $combined = "$($response.Content) $((Get-HeaderValue $response 'Server'))"
    if ($combined -match '(?i)(developer exception|stack trace|System\.[A-Za-z]+Exception|Development)') {
        throw 'Unauthenticated response exposes debug or development details.'
    }
}

if ($failures.Count -gt 0) {
    Write-Host "`nDeployment validation failed ($($failures.Count) check(s)):" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`nDeployment validation passed." -ForegroundColor Green
