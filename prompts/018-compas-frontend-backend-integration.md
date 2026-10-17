# 018 — Frontend and backend integration on the updated main

Tool: Claude Code (Claude Opus 5.5), 2026-10-17.

The verbatim user prompt for the session that connected the ARQ, Nequi and Nequi Negocios simulations to the backend on branch `feature/compas-frontend-backend-integration`. Earlier prompts in the same session only asked for read-only connection checks against Supabase and changed no file, so they are not logged here. The fence uses four backticks because the prompt contains code blocks.

## 1

````text
# COMPAS — Integración definitiva de frontend y backend sobre el main actualizado

## ROL

Actúa como Senior Full-Stack Engineer y Software Architect, especializado en:

- Next.js 16, React 19 y TypeScript.
- Node.js y APIs HTTP.
- PostgreSQL y Supabase.
- Interledger Open Payments y grants GNAP.
- Arquitecturas hexagonales, seguridad de pagos y testing.
- Integración de sistemas existentes sin regresiones.

Trabaja autónomamente en **Auto Mode**, siguiendo los scopes y restricciones de este prompt.

**Objetivo principal:** terminar, corregir y ampliar la conexión frontend ↔ backend de COMPAS, aprovechando los desarrollos del equipo incorporados recientemente a `main`, sin rehacer funcionalidades ya implementadas.

No te limites a describir qué falta. Inspecciona, implementa, prueba y entrega código funcional dentro de los límites autorizados.

---

# CONTEXTO DEL PROYECTO

Repositorio:

https://github.com/ybedoyab/compas

Carpeta local de trabajo:

`C:\Users\Usuario\Documents\HACKATHONS\Interledger OpenPayments 2026\compas-integration`

Estado remoto conocido al preparar esta solicitud:

- `origin/main`: `09af6ec`
- Último commit de los compañeros previo a la integración: `e3f0aea`
- La experiencia COMPAS de Pedro y Andrea ya fue integrada a `main`.
- El backend PostgreSQL y Open Payments ya existían antes de nuestro merge.
- El usuario trabaja en `compas-integration`, inicialmente sobre `integration/compas-experience`.

Estos valores son referencias históricas: verifica el estado actual de Git antes de empezar.

## Estado técnico comprobado

El backend local ya pudo conectarse correctamente a Supabase PostgreSQL.

Las pruebas anteriores confirmaron:

- Autenticación como `compas_api`.
- Acceso real al esquema `compas`.
- PostgreSQL 17.
- Las siete tablas consultadas tienen permisos de lectura.
- Se encontraron 12 mandatos de demostración.
- `/merchants/categories` pasó de responder 500 a responder 200.

Por tanto, **la conexión a Supabase ya funciona. No debes reconstruirla ni migrar el backend a supabase-js**.

La base Supabase compartida corresponde al proyecto COMPAS y está marcada como PRODUCTION en el dashboard.

Esto exige precauciones estrictas: no ejecutes escrituras de prueba, migraciones, seeds ni operaciones destructivas contra esa base.

## Escenario de negocio

COMPAS permite delegar permiso de gasto sin transferir fondos al delegado.

- **Pedro**, desde ARQ, crea un presupuesto de USD 40 destinado a medicamentos para su madre Gladys.
- **Andrea**, desde Nequi, recibe autorización para utilizar ese presupuesto.
- **Gladys** es la beneficiaria.
- **Droguería Central**, desde Nequi Negocios, acepta pagos COMPAS y presenta el cobro.
- COMPAS verifica mandato, vigencia, presupuesto, categoría, confianza del comercio y demás reglas.
- Solo si la decisión del backend es `ALLOW` puede ejecutarse un outgoing payment autorizado mediante Open Payments.
- El dinero sale de la billetera de Pedro hacia la billetera del comercio.
- Andrea no recibe ni custodia esos fondos.

Las tres interfaces de ARQ, Nequi y Nequi Negocios son simulaciones visuales. No son integraciones bancarias oficiales.

---

# SCOPE 0 — SEGURIDAD GIT Y REGLAS DEL REPOSITORIO

Antes de modificar código:

1. Inspecciona `git status`, `git worktree list`, `git branch -vv`, `git remote -v` y los commits recientes.
2. Ejecuta `git fetch origin --prune`.
3. Comprueba la relación de la rama de trabajo con `origin/main`.
4. Determina si existen cambios sin confirmar, archivos ignorados o una operación Git pendiente.
5. No hagas reset, clean, stash, checkout destructivo ni sobrescribas trabajo local.

Crea una rama nueva desde la versión remota actualizada:

`feature/compas-frontend-backend-integration`

Si ya existe, utiliza un nombre incremental seguro. No sobrescribas ninguna rama.

Si hay modificaciones locales sin confirmar, protégelas primero y evita cualquier operación que pueda perderlas.

Puedes continuar en el worktree `compas-integration` si resulta seguro. No modifiques el worktree original `compas` ni las ramas activas de los compañeros.

**No hagas push, merge a main, rebase de ramas compartidas ni force-push. No publiques cambios automáticamente.**

No generes commits salvo que sean necesarios para preservar una operación técnica que hayas justificado; como regla general, deja los cambios preparados para mi revisión.

## Reglas obligatorias

Lee antes de desarrollar:

- `AGENTS.md`
- `CLAUDE.md`
- `.AGENTS/product.md`
- `.AGENTS/architecture.md`
- `.AGENTS/development.md`
- `.AGENTS/open-payments.md`
- `.AGENTS/hackathon.md`
- `.skills/compas-context/SKILL.md`
- `.skills/hackathon-ai-rules/SKILL.md`
- `.skills/frontend-design/SKILL.md`
- `docs/01-demo-story.md`
- `docs/03-architecture.md`
- `docs/04-open-payments-mapping.md`
- `docs/05-policy-engine.md`
- `docs/07-security-privacy-ethics.md`

Lee los archivos existentes, sin asumir que todos están presentes.

Conserva las reglas del producto y de divulgación del uso de IA. Registra el prompt real y los cambios de IA conforme a `prompts/` y `AI_USAGE.md`, sin incorporar información confidencial.

---

# SCOPE 1 — AUDITORÍA COMPLETA DE LA INTEGRACIÓN EXISTENTE

Antes de implementar, reconstruye el flujo real entre las tres interfaces y el backend.

## 1.1 Frontend

Inspecciona especialmente:

`frontend/src/features/compas/`

Y sus componentes:

- `api/client.ts`
- `api/contracts.ts`
- `api/hooks.ts`
- `payer/PayerCompas.tsx`
- `payer/PayerHome.tsx`
- `payer/CreateBudgetWizard.tsx`
- `payer/PayerMandateDetail.tsx`
- `payer/MandateHistory.tsx`
- `delegate/DelegateCompas.tsx`
- `demo-identities.ts`

Inspecciona también:

- `features/arq/ArqCompasShell.tsx`
- `features/arq/ArqExperience.tsx`
- `features/nequi/NequiCompasShell.tsx`
- `features/nequi/NequiExperience.tsx`
- `features/nequi-business/NequiBusinessCompas.tsx`
- `features/nequi-business/NequiBusinessExperience.tsx`
- `features/nequi-business/nequi-business-compas-demo.ts`
- `features/demo/DemoSession.tsx`
- `features/demo/DemoStage.tsx`
- `frontend/next.config.ts`

Verifica las rutas:

- `/demo`
- `/arq`
- `/nequi`
- `/nequi-negocios`

Comprueba que todos los botones COMPAS abren la experiencia correcta, conservan la navegación y utilizan el backend cuando corresponde.

## 1.2 Backend

Inspecciona:

- `backend/src/api/server.ts`
- `backend/src/api/mandates.ts`
- `backend/src/api/merchant-categories.ts`
- `backend/src/api/open-payments-finish.ts`
- `backend/src/api/spending-confirmations.ts`
- `backend/src/application/mandates.ts`
- `backend/src/application/purchase-under-mandate.ts`
- `backend/src/application/create-outgoing-payment-if-allowed.ts`
- `backend/src/application/resolve-merchant-categories.ts`
- `backend/src/integrations/postgres/`
- `backend/src/integrations/open-payments/`
- `backend/src/integrations/merchant-registry/`
- `backend/src/integrations/merchant-history/`

Inspecciona los contratos:

- `contracts/mandates/README.md`
- `contracts/open-payments/README.md`
- `contracts/purchases/README.md`
- `contracts/merchant-categories/README.md`
- `contracts/merchant-history/README.md`

Determina cuáles endpoints existen realmente y cuáles son únicamente propuestas.

## 1.3 Matriz de diagnóstico

Construye internamente una matriz que relacione:

Pantalla → interacción → cliente HTTP → endpoint → caso de uso → repositorio → tabla PostgreSQL → respuesta → estado de UI.

Para cada interacción, determina si está:

- Implementada y conectada.
- Implementada, pero incompleta.
- Simulada localmente.
- Sin endpoint.
- Bloqueada por una condición legítima.
- Incorrectamente conectada.
- Pendiente de autorización externa.

No confundas una operación que responde 200 con una operación de negocio terminada.

Utiliza la auditoría para decidir exactamente qué cambios son necesarios. No reescribas módulos que ya funcionan.

---

# SCOPE 2 — COMPLETAR ARQ / PEDRO

Objetivo: que la experiencia de Pedro sea coherente, funcional y respaldada por el backend.

Revisa y corrige las siguientes operaciones:

## 2.1 Pantalla principal COMPAS

Al pulsar COMPAS en ARQ, Pedro debe poder:

- Ver sus presupuestos.
- Distinguir activos, pendientes, agotados, vencidos y revocados.
- Consultar la capacidad autorizada restante.
- Identificar quién está autorizado a pagar y quién es el beneficiario.
- Abrir detalles e historial.
- Crear un nuevo presupuesto.

Toda la información de negocio debe provenir del backend. No mantengas copias independientes de los mandatos como fuente de verdad.

## 2.2 Creación de presupuesto

Conserva el asistente existente, pero verifica completamente:

- Delegado y beneficiario.
- Categorías permitidas.
- Importe y moneda.
- Fecha de inicio y vencimiento.
- Modo `ENFORCED` o `MONITORED`.
- Confianza comercial mínima.
- Límite para comercios de confianza inferior a HIGH.
- Validaciones y errores por campo.

El frontend puede hacer validaciones para mejorar la experiencia, pero **el backend tiene la última palabra**.

Especialmente importante:

El código utiliza una moneda de respaldo cuando no logra consultar la billetera de Pedro. Verifica que esto no produzca autorizaciones engañosas.

La billetera de prueba podría tener una moneda diferente de USD. No inventes tipos de cambio, saldos ni equivalencias.

Si no se conoce la moneda real, muestra una advertencia clara y respeta el comportamiento seguro del backend.

## 2.3 Creación frente a autorización

Distingue correctamente:

- Crear mandato `DRAFT`.
- Iniciar autorización `PENDING_AUTHORIZATION`.
- Recibir consentimiento confirmado.
- Mostrar mandato `ACTIVE`.
- Revocar o consultar el historial.

Cuando `COMPAS_DEMO_PAYER_GRANTS=disabled`, debe seguir siendo posible gestionar borradores si el backend lo permite.

No presentes un borrador como una autorización activa.

Muestra la razón real de los errores de autorización sin revelar datos financieros sensibles.

## 2.4 Revocación e historial

Verifica:

- Confirmaciones antes de revocar.
- Tratamiento de `grantCancellation=PENDING`.
- Actualización de estados después de la respuesta del backend.
- Historial de movimientos.
- Manejo de compras pendientes, rechazadas y fallidas.
- Reconciliación de capacidad cuando corresponda.

No permitas que las pantallas recalculen arbitrariamente el presupuesto.

---

# SCOPE 3 — COMPLETAR NEQUI / ANDREA

Objetivo: que Andrea pueda consultar correctamente las autorizaciones que Pedro le ha concedido y que su experiencia esté preparada para interactuar con un cobro.

## 3.1 Autorizaciones recibidas

Al abrir COMPAS desde Nequi:

- Consultar mandatos delegados mediante la API.
- Mostrar titular, beneficiario, propósito y capacidad disponible.
- Mostrar vigencia, reglas y confianza requerida.
- Diferenciar mandatos utilizables y no utilizables.
- Permitir abrir los detalles.
- Actualizar estados cuando Pedro revoque o un presupuesto se agote.

Respeta las reglas de visibilidad: Andrea no puede ver borradores no autorizados de Pedro ni modificar sus mandatos.

## 3.2 Sincronización

Comprueba que el frontend gestiona correctamente:

- Cambios entre pantallas.
- Regreso a COMPAS.
- Actualizaciones por polling.
- Respuestas obsoletas.
- Errores de red.
- Sesiones vencidas.
- Datos que cambian después de una revocación.

Revisa especialmente la consistencia entre `useResource`, `useMandateList`, `useMandate` y los componentes que permanecen montados cuando COMPAS está cerrado.

Evita mostrar datos de una sesión o mandato anterior mientras se carga otro.

## 3.3 Preparación del pago

Actualmente la interfaz indica que todavía no se puede pagar porque falta conectar el cobro.

No elimines esta restricción simplemente para habilitar un botón.

Investiga primero qué caso de uso y qué contratos necesita un cobro real.

Implementa la integración segura correspondiente en los scopes posteriores si puede realizarse sin saltar el consentimiento.

---

# SCOPE 4 — NEQUI NEGOCIOS / DROGUERÍA CENTRAL

Objetivo: conectar la experiencia comercial con la lógica de COMPAS.

Actualmente `NequiBusinessCompas.tsx` y `NequiBusinessExperience.tsx` gestionan parte de la configuración únicamente mediante estado local de React.

## 4.1 Estado comercial

Conserva la experiencia visual actual:

- `Conoce más`.
- Opción COMPAS.
- Activar o desactivar el servicio.
- Categorías aceptadas.
- Detalles del establecimiento.
- Estado del servicio.

Pero diferencia claramente:

1. Preferencias locales del comercio.
2. Declaraciones comerciales enviadas a COMPAS.
3. Categorías corroboradas por fuentes de confianza.
4. Elegibilidad efectiva para una compra.

Un comercio **no adquiere categoría verificada simplemente seleccionando una casilla**.

Si el backend todavía no permite guardar la configuración comercial de forma autenticada, conserva un estado local explícitamente etiquetado como demostración y documenta el contrato faltante.

No añadas escritura directa del navegador a las tablas protegidas.

## 4.2 Categorías

Corrige la inconsistencia entre las opciones del frontend y la taxonomía oficial del backend.

Actualmente existe `HEALTH_WELLNESS` en la interfaz comercial, mientras el dominio COMPAS utiliza categorías como:

- `MEDICATION`
- `FOOD`
- `PERSONAL_CARE`
- `ALCOHOL`
- `TOBACCO`

Define una correspondencia de producto coherente con el dominio.

No añadas categorías a PostgreSQL únicamente para hacer que la UI compile.

La categoría comercial debe resolverse mediante el backend y sus evidencias de confianza, no mediante una afirmación unilateral.

## 4.3 Consulta de categorías verificadas

Reutiliza cuando corresponda:

`GET /merchants/categories?walletAddress=...`

El último test confirmó HTTP 200, pero devolvió cero categorías.

Investiga por qué, teniendo en cuenta:

- La billetera comercial utilizada.
- Los registros de confianza existentes.
- El registro de fuentes.
- La configuración `MERCHANT_CATEGORY_DEMO_SEED=false`.
- Los datos ficticios previamente cargados.
- El estado del servicio de categorías.

No modifiques automáticamente la variable del seed ni insertes registros demostrativos en Supabase.

Muestra claramente cuando una categoría está sin corroborar, pendiente o no disponible.

---

# SCOPE 5 — INTEGRACIÓN DEL COBRO Y DEL CHECKOUT

Este scope es importante, pero debe implementarse respetando la arquitectura financiera existente.

## 5.1 Analizar la lógica existente

Inspecciona exhaustivamente:

- `PurchaseIntent`
- `purchaseUnderMandate()`
- `MerchantRegistry`
- `MandateRepository`
- `SpendingLog`
- `OpenPaymentsGateway`
- `createOutgoingPaymentIfAllowed()`
- `MerchantHistoryDeps`
- Los contratos de compras y pagos.

Actualmente existe la lógica de aplicación para evaluar compras, pero no todo el recorrido HTTP.

Determina qué componentes faltan para conectar:

Droguería Central → Cobro → Andrea → Mandato → Evaluación COMPAS → Open Payments → Resultado.

## 5.2 Implementación mínima segura

Completa los contratos y adaptadores que falten cuando se puedan implementar sobre la arquitectura existente.

Requisitos obligatorios:

- El backend debe autenticar al actor.
- Andrea solo puede utilizar mandatos donde sea delegada.
- El mandato debe estar activo y utilizable.
- El presupuesto, las categorías y las restricciones se validan en el backend.
- El comercio debe identificarse mediante información verificable, no únicamente un nombre recibido del navegador.
- La decisión de política se calcula en el backend.
- `DENY` o `REVIEW` no deben crear outgoing payments.
- Una autorización previa válida es obligatoria para cualquier gasto.
- Los intentos duplicados no deben producir pagos repetidos.
- Los errores de red y los resultados financieros inciertos no deben interpretarse automáticamente como fracasos seguros de reintentar.
- No se deben usar secretos ni tokens de Open Payments en el navegador.

Si necesitas persistir `purchase_intents`, inspecciona primero la tabla existente y sus restricciones.

No inventes una API separada que duplique las reglas ya implementadas.

## 5.3 Límite de seguridad para la demo

El entorno actual tiene:

`COMPAS_DEMO_PAYER_GRANTS=disabled`

**No cambies esa variable ni habilites operaciones financieras por tu cuenta.**

Puedes implementar y probar las rutas mediante dependencias simuladas en tests aislados, sin llamar a una billetera real.

No ejecutes `op:smoke` ni inicies consentimientos, incoming payments, quotes u outgoing payments contra las billeteras externas sin autorización adicional.

Los dobles de prueba deben permanecer separados del proveedor Open Payments real y no representar falsamente una operación de Interledger como confirmada.

Si el checkout completo depende de autenticación comercial inexistente, datos no disponibles o migraciones no autorizadas, implementa únicamente el tramo seguro y documenta con precisión lo que bloquea el resto.

No crees un endpoint público que permita a cualquier sesión de demostración gastar una autorización existente.

## 5.4 Resultado visual

La experiencia ideal debe poder mostrar, según lo efectivamente implementado:

- Cobro recibido.
- Comercio identificado.
- Importe y moneda.
- Presupuesto elegido.
- Comprobación de condiciones.
- Decisión del backend.
- Motivo de rechazo o revisión.
- Estado pendiente o confirmado del proveedor, cuando exista.

Si solamente se trata de una simulación, etiquétala explícitamente como tal.

Nunca conviertas un `ALLOW` en una afirmación de pago completado: la decisión de política y el movimiento financiero son eventos diferentes.

---

# SCOPE 6 — SINCRONIZACIÓN DE LA DEMO DE TRES TELÉFONOS

Inspecciona el comportamiento actual de:

- `DemoSession.tsx`
- `DemoStage.tsx`
- `frontend/src/demo/scenarios.ts`
- `frontend/src/demo/load-scenarios.ts`

La ruta `/demo` debe ofrecer una experiencia coherente para presentar COMPAS.

## Objetivo visual

**ARQ:** Pedro crea y administra presupuestos.

**Nequi:** Andrea consulta sus autorizaciones e interactúa con un cobro cuando esa funcionalidad esté disponible.

**Nequi Negocios:** Droguería Central configura COMPAS y gestiona el flujo comercial permitido por el backend.

## Requisitos

- Mantener las tres interfaces existentes y su estética.
- Preservar navegación, controles y diseño responsive.
- Evitar que un cambio de escenario deje información obsoleta.
- Sincronizar correctamente los datos compartidos que tengan respaldo real.
- Mantener diferenciados los estados simulados de los estados provenientes del backend.
- Mostrar errores comprensibles cuando el backend no responde.
- No presentar resultados esperados de fixtures como ejecuciones reales.
- No simular como exitoso un pago que no se ha efectuado.

Preserva también el comportamiento individual de `/arq`, `/nequi` y `/nequi-negocios`.

No rediseñes desde cero las aplicaciones ni alteres funcionalidades ajenas a COMPAS.

---

# SCOPE 7 — CONTRATOS, TIPOS Y ERRORES

Revisa la paridad entre:

`frontend/src/features/compas/api/contracts.ts`

y los contratos efectivos del backend.

Corrige divergencias en:

- Tipos y nombres de campos.
- Estados de mandatos.
- Respuestas HTTP.
- Códigos de error.
- Dinero en unidades menores.
- Escalas y monedas.
- Consentimiento.
- Revocación.
- Historial.
- Estados financieros.
- Categorías.
- Datos comerciales.

Utiliza `contracts/` como referencia compartida entre frontend y backend.

El frontend no debe importar código directamente desde `backend/src`.

## Cliente HTTP

Revisa y mejora cuando sea necesario:

- `compasApi`.
- Gestión de sesiones de demostración.
- Renovación de sesión.
- Prevención de peticiones duplicadas.
- Errores 401, 403, 404, 409, 422, 500 y 503.
- Backend indisponible.
- Timeouts, si son necesarios.
- Errores de validación.
- Recarga de datos después de mutaciones.

No hagas reintentos automáticos de operaciones financieras ni de creación de mandatos sin garantías de idempotencia.

## Configuración Next.js

Conserva preferiblemente el proxy:

`/compas-api/*` → backend.

Revisa `frontend/next.config.ts` y su variable `COMPAS_BACKEND_URL`.

No expongas `DATABASE_URL`, claves privadas, HMAC ni tokens mediante variables `NEXT_PUBLIC_*`.

---

# SCOPE 8 — DOCUMENTACIÓN PERSONAL LOCAL, EXCLUIDA DE GIT

Esta parte es obligatoria y debe ejecutarse aunque alguna integración funcional quede pendiente.

## 8.1 Crear carpeta personal

En la raíz de `compas-integration`, crea:

`.personal-docs/`

Y dentro:

`.personal-docs/COMPAS_FRONTEND_BACKEND_INTEGRATION.md`

Esta carpeta es exclusivamente para mi documentación técnica personal.

**No debe subirse a GitHub.**

## 8.2 Actualizar `.gitignore`

Agrega una entrada específica:

```gitignore
# Personal local documentation — never publish
/.personal-docs/
```

No elimines ninguna regla existente.

Comprueba con `git check-ignore -v` que el Markdown queda excluido.

Verifica también que no esté rastreado por Git y que no pueda añadirse mediante un `git add` convencional.

Está permitido que el cambio de `.gitignore` forme parte del código revisable. Lo que debe permanecer exclusivamente local es el contenido de `.personal-docs/`.

No utilices `git add -f` para incorporarlo.

## 8.3 Contenido obligatorio del Markdown

El archivo debe ser **muy detallado, pero fácil de comprender**, como una guía técnica para retomar personalmente el proyecto.

Incluye:

### A. Estado y referencias

- Commit base de Git.
- Rama utilizada.
- Fecha de auditoría.
- Arquitectura actual.
- Qué estaba implementado antes.
- Qué se modificó ahora.
- Qué está pendiente.

### B. Arquitectura frontend/backend

Explica cómo se comunican Next.js y Node.js.

Incluye un diagrama Mermaid, si resulta útil.

Explica el papel de Supabase y Open Payments.

### C. Mapa de las tres aplicaciones

Documenta:

- ARQ / Pedro.
- Nequi / Andrea.
- Nequi Negocios / Droguería Central.

Para cada pantalla, documenta sus funcionalidades, componentes, hooks, endpoints y dependencias.

### D. Inventario API

Incluye una matriz detallada de:

- Método HTTP.
- Endpoint.
- Actor autorizado.
- Request.
- Response.
- Servicio.
- Repositorio.
- Tabla.
- Estado de implementación.
- Pantalla consumidora.

### E. Flujos completos

Explica paso a paso:

1. Inicio de sesión de demostración.
2. Creación de presupuesto.
3. Autorización mediante Open Payments.
4. Activación.
5. Consulta de autorizaciones.
6. Revocación.
7. Historial.
8. Identificación comercial.
9. Generación de cobros.
10. Evaluación de compra.
11. Ejecución de pago, solamente cuando esté integrada.
12. Actualización de movimientos.

Separa los flujos implementados de los previstos.

### F. Variables de entorno

Documenta todas las variables necesarias para operar el sistema.

Para cada una:

- Nombre.
- Archivo donde se configura.
- Propósito.
- Si es obligatoria.
- Valor de ejemplo ficticio.
- Servicio que la utiliza.
- Consideraciones de seguridad.

Nunca copies valores reales de `.env`, contraseñas, claves privadas, cadenas de conexión con credenciales ni claves HMAC.

### G. Supabase

Documenta el uso de:

- `compas_api`
- `compas_backend`
- Esquema `compas`.
- Tablas relevantes.
- RLS.
- Repositorios PostgreSQL.
- Persistencia de mandatos, grants y gastos.

Indica que previamente se confirmó la autenticación y lectura real desde el backend local, distinguiéndolo de pruebas realizadas durante esta tarea.

### H. Open Payments

Explica su papel en el sistema:

- Wallet addresses.
- Grants.
- Consentimiento.
- Incoming payments.
- Quotes.
- Outgoing payments.
- Limitaciones actuales.
- Controles que impiden pagos sin autorización.

### I. Estado de funcionamiento

Crea una tabla de:

- Funciona completamente.
- Funciona parcialmente.
- Solo simulación.
- Falta implementar.
- Bloqueado por configuración.
- Bloqueado por seguridad.
- No probado.

### J. Guía de ejecución y pruebas

Incluye los comandos exactos para Windows PowerShell.

Explica cómo iniciar frontend y backend, qué puertos utilizan, cómo comprobar endpoints y cómo identificar errores.

### K. Pendientes y recomendaciones

Prioriza los trabajos restantes, con archivos afectados y dependencias técnicas.

### L. Registro de cambios

Indica cada archivo modificado durante esta ejecución y por qué.

El documento debe quedar actualizado al finalizar todo el trabajo, no únicamente al comenzar.

---

# SCOPE 9 — TESTING Y VALIDACIÓN

Ejecuta las verificaciones necesarias dentro del alcance seguro.

## 9.1 Tests del backend

Ejecuta:

```bash
npm run typecheck
npm test
```

Añade o actualiza tests para:

- Mandatos.
- Autorizaciones.
- Revocación.
- Estados.
- Categorías comerciales.
- Errores.
- Contratos nuevos.
- Validaciones de permisos.
- Prohibición de outgoing payments cuando la política no devuelve `ALLOW`.
- Casos críticos de checkout, si se implementa.

Usa repositorios en memoria y proveedores simulados en los tests de integración que necesiten escrituras.

## 9.2 Tests del frontend

Ejecuta:

```bash
npm run typecheck
npm run lint
npm run build
```

Ejecuta los tests propios si están disponibles.

Verifica:

- ARQ.
- Nequi.
- Nequi Negocios.
- `/demo`.
- Navegación.
- Formularios.
- Respuestas de error.
- Estados vacíos.
- Actualización de datos.
- Responsive.

Si existe navegador de pruebas disponible, utilízalo para inspeccionar visualmente la experiencia.

No introduzcas dependencias pesadas innecesarias.

## 9.3 Supabase

Se permiten consultas SQL de solo lectura contra la base compartida.

No ejecutes contra ella:

- Creación de mandatos de prueba.
- Modificación de gastos.
- Seeds.
- Limpieza de datos.
- Migraciones.
- Cambios de roles.
- Cambios RLS.
- Operaciones financieras.

Para tests que requieran escrituras, utiliza dobles de prueba, memoria o una base de pruebas aislada que exista y esté autorizada.

Si no dispones de un entorno seguro de escritura, registra esa limitación. No la evadas.

## 9.4 Open Payments

No habilites automáticamente grants ni ejecutes pagos reales, aunque sean de la red de pruebas.

Puedes verificar el código, los contratos y los tests con proveedores falsos de uso exclusivo en pruebas.

No afirmes haber validado una transferencia con Open Payments si solamente utilizaste mocks.

---

# SCOPE 10 — CRITERIOS DE ACEPTACIÓN

La tarea se considerará satisfactoria cuando:

1. Exista una rama nueva y segura basada en el último `main`.
2. No se haya perdido ningún avance anterior del equipo.
3. Las pantallas COMPAS de ARQ y Nequi utilicen correctamente la API disponible.
4. Los formularios y las respuestas HTTP respeten los contratos del backend.
5. Los errores de autorización y los estados de los mandatos sean coherentes.
6. La integración comercial de Nequi Negocios esté mejorada y sus límites estén claros.
7. La inconsistencia de categorías esté corregida sin alterar arbitrariamente la taxonomía.
8. Los componentes de checkout implementados respeten la autoridad del backend y la seguridad financiera.
9. La demo no confunda simulaciones con autorizaciones o pagos reales.
10. Los tests relevantes pasen, o las excepciones queden explicadas con evidencia.
11. Exista `.personal-docs/COMPAS_FRONTEND_BACKEND_INTEGRATION.md`, completo y actualizado.
12. `.personal-docs/` esté efectivamente excluida de Git.
13. No se hayan expuesto secretos ni modificado la base Supabase compartida.
14. No se haya ejecutado push ni merge a `main`.

Prioriza entregar una experiencia funcional y verificable antes que añadir funciones secundarias sin pruebas.

---

# SCOPE 11 — INFORME FINAL OBLIGATORIO

Al finalizar entrégame un informe en español con:

**1. Estado de Git**
- Rama de trabajo.
- Commit base.
- Modificaciones pendientes.
- Confirmación de que no hubo push.

**2. Diagnóstico original**
- Qué partes del frontend ya estaban conectadas.
- Qué estaba incompleto.
- Qué discrepancias encontraste con el backend actualizado.

**3. Implementaciones**
- Archivos modificados.
- Funcionalidades corregidas.
- Nuevas rutas o contratos.
- Cambios en la experiencia visual.

**4. Pruebas**
- Comandos ejecutados.
- Resultados.
- Tests aprobados.
- Tests pendientes o fallidos.
- Qué fue real y qué fue simulado.

**5. Estado de cada participante**
- Pedro.
- Andrea.
- Droguería Central.

**6. Seguridad**
- Confirma que no se modificaron RLS, roles, migraciones, credenciales ni datos de producción.
- Confirma que no se realizaron pagos.
- Confirma que no se filtraron secretos.

**7. Documentación**
- Ruta completa del Markdown personal.
- Confirmación de exclusión mediante `git check-ignore`.
- Confirmación de que el archivo no aparece entre los archivos rastreados.

**8. Pendientes**
- Qué falta para completar la demo.
- Qué necesita autorización.
- Qué requiere pruebas con la wallet virtual.
- Qué cambios deberían coordinarse con los compañeros.

**9. Recomendación**
Indica si la rama está lista para revisión e integración a `main`.

No declares el proyecto listo para producción ni el checkout financiero terminado si todavía faltan pruebas reales.

---

# RESTRICCIONES FINALES

- No reconstruyas la base de datos.
- No reemplaces PostgreSQL por supabase-js.
- No modifiques las credenciales.
- No cambies `.env` ni `private.key`.
- No imprimas secretos.
- No alteres el esquema `compas`.
- No elimines tablas.
- No deshabilites RLS.
- No uses el usuario administrador para tests.
- No actives grants de demo.
- No ejecutes transacciones con dinero real ni pagos de prueba externos.
- No inventes categorías verificadas.
- No uses IA como autoridad de pagos.
- No transfieras dinero al delegado.
- No reimplementes funciones que ya existen.
- No alteres funcionalidades ajenas a COMPAS.
- No hagas commits o push automáticos.
- No subas la carpeta de documentación personal.
- No sacrifiques seguridad por hacer que la demo parezca funcionar.

Puedes crear y modificar código, contratos, componentes, tests, documentación compartida imprescindible y `.gitignore`.

**Empieza con la auditoría, ejecuta las implementaciones por prioridad y termina con las pruebas y el Markdown personal. Trabaja autónomamente dentro de los scopes autorizados.**
````
