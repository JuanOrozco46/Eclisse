# =====================================================
# REGISTRAR WEBHOOK EN EVOLUTION API
# Ejecutar este script DESPUES de que Render despliegue el bot-server
# =====================================================

# Reemplaza esta URL con tu dominio real de Vercel (por ejemplo: https://mi-proyecto.vercel.app)
$VERCEL_PROJECT_URL = "https://eclisse-eta.vercel.app"

$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "secreto123"
}

$body = @{
    webhook = @{
        enabled = $true
        url = "$VERCEL_PROJECT_URL/api"
        webhookByEvents = $false
        webhookBase64 = $false
        events = @("MESSAGES_UPSERT")
    }
} | ConvertTo-Json -Depth 5

Write-Host "Registrando webhook en Evolution API..." -ForegroundColor Cyan
Write-Host "URL del webhook (Vercel): $VERCEL_PROJECT_URL/api" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod `
        -Uri "https://elhornobotprueba1.onrender.com/webhook/set/ECLISSE_WA_01" `
        -Method POST `
        -Headers $headers `
        -Body $body

    Write-Host "✅ Webhook registrado exitosamente!" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}
