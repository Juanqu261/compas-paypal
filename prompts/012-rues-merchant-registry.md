# 011 — RUES merchant registry seed

Tool: Claude Code (Claude Opus 5.5), 2026-10-16.

These are the verbatim user prompt and the meeting summary the user pasted with it. The user also attached `@data/`.

## 1

```text
Soy alejandro, nesecito buscar datos de Cámara de Comercio y armar mini base de datos para la demo
¿me puedes ayudar?
```

Pasted meeting summary:

```text
# Estado Actual del Flujo Open Payments + Compass

- App actúa como orquestador entre pagador (Pedro) y tienda, usando cuentas Interledger (test wallets)
- Flujo: resuelve URLs de ambos lados → crea cotización → solicita autorizaciones → ejecuta pago
- Compass agrega una capa de validación de categoría antes del pago final
  - Si la categoría de la tienda hace match con el propósito de la compra: pago aprobado
  - Si no hace match: pago denegado, plata no se mueve

# Smoke Tests Ejecutados

- Prueba 1 (farmacia): categoría “medicación” hizo match, pago de 10 pesos aprobado y recibido
- Prueba 2 (licorera): categoría no cumplió el mandato, pago denegado correctamente
- Registro queda en la app: Pedro puede ver en qué se gastó la plata aunque no haya intervenido
- Datos de tiendas y categorías actualmente quemados en data/fixtures y seeds/category_mappings

# Lo Que Falta: El “Cerebro” de Categorías

- Falta construir la matriz de confianza por categoría por tienda
  - Modelo determinístico: si muchos pagos de “medicina” pasaron por una tienda, su confianza en esa categoría sube
  - Se cruza data histórica de transacciones con datos externos (ej. Cámara de Comercio)
  - Si supera un threshold de confianza, el pago se aprueba
- Para tiendas nuevas sin historial: modo abierto (deja pasar cualquier pago) como fallback
- Falta también: base de datos real de tiendas con sus categorías (actualmente todo es data quemada)
- Posible fuente: Cámara de Comercio (actividad económica registrada por tienda)
  - No se necesitan 10M de filas, con ~2,000 registros alcanza para la demo

# Setup Local y Próximos Pasos de Integración

- Setup completado: cuenta Compass (orquestador), wallet address, API key, private key en backend, .env configurado
- Cuentas de prueba: una en euros (pagador), una en pesos (tiendita), una Compass (SAR, solo orquesta)
- Merge de rama open-payments del backend con main del frontend en curso; conflictos menores resueltos
- División de trabajo acordada:
  - Alejandro: buscar datos de Cámara de Comercio y armar mini base de datos para la demo
  - El otro: construir la matriz de confianza en rama separada
- Pendiente: servir el backend como servicio, integrar frontend con Open Payments, limpiar archivos de prompts viejos del repo

# Próximos Pasos

- **Buscar datos de Cámara de Comercio para base de datos de tiendas** (Alejandro)
- **Construir la matriz de confianza de categorías**
- **Avisar cuando el merge esté listo para crear nueva rama** (Alejandro)
```

## 2

After the trust-matrix branch was merged:

```text
ADR 0005 esta desactualizado, hize merge desde la rama trust-matrix, mira docs/adr/0007-merchant-confidence-matrix.md
```

## 3

```text
tambien 0005 fue actualizado
```
