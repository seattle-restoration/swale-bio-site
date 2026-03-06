param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [Parameter(Mandatory = $true)]
    [string]$ApiSecret,

    [string]$Domain = "swale.bio",
    [int]$Ttl = 600
)

$ErrorActionPreference = "Stop"

$headers = @{
    Authorization = "sso-key $ApiKey`:$ApiSecret"
    Accept        = "application/json"
    "Content-Type" = "application/json"
}

function Set-GoDaddyRecord {
    param(
        [string]$DomainName,
        [string]$Type,
        [string]$Name,
        [array]$Body
    )

    $uri = "https://api.godaddy.com/v1/domains/$DomainName/records/$Type/$Name"
    $json = $Body | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $json | Out-Null
}

$apexA = @(
    @{ data = "185.199.108.153"; ttl = $Ttl },
    @{ data = "185.199.109.153"; ttl = $Ttl },
    @{ data = "185.199.110.153"; ttl = $Ttl },
    @{ data = "185.199.111.153"; ttl = $Ttl }
)

$wwwCname = @(
    @{ data = "jackwalsh24.github.io"; ttl = $Ttl }
)

Write-Host "Updating A @ records for $Domain ..."
Set-GoDaddyRecord -DomainName $Domain -Type "A" -Name "@" -Body $apexA

Write-Host "Updating CNAME www record for $Domain ..."
Set-GoDaddyRecord -DomainName $Domain -Type "CNAME" -Name "www" -Body $wwwCname

Write-Host "Done. DNS records submitted."
