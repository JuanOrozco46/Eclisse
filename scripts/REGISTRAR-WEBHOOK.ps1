# =====================================================
# REGISTRAR WEBHOOK EN EVOLUTION API
# Ejecutar este script DESPUES de configurar variables de entorno
# =====================================================

$VERCEL_PROJECT_URL = if ($env:VERCEL_PROJECT_URL) { $env:VERCEL_PROJECT_URL } else { "https://eclisse.vercel.app" }
$EVOLUTION_API_URL  = if ($env:EVOLUTION_API_URL) { $env:EVOLUTION_API_URL } else { Read-Host "Ingresa EVOLUTION_API_URL (ej: https://tu-evolution.com)" }
$EVOLUTION_API_KEY  = if ($env:EVOLUTION_API_KEY) { $env:EVOLUTION_API_KEY } else { Read-Host "Ingresa EVOLUTION_API_KEY" }
$WEBHOOK_SECRET     = if ($env:WEBHOOK_SECRET) { $env:WEBHOOK_SECRET } else { Read-Host "Ingresa WEBHOOK_SECRET (debe coincidir con Vercel)" }

if (-not $EVOLUTION_API_KEY -or -not $WEBHOOK_SECRET) {
    Write-Error "EVOLUTION_API_KEY y WEBHOOK_SECRET son obligatorios."
    exit 1
}

$headers = @{
    "Content-Type" = "application/json"
    "apikey" = $EVOLUTION_API_KEY
}

$body = @{
    webhook = @{
        enabled = $true
        url = "$VERCEL_PROJECT_URL/api?secret=$([uri]::EscapeDataString($WEBHOOK_SECRET))"
        headers = @{
            "x-webhook-secret" = $WEBHOOK_SECRET
        }
        webhookByEvents = $false
        webhookBase64 = $false
        events = @("MESSAGES_UPSERT")
    }
} | ConvertTo-Json -Depth 5

Write-Host "Registrando webhook seguro en Evolution API..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "$($EVOLUTION_API_URL.TrimEnd('/'))/webhook/set/ECLISSE_WA_01" `
        -Method POST `
        -Headers $headers `
        -Body $body

    Write-Host "✅ Webhook registrado exitosamente con WEBHOOK_SECRET!" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}
