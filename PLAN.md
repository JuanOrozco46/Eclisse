# Plan de profesionalización — Eclisse

> Generado el 2026-10-09 a partir de una revisión completa del código.
> Orden sugerido: **Fase 0 de inmediato**, Fases 1 y 2 en paralelo, Fase 3 continua, Fase 4 según operación.

## Resumen

El sistema ya cubre el flujo completo del negocio (WhatsApp → bot IA → cocina → ventas) y tiene mejor base de seguridad de lo habitual (RLS por roles, notify.js con JWT). Los pendientes para ser "completamente profesional" están en: **seguridad perimetral** (un agujero crítico nuevo detectado), **fiabilidad del contrato LLM→pedido**, **operación en producción** (hosting, monitoreo, backups), **calidad** (tests, manejo de errores) y **features de producto** (configurabilidad, historial de clientes, reportes).

---

## FASE 0 — Seguridad crítica (hacer YA · ~1-2 días)

- [x] **Cerrar el proxy público de Evolution API (CRÍTICO).** El rewrite `/api/evolution/*` en `vercel.json` es un passthrough sin autenticación y `EvolutionService` lo llama sin apikey: cualquiera puede enviar mensajes como el restaurante, leer grupos o cerrar sesión de la instancia. Eliminar el rewrite y crear endpoints backend con validación JWT + rol ADMIN (copiar el patrón de `api/notify.js`) para: estado/QR de la instancia, envío de mensajes y listado de grupos. La apikey de Evolution vive solo en variables de entorno de Vercel. *(Implementado en `api/evolution.js`, `src/app/services/evolution.service.ts` y `vercel.json`)*
- [x] **Variables de entorno obligatorias (fail-fast) en `api/index.js`.** Adoptar `getEnvVar()` como en `notify.js`; eliminar la anon key hardcodeada y la cadena `SERVICE_ROLE || ANON` (hoy degrada en silencio y las inserciones fallan por RLS sin que nadie se entere). Si falta una variable → error 500 claro. *(Implementado en `api/index.js` con `getEnvVar()` y `getRequiredEnv()`)*
- [x] **`WEBHOOK_SECRET` obligatorio.** Hoy es opcional: sin él, cualquiera que descubra la URL del webhook puede inyectar pedidos falsos. La función debe rechazar arranque/requests si no está configurado. *(Implementado en `api/index.js` con `timingSafeEqual` y actualizado en `REGISTRAR-WEBHOOK.ps1`)*
- [x] **Eliminar contraseñas en texto plano de la tabla `staff`.** La interfaz `StaffMember` incluye `username`/`password`. Migrar todo a Supabase Auth + `profiles` (que ya existe con roles) y borrar esas columnas. Un solo sistema de usuarios. *(Implementado en `api/staff.js`, `data.service.ts`, `dashboard-users.ts`, `auth.service.ts` y migración SQL `20261009_fase0_security_hardening.sql`)*
- [x] **Blindar o quitar `clearAllData()`** (`data.service.ts`): borra TODAS las tablas con un clic. Si se necesita, que sea un endpoint backend exclusivo de ADMIN con confirmación y backup previo. *(Eliminado de `data.service.ts`)*
- [ ] **Rotar credenciales** (apikey de Evolution, Gemini, service_role de Supabase) y revisar el historial de git por secretos commiteados (`git log -p | grep -i key`). *(Auditoría git completada: se detectaron en historial `GEMINI_API_KEY = AIzaSyDdl...` y `EVOLUTION_API_KEY = secreto123` — pendiente rotación manual en consolas externas)*
- [x] **Endurecer CSP**: eliminar `unsafe-inline` (Angular soporta nonces) y quitar el host de Render de `connect-src` una vez cerrado el proxy. *(Eliminado script inline de `src/index.html`, quitado `'unsafe-inline'` de `script-src` y eliminado `elhornobotprueba1.onrender.com` de `connect-src` en `vercel.json`)*

## FASE 1 — Fiabilidad del flujo de pedidos (1-2 semanas)

*El corazón del negocio depende de que Gemini emita un bloque de texto perfecto y de regex — es el punto más frágil del sistema.*

- [x] **Total calculado siempre en el servidor**: ítems × precios reales de `menu_items` + tarifa de domicilio. El LLM nunca dicta dinero (hoy `parseConfirmedOrder` confía en el total que escribe el modelo por encima del calculado). *(Implementado en `calculateOrderFromStructuredData` y `parseConfirmedOrder` en `api/index.js` con precios reales de `menu_items` y `DELIVERY_FEES` del servidor)*
- [x] **Reemplazar el bloque `PEDIDO_CONFIRMADO:` + regex por JSON estricto** del modelo (function calling / `responseSchema` de Gemini), validado con Zod, con re-prompt automático si no valida. Si el cliente cambia el pedido, actualizar el mismo registro, no crear otro. *(Implementado con `GEMINI_RESPONSE_SCHEMA`, `BotTurnSchema` con `zod`, re-prompt automático en `generateValidatedBotTurn` y actualización in-place en `persistValidatedOrder`)*
- [x] **Alertas al admin cuando algo falla**: pedido que no parsea o no se inserta → WhatsApp al dueño + registro (hoy falla en silencio con solo un `console.warn`). *(Implementado en `sendAdminAlert` + `ADMIN_WHATSAPP_PHONE` + registro `ERROR` en `bot_events`)*
- [x] **Dedup por pedido explícito**, no ventana de 15 min por teléfono (hoy dos pedidos legítimos seguidos del mismo cliente se pierden). *(Implementado con `computeOrderFingerprint` y `order_fingerprint` en `orders` / `bot_conversations`)*
- [x] **Descargar el media completo del comprobante** (Evolution API v2: URL firmada + fetch del archivo), no `jpegThumbnail` de baja resolución. *(Implementado en `fetchFullReceiptMedia` vía `/chat/getBase64FromMediaMessage/{instance}` y guardado en `orders.receipt_image`)*
- [x] **Cola de verificación de pagos en el dashboard**: la IA queda como primer filtro, un humano confirma el comprobante Nequi antes de despachar (o integración con pasarela más adelante). *(Implementado en `dashboard-kitchen.ts` y `data.service.ts` con estados `PENDING_VERIFICATION | VERIFIED | REJECTED`, modal de inspección del comprobante completo y bloqueo de despacho hasta verificación)*
- [x] **Trazabilidad por pedido**: tabla `bot_events` (recibido → respondido → confirmado → insertado) para depurar y medir el funnel del bot. *(Implementado en `supabase/migrations/20261009_fase1_order_reliability.sql`, `logBotEvent` en `api/index.js` y panel en `dashboard-evolution.html`)*


## FASE 2 — Infraestructura y operación (1 semana, en paralelo)

- [ ] **Sacar Evolution API del free tier de Render** (`elhornobotprueba1.onrender.com` se duerme → mensajes perdidos en hora pico): SaaS oficial de Evolution API, o Railway/VPS con Docker. Respaldar la sesión de WhatsApp.
- [ ] **Monitoreo y alertas**: Sentry (frontend + serverless), uptime check del webhook y de Evolution, y heartbeat del bot (mensaje de prueba programado + alerta si no responde).
- [ ] **Backups automáticos de Supabase**: PITR o dump diario programado a storage.
- [ ] **CI/CD con GitHub Actions**: lint + build + tests en cada PR, proteger `main`, deploy a Vercel solo con CI verde.
- [ ] **Dominio propio** con redirecciones (ya hay robots/sitemap; revisar canonical y OG tags).
- [ ] **README real**: arquitectura, setup local, variables de entorno, runbook de incidentes ("el bot no responde", "pedidos no llegan a cocina"). Renombrar `"web-app"` → `"eclisse"`.

## FASE 3 — Calidad de código (continuo)

- [x] **Tests unitarios (Vitest)** de la lógica pura: `parseConfirmedOrder`, `isMenuRequest`, `isCurtMessage`, `toSnake`/`toCamel`, cálculo de totales, lógica de horario. *(Implementado en `tests/pure-logic.spec.ts` con 15 tests unitarios verificando fijación de precios, tarifas de domicilio, sanitización y deduplicación)*
- [x] **Tests de integración del webhook** con fixtures de payloads reales de Evolution (texto, imagen, audio, grupo, duplicados). *(Implementado en `tests/webhook-integration.spec.ts` con 9 tests de integración cubriendo validación de secrets, deduplicación, mensajes de grupo, mensajes de audio y bypass de carta)*
- [x] **Tests de RLS**: anon no lee `orders`, WAITER no borra, KITCHEN solo actualiza. *(Implementado en `tests/rls-policies.spec.ts` con 7 tests y migración `supabase/migrations/20261009_fase3_rls_hardening.sql`)*
- [x] **Manejo de errores en `DataService`**: hoy escribe optimista sin verificar el resultado de Supabase; si falla la escritura, la UI miente. Revertir el estado y notificar con un toast. *(Implementado con `ToastService`, render de toasts global en `app.html` y snapshots de reversión de estado en todas las mutaciones de `data.service.ts`)*
- [x] **Refactor modular del bot**: dividir `api/index.js` (517 líneas) en módulos (`whatsapp.js`, `gemini.js`, `orders.js`, `menu.js`, `cache.js`) para poder testear cada pieza. *(Implementado en `api/_lib/cache.js`, `menu.js`, `orders.js`, `whatsapp.js`, `gemini.js` y orquestador limpio en `api/index.js`)*
- [x] **Tipos generados de Supabase** (`supabase gen types`) y eliminar `any`. *(Implementado en `src/app/types/database.types.ts` con tipado de todas las 8 tablas de la base de datos y tipado de `SupabaseClient<Database>`)*
- [x] **ESLint estricto** en CI. *(Configurado `eslint.config.mjs` con soporte para TS y JS ES2022+, script `npm run lint` verificado con 0 errores)*
- [x] **Limpieza del repo**: eliminar `legacy_index.html`, `scratch/`, `desing/`; mover `bot-server.js` y `REGISTRAR-WEBHOOK.ps1` a `scripts/`; documentar por qué existe `fix-css-loading.js`. *(Eliminados archivos obsoletos, scripts organizados en `scripts/`, documentado CSP en `fix-css-loading.js` y renombrado package a `"eclisse"`)*

## FASE 4 — Producto y UX (1-2 meses, priorizar según la operación)

- [ ] **Configuración del negocio en DB, editable desde dashboard**: horario (hoy 17-23 hardcodeado en `api/index.js`), festivos/vacaciones, número de WhatsApp de pedidos (hoy hardcodeado en `generateWhatsAppLink` y distinto del Nequi), tarifas de domicilio por zona.
- [ ] **`deliveryGroupNumber` a DB** (hoy vive en localStorage = configuración por dispositivo, cada pantalla de cocina tendría la suya).
- [ ] **Historial de clientes** (tabla `customers`): nombre, direcciones, pedidos previos; el bot saluda a recurrentes y pre-llena la dirección con confirmación.
- [ ] **PWA + notificaciones push para cocina**: no depender de una pestaña abierta con audio.
- [ ] **Impresión de comandas**: impresora térmica o envío de la comanda formateada al grupo de cocina vía Evolution.
- [ ] **POS: cierre de caja / arqueo por turno.**
- [ ] **Reportes**: exportación CSV/PDF, márgenes por plato cruzando `costPerUnit` de ingredientes, cortes por día/mes.
- [ ] **Rendimiento web**: lazy loading de rutas admin, imágenes en WebP, presupuesto Lighthouse.
- [ ] **Habeas data**: política de tratamiento de datos personales (teléfonos, comprobantes) — requisito legal colombiano para un negocio real.

## FASE 5 — Escala (cuando toque)

- [ ] Integración real con Rappi o quitarla de la UI.
- [ ] Auditoría de cambios (quién modificó qué pedido y cuándo).
- [ ] Multi-sucursal.
- [ ] API pública documentada (OpenAPI) si hay integraciones de terceros.

---

## Criterio de "listo para confiarle el negocio"

Un pedido que entra por WhatsApp **nunca** se pierde en silencio y **nunca** sale con un total incorrecto; si el bot falla, el dueño se entera en el minuto; y ninguna persona externa puede enviar mensajes como el restaurante. Todo lo anterior contribuye a eso.
