# 016 — Integrating the COMPAS experience with main

Tool: Claude Code (Claude Opus 5.5), 2026-10-17.

The verbatim user prompt for the session that merged `feature/compas-experience` with the updated `origin/main` on branch `integration/compas-experience`. The conflict log is in [docs/plans/compas-experience-integration.md](../docs/plans/compas-experience-integration.md). The fence uses four backticks because the prompt contains code blocks.

## 1

````text
# PROMPT MAESTRO — Integración completa de COMPAS Experience con el main actualizado

## 0. Rol, contexto y objetivo

Actúa como un **Senior Software Engineer, Git Integration Specialist, Backend Architect y Full-Stack Engineer**, con experiencia en TypeScript, React, Next.js, Node.js, PostgreSQL, Supabase, Open Payments y sistemas financieros.

Trabajamos sobre el repositorio:

https://github.com/ybedoyab/compas

Estamos desarrollando COMPAS para el Interledger Open Payments Hackathon 2026.

**OBJETIVO PRINCIPAL:**

Integrar satisfactoriamente los cambios locales de `feature/compas-experience` con la versión más reciente de `origin/main`, conservando todos los avances relevantes de ambas líneas de desarrollo, resolviendo los conflictos individualmente y verificando que el sistema combinado funcione.

Después de completar la integración y las verificaciones, actualizar también la rama `main` local, siempre que pueda hacerse sin sobrescribir ningún trabajo existente.

No se trata simplemente de hacer que Git deje de mostrar conflictos. Debes integrar correctamente el código y sus dependencias, mantener la arquitectura del proyecto y verificar los flujos de negocio.

**Trabaja de forma autónoma en Auto Mode**, incluyendo commits locales, pruebas, resolución de conflictos, ajustes de integración y documentación, dentro de los límites que establezco a continuación.

No hagas push a GitHub, salvo que posteriormente te lo autorice expresamente.

---

# 1. Estado conocido del proyecto

En la última revisión externa:

- `origin/main` era la rama más avanzada.
- Su HEAD conocido era `e3f0aeacb173719ee3e180d9760344229229b73e`.
- Ya incorporaba todos los commits de `open-payments`.
- Incorporaba la matriz de confianza.
- Incorporaba el esquema de Supabase.
- Incorporaba adaptadores PostgreSQL.
- Incorporaba reserva atómica de capacidad de presupuesto.
- Incorporaba registros persistentes de grants y evidencias comerciales.
- Incorporaba el historial demostrativo de Tienda Doña Gloria.

Estos datos son únicamente referencias. **Debes verificar el estado actual mediante `git fetch`, porque otros compañeros podrían haber publicado cambios adicionales.**

## 1.1 Trabajo local que debemos conservar

Existe una rama:

`feature/compas-experience`

Fue creada desde:

`8a1aa24b1b31c1aa9d213d144fa1c63e623c4836`

En un worktree separado, aproximadamente en:

`C:\Users\Usuario\Documents\HACKATHONS\Interledger OpenPayments 2026\compas-experience`

La carpeta original es aproximadamente:

`C:\Users\Usuario\Documents\HACKATHONS\Interledger OpenPayments 2026\compas`

Esta última estaba utilizando `fix/frontend-styles` y tenía cambios locales propios.

**No confundas los dos worktrees.**

En `feature/compas-experience` se desarrollaron:

- `MandateService`.
- API HTTP de mandatos.
- Identidad de demostración.
- Creación de presupuestos desde ARQ.
- Wizard de cinco pasos.
- Consulta de autorizaciones desde Nequi.
- Detalles de mandatos.
- Historial de gastos.
- Revocación de mandatos.
- Integración del callback de consentimiento.
- Componentes compartidos de COMPAS.
- Proxy frontend/backend.
- Pruebas automatizadas.
- Documentación y contratos HTTP.

La ejecución anterior reportó:

- 225 pruebas de backend aprobadas.
- 13 pruebas de frontend aprobadas.
- Typecheck, lint y build correctos.
- Pruebas de navegación mediante Chrome.

Estos resultados corresponden a la implementación anterior, **no garantizan que la integración con el nuevo `main` vaya a funcionar sin cambios**.

Los cambios podían seguir sin commit. Verifícalo.

---

# 2. FASE A — Auditoría exhaustiva de Git

Antes de modificar cualquier archivo, inspecciona el repositorio y todos los worktrees.

Ejecuta los comandos pertinentes:

```bash
git status --short
git status --branch
git branch -vv
git branch -a
git worktree list --porcelain
git remote -v
git fetch origin --prune
git log --graph --oneline --decorate --all -35
```

Comprueba específicamente:

1. Qué rama está activa en cada worktree.
2. Qué cambios están confirmados.
3. Qué cambios no están confirmados.
4. Qué archivos nuevos no están rastreados.
5. Si la rama `main` local tiene commits que todavía no están en GitHub.
6. Cuál es el HEAD actual de `origin/main`.
7. Cómo se relaciona `feature/compas-experience` con `origin/main`.
8. Si existen otras ramas locales con cambios relevantes que podrían afectar la integración.
9. Si hay algún merge, rebase o cherry-pick inconcluso.

Utiliza también:

```bash
git merge-base feature/compas-experience origin/main
git log --left-right --oneline feature/compas-experience...origin/main
git diff --stat feature/compas-experience...origin/main
```

No asumas que la rama más reciente por fecha es la correcta: analiza ascendencia y contenido.

### Regla crítica

NO ejecutes:

```bash
git reset --hard
git clean -fd
git push --force
git worktree remove --force
```

Tampoco utilices operaciones equivalentes que descarten trabajo.

No utilices `git stash` como estrategia predeterminada. Hay múltiples worktrees y debemos conservar sus estados.

---

# 3. FASE B — Proteger el trabajo local antes del merge

Esta fase es obligatoria.

## 3.1 Conservar `feature/compas-experience`

La rama contiene trabajo valioso y no debe desaparecer durante la integración.

Si tiene cambios no confirmados:

1. Identifica todos los archivos modificados, agregados y no rastreados.
2. Verifica que pertenecen realmente a la feature.
3. Examina el diff.
4. Comprueba que no incluye secretos ni archivos generados.
5. Conserva una copia recuperable del estado anterior a la integración.
6. Realiza un commit local de respaldo funcional.

Mensaje sugerido:

`feat: implement COMPAS mandate and delegated budget experience`

Tienes autorización para realizar ese commit local.

Antes de hacerlo, verifica:

```bash
git diff --check
git status --short
git check-ignore -v backend/.env backend/private.key
```

No incluyas `.env`, `private.key`, contraseñas, tokens, URLs de conexión con credenciales, dumps privados ni archivos temporales.

Si la feature ya tiene commits, consérvalos. No reescribas el historial innecesariamente.

## 3.2 Conservar los cambios de la carpeta original

Si `compas` sigue en `fix/frontend-styles` con trabajo sin confirmar, déjalo intacto.

No hagas checkout, pull, reset ni merge dentro de ese worktree si podría afectar esos cambios.

**La rama `fix/frontend-styles` no forma parte de esta integración.**

No mezcles automáticamente sus modificaciones con COMPAS Experience.

Si contiene trabajo que debería integrarse posteriormente, repórtalo por separado.

## 3.3 Secretos locales

Es posible que existan:

- `backend/.env`
- `backend/private.key`

Estos contienen configuración privada de Open Payments y posiblemente Supabase.

Presérvalos, pero no los incluyas en Git.

No imprimas sus valores.

No los copies a otros worktrees innecesariamente.

Puedes comprobar su existencia y la presencia de nombres de variables sin revelar contenidos.

Si un entorno nuevo necesita esos archivos para realizar pruebas, utiliza una configuración local segura. No cambies las credenciales existentes ni publiques sus valores.

---

# 4. FASE C — Crear un entorno de integración aislado

No recomiendo resolver los conflictos dentro del worktree original que contiene trabajo ajeno.

Crea preferiblemente un nuevo worktree:

`compas-integration`

Con una rama:

`integration/compas-experience`

Basada en el `origin/main` actualizado.

Por ejemplo:

```bash
git worktree add -b integration/compas-experience ../compas-integration origin/main
```

Ajusta rutas según la estructura real y utiliza nombres alternativos seguros si alguno ya existe.

No sobrescribas una rama o carpeta existente.

La nueva integración debe comenzar con:

- Todos los cambios actuales de `origin/main`.
- Un árbol de trabajo limpio.
- Dependencias instalables.
- Ningún cambio local de los otros worktrees.

Antes de fusionar, ejecuta una línea base de pruebas sobre el `main` recibido.

Verifica:

```bash
cd backend
npm ci
npm run typecheck
npm test
```

Y:

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

Ejecuta también el script de IA del hackathon, si existe.

Registra los fallos preexistentes antes de integrar la feature, para distinguirlos de los nuevos.

---

# 5. FASE D — Fusionar COMPAS Experience en el main actualizado

Desde el worktree de integración, fusiona la rama local:

`feature/compas-experience`

Sobre la base actualizada de `origin/main`.

Utiliza una operación de merge convencional, preservando la historia.

No hagas cherry-picks indiscriminados ni copies carpetas completas por encima de `main`.

Comando orientativo:

```bash
git merge --no-ff --no-commit feature/compas-experience
```

No generes el commit final hasta revisar, resolver y probar el resultado.

Si el merge no produce conflictos textuales, **no asumas que la integración funcional está terminada**.

Debes buscar también conflictos semánticos: cambios distintos que Git permite combinar, pero que alteran el comportamiento cuando se ejecutan juntos.

---

# 6. FASE E — Resolver conflictos uno por uno

Esta es la fase más importante.

Por cada archivo conflictivo:

1. Identifica lo que hace la versión actual de `main`.
2. Identifica lo que hace la versión de `compas-experience`.
3. Revisa los contratos, funciones y dependencias relacionadas.
4. Determina qué comportamiento debe preservarse de cada lado.
5. Implementa una solución integrada.
6. Verifica los tipos.
7. Ejecuta las pruebas directamente relacionadas.
8. Marca el conflicto como resuelto únicamente después de revisar el resultado.

No utilices automáticamente:

```bash
git checkout --ours
git checkout --theirs
```

Tampoco uses opciones globales de merge como `-X ours` o `-X theirs`.

Esas opciones pueden eliminar funcionalidades desarrolladas por otros compañeros.

### Documenta cada conflicto

Crea un registro bajo `docs/plans/` o reutiliza el plan de integración existente.

Para cada conflicto registra:

- Archivo.
- Cambios introducidos por `main`.
- Cambios introducidos por la feature.
- Decisión.
- Motivo.
- Prueba utilizada para verificarla.

No es necesario escribir un informe largo por cada ajuste trivial, pero los conflictos arquitectónicos deben quedar justificados.

---

# 7. SCOPE 1 — Integración del backend

## 7.1 Archivo crítico: `backend/src/api/server.ts`

En `main` ya existe:

- `connectDatabase()`.
- `PostgresGrantStore`.
- `createOpenPaymentsGateway()`.
- `createMerchantCategoryService()`.
- `createMerchantHistoryService()`.
- Rutas de categorías comerciales.
- Callback de Open Payments.

La feature agrega:

- `MandateService`.
- Endpoints de mandatos.
- Autorización y revocación.
- Identidad de demostración.
- Activación del mandato tras consentimiento.
- Lectura de actividad.

**Debes conservar ambos conjuntos de funcionalidades.**

El resultado debe tener un único servidor coherente y una sola composición del gateway Open Payments.

No elimines servicios de registro comercial, matriz de confianza, evidencias, historial ni PostgreSQL.

No dupliques instancias de conexión a la base de datos sin necesidad.

El callback `/open-payments/finish` debe seguir validando el consentimiento y también actualizar correctamente el mandato correspondiente.

No basta con añadir imports: comprueba las dependencias y su ciclo de vida.

## 7.2 Repositorio de mandatos

En `main`, `MandateRepository` incluye:

- `getById`
- `save`
- `reserveCapacity`
- `releaseCapacity`

La feature agregó capacidades necesarias para:

- Consultar mandatos del titular.
- Consultar autorizaciones de un delegado.
- Administrar estados de mandatos.
- Relacionar mandatos con grants.

Debes unificar la interfaz y actualizar todas sus implementaciones.

Especialmente:

- `PostgresMandateRepository`
- `InMemoryMandateRepository`
- Los repositorios no implementados que deban seguir cumpliendo el contrato.
- Los dobles de prueba correspondientes.

Cuando `DATABASE_URL` esté configurado, `MandateService` debe utilizar realmente PostgreSQL.

No agregues un repositorio paralelo que mantenga mandatos exclusivamente en memoria mientras los grants permanecen en PostgreSQL.

## 7.3 Consistencia de presupuestos

`main` agregó reserva atómica de capacidad.

**Esa funcionalidad tiene prioridad como control de concurrencia.**

Comprueba que:

- Un presupuesto recién creado se persiste correctamente.
- El presupuesto no aparece como autorizado antes del consentimiento.
- El grant queda asociado al mandato correcto.
- La activación no restaura accidentalmente capacidad ya consumida.
- La revocación no permite nuevas reservas.
- Dos compras concurrentes no exceden el presupuesto.
- El estado mostrado corresponde a los datos persistidos.

Revisa especialmente las actualizaciones mediante `save()` que pudieran sobrescribir `remaining_value` con valores antiguos.

No destruyas la lógica de `reserveCapacity()` ni `releaseCapacity()` para satisfacer la interfaz nueva.

Diseña pruebas de regresión para la condición de concurrencia.

## 7.4 Grants y consentimiento

Reutiliza íntegramente el gateway existente.

Debes conservar:

- `startPayerGrant`
- `finishPayerGrant`
- `cancelPayerGrant`
- `readGrantSpentAmounts`
- `createOutgoingPaymentIfAllowed`

El mandato debe pasar a `ACTIVE` únicamente después de una confirmación auténtica del consentimiento por parte del proveedor.

Una URL del navegador con:

`payerAuthorization=granted`

no es una prueba suficiente.

El backend debe confirmar el estado real del grant.

Si el grant se almacena en PostgreSQL, no debe existir otro almacén independiente para ese mismo permiso.

## 7.5 Identidad y autorización

La implementación anterior contiene identidades de demostración de Pedro y Andrea.

Presérvala solo como mecanismo de demostración aislado.

Asegúrate de que:

- Está desactivada en producción.
- No puede habilitarse accidentalmente en un despliegue público.
- No permite suplantar a un titular para operar con grants financieros reales.
- Las operaciones sensibles validan la identidad en el servidor.
- Los permisos de lectura y escritura dependen de la relación con el mandato.

**No permitas que una identidad seleccionada libremente en el navegador acceda a grants reales.**

Si no existe autenticación financiera suficientemente segura, mantén las operaciones reales deshabilitadas para sesiones demostrativas y documenta la limitación.

No implementes un sistema completo de autenticación nuevo durante este merge.

---

# 8. SCOPE 2 — Supabase y PostgreSQL

El equipo ya desarrolló adaptadores en:

`backend/src/integrations/postgres/`

Debes reutilizarlos.

### Objetivo

Cuando `DATABASE_URL` esté configurado, la API de COMPAS Experience debe leer y escribir mandatos, grants y actividad en los adaptadores persistentes adecuados.

### Restricciones

- No crear un segundo esquema COMPAS.
- No duplicar tablas.
- No reemplazar los adaptadores existentes sin justificación técnica.
- No utilizar Supabase JS directamente desde el frontend.
- No exponer `DATABASE_URL` al navegador.
- No almacenar secretos en `NEXT_PUBLIC_*`.
- No volver a ejecutar migraciones que ya estén aplicadas.
- No ejecutar `TRUNCATE`, `DROP`, limpieza de datos ni reinicios de Supabase.
- No crear usuarios o roles nuevos sin comprobar primero los existentes.

Si encuentras diferencias entre el esquema y los adaptadores, documenta la situación y corrige únicamente lo indispensable.

Puedes crear migraciones incrementales cuando estén justificadas, pero **no las ejecutes sobre la base compartida automáticamente**.

### Verificaciones

Usa primero pruebas locales y dobles de base de datos.

Si está disponible una base de pruebas aislada, ejecuta las pruebas PostgreSQL allí.

No utilices la base compartida para pruebas destructivas.

Si las credenciales del entorno no están disponibles, deja el sistema compilando y probado hasta el límite posible. Reporta qué parte no pudo verificarse.

### Importante

No mezcles datos ficticios de Tienda Doña Gloria con los mandatos visibles de Pedro.

Las consultas deben filtrar correctamente por titular y delegado.

---

# 9. SCOPE 3 — Integración del frontend

Conserva las interfaces actuales de:

- ARQ.
- Nequi.
- Nequi Negocios.

Integra la feature de Claude Code manteniendo:

### ARQ

- Pantalla principal COMPAS.
- Crear presupuesto.
- Wizard de cinco pasos.
- Presupuestos creados.
- Estado de autorización.
- Detalle del mandato.
- Reglas.
- Movimientos.
- Revocación.

### Nequi

- Autorizaciones recibidas.
- Presupuesto disponible, cuando esté realmente autorizado.
- Propósito.
- Titular y beneficiario.
- Vigencia.
- Detalle de condiciones.
- Estados y errores.

### Componentes compartidos

Conserva:

`frontend/src/features/compas/`

y su separación entre:

- API.
- Contratos.
- Hooks.
- Componentes visuales.
- Titular.
- Delegado.
- Utilidades de dinero y fechas.

No dupliques lógica de negocio en React.

El frontend debe consumir las APIs del backend integrado.

### Integridad visual

No alteres indiscriminadamente el diseño de las billeteras.

Mantén:

- Identidad visual de ARQ.
- Identidad visual de Nequi.
- Transiciones originales.
- Navegación hacia atrás.
- Estados vacíos.
- Accesibilidad.
- Compatibilidad móvil.

Comprueba que funcionan:

- `/`
- `/demo`
- `/arq`
- `/nequi`
- `/nequi-negocios`

**No modifiques Nequi Negocios salvo que una incompatibilidad real del merge lo exija.**

---

# 10. SCOPE 4 — Contratos y lógica de negocio

Los contratos existentes en `contracts/` son la referencia.

Revisa especialmente:

- `contracts/mandates/README.md`
- `contracts/data-model/README.md`
- `contracts/open-payments/README.md`
- `contracts/purchases/README.md`
- `contracts/merchant-categories/README.md`

No redefinas un concepto si el backend ya tiene un contrato establecido.

### Invariantes obligatorias

1. Un grant es un permiso, no dinero almacenado.
2. Un mandato representa reglas de delegación.
3. El delegado no recibe fondos en su billetera.
4. `ENFORCED` exige el cumplimiento de las reglas de propósito.
5. `MONITORED` permite excepciones de propósito previamente autorizadas, pero no elimina restricciones financieras.
6. `DENY` y `REVIEW` no pueden generar pagos bajo modo estricto.
7. `ALLOW` no significa pago completado.
8. Un presupuesto agotado no puede utilizarse nuevamente sin una nueva autorización válida.
9. Revocar un mandato bloquea nuevos intentos de gasto.
10. El frontend nunca puede tomar una decisión financiera autoritativa.
11. Los importes deben utilizar unidades menores exactas.
12. La información de identidad y comercio debe verificarse en el backend.

Si un cambio de integración compromete alguna de estas invariantes, corrígelo antes de concluir.

---

# 11. SCOPE 5 — Resolver incompatibilidades que Git no detecta

Busca expresamente los siguientes problemas:

- Interfaces TypeScript con métodos faltantes.
- Servicios con firmas modificadas.
- Imports obsoletos.
- Cambios en rutas HTTP.
- Inicializaciones duplicadas.
- Callbacks desconectados.
- Repositorios en memoria utilizados accidentalmente en lugar de PostgreSQL.
- Grants guardados en un store distinto del consultado por el callback.
- Diferencias entre estados `DRAFT`, `PENDING_AUTHORIZATION`, `ACTIVE`, `REVOKED`, `EXHAUSTED` y `EXPIRED`.
- Datos de demo presentados como datos reales.
- Actualizaciones de estado que sobrescriben presupuestos reservados.
- Contabilización de pagos `PENDING` como completados.
- Referencias de documentación a endpoints inexistentes.
- Conflictos de numeración en los registros de prompts.
- Incompatibilidades entre la configuración de Next.js de ambas versiones.

No fuerces compatibilidad mediante valores hardcodeados ni mocks silenciosos.

Implementa correcciones puntuales.

Si la incompatibilidad pertenece a una funcionalidad completamente fuera del alcance de la integración, documéntala sin modificar innecesariamente otros módulos.

---

# 12. SCOPE 6 — Pruebas completas

Después de resolver los conflictos, ejecuta:

## Backend

```bash
cd backend
npm ci
npm run typecheck
npm test
```

## Frontend

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Ejecuta los scripts que realmente existan. Si uno no está disponible, identifica el motivo y no lo presentes como ejecutado.

## Pruebas adicionales

Verifica especialmente:

**Caso 1: creación**

Pedro puede crear un presupuesto con categorías, importe, beneficiario, delegado y fechas.

**Caso 2: autorización**

Sin consentimiento válido, el mandato no aparece como activo.

**Caso 3: persistencia**

Cuando PostgreSQL esté disponible, el mandato debe conservarse después de reiniciar el servidor.

**Caso 4: delegado**

Andrea puede consultar los mandatos activos que le fueron concedidos, pero no modificar los de Pedro.

**Caso 5: revocación**

Un mandato revocado no permite iniciar nuevos gastos.

**Caso 6: presupuesto**

Dos operaciones simultáneas no pueden reservar más capacidad que la disponible.

**Caso 7: comercio**

Las categorías, la matriz de confianza y el historial de Tienda Doña Gloria siguen funcionando.

**Caso 8: Open Payments**

El consentimiento conserva sus verificaciones y la asociación correcta al mandato.

**Caso 9: regresiones**

Las experiencias ARQ, Nequi y Nequi Negocios continúan funcionando.

**Caso 10: seguridad**

Una sesión de demostración no puede operar con credenciales financieras reales sin una autenticación autorizada.

No ejecutes transferencias financieras reales, aunque sean de la red de pruebas, sin que exista una instrucción específica para hacerlo.

Puedes probar el gateway mediante mocks y utilizar pruebas de integración locales.

---

# 13. SCOPE 7 — Verificación en navegador

Usa Playwright o Chrome automatizado si las herramientas disponibles lo permiten.

Comprueba visual y funcionalmente:

- Pantalla inicial.
- Creación de presupuesto.
- Validación de formularios.
- Regreso entre pasos.
- Selección de modo estricto y supervisado.
- Revisión y confirmación.
- Respuesta cuando Open Payments no está configurado.
- Visualización de borradores.
- Visualización de mandatos activos de prueba.
- Revocación.
- Autorizaciones recibidas por Andrea.
- Navegación hacia atrás.
- Pantallas en diferentes tamaños.
- Ausencia de errores de hidratación.
- Ausencia de errores de consola.
- Funcionamiento del proxy HTTP.

No des por probado un consentimiento financiero real mediante un gateway simulado.

Identifica explícitamente los estados de demostración.

---

# 14. SCOPE 8 — Documentación y reglas del hackathon

Revisa:

- `AGENTS.md`
- `CLAUDE.md`, si existe.
- `.AGENTS/`
- `.skills/compas-context/`
- `.skills/hackathon-ai-rules/`
- `.agents/skills/supabase/`
- `.agents/skills/supabase-postgres-best-practices/`
- `AI_USAGE.md`

Registra la integración en un nuevo documento de `docs/plans/`.

Actualiza los contratos afectados.

### AI_USAGE

La feature anterior añadió registros propios, mientras el equipo añadió los suyos en `main`.

Conserva ambos conjuntos.

Si el verificador requiere secciones como:

- Tools Used.
- Where and How We Used AI.
- What We Did Ourselves.
- Prompt Log.

Comprueba el formato exigido por el proyecto y corrige únicamente lo necesario.

No elimines el historial previo para hacer pasar el verificador.

### Historial de prompts

En `main` existe:

`prompts/014-postgres-adapters.md`

La feature creó:

`prompts/014-compas-experience.md`

No borres ninguno.

Si existe un conflicto lógico de numeración, utiliza el siguiente número disponible para los nuevos registros y actualiza sus referencias.

Conserva los prompts históricos.

Registra también este prompt de integración siguiendo las reglas de cumplimiento vigentes.

---

# 15. FASE F — Finalizar el merge local

Cuando:

- No existan conflictos.
- El backend compile.
- El frontend compile.
- Las pruebas pasen.
- La integración funcional haya sido revisada.
- Los cambios estén documentados.

Finaliza el merge en:

`integration/compas-experience`

Con un commit local descriptivo, por ejemplo:

`merge: integrate COMPAS experience with latest main`

Antes de hacerlo:

```bash
git diff --check
git status
git diff --cached --stat
```

Comprueba que no haya secretos ni artefactos accidentales.

### Actualizar la rama main local

Después de completar satisfactoriamente la integración:

1. Inspecciona el estado de `main` local.
2. Comprueba si está activa en otro worktree.
3. Compara sus commits con `origin/main`.
4. Comprueba que no existan commits locales exclusivos que puedan perderse.
5. Si es seguro, actualiza `main` local mediante operaciones fast-forward, hasta incorporar el resultado de la rama de integración.
6. Si `main` local contiene commits exclusivos, intégralos explícitamente y ejecuta nuevamente las verificaciones.
7. No hagas force-update de referencias.
8. Si `main` está ocupada por otro worktree con cambios sin confirmar, no lo alteres. Conserva el resultado en `integration/compas-experience` y explica el bloqueo exacto.

**Quiero que el resultado final termine en `main` local siempre que sea posible hacerlo sin descartar trabajo.**

No borres `feature/compas-experience` al terminar.

No borres los worktrees anteriores.

Esos recursos solamente se limpiarán después de verificar que la integración final está conservada y, posteriormente, publicada correctamente.

---

# 16. Acciones autorizadas y prohibidas

## Autorizadas en Auto Mode

Puedes realizar sin solicitar confirmación adicional:

- Inspección de ramas y worktrees.
- `git fetch`.
- Comparación de commits.
- Creación de un worktree nuevo.
- Creación de rama de integración.
- Commits locales necesarios para respaldar la feature.
- Merge local.
- Resolución de conflictos.
- Adaptaciones de código estrictamente necesarias.
- Creación de pruebas.
- Ejecución de pruebas.
- Compilación.
- Actualización de documentación.
- Actualización segura de `main` local.
- Instalación de dependencias mediante lockfiles.
- Corrección de errores introducidos por la integración.

## Prohibidas

No hagas:

- Push a `origin/main`.
- Force-push.
- Eliminación de ramas.
- Eliminación de worktrees.
- Hard reset.
- Limpieza destructiva de archivos.
- Descarte de cambios sin confirmar.
- Cambios destructivos en Supabase.
- Ejecución de transferencias reales.
- Rotación o exposición de secretos.
- Publicación de archivos `.env` o llaves privadas.
- Cambios indiscriminados del frontend del comercio.
- Reescritura completa del backend.
- Reemplazo del gateway Open Payments.
- Creación de un sistema financiero paralelo.
- Refactorizaciones ajenas al objetivo.

Si existe un bloqueo que exige una de estas acciones, detente únicamente en ese punto y reporta la situación.

No conviertas un problema aislado en una razón para abandonar todo el trabajo que todavía pueda completarse de forma segura.

---

# 17. Criterios de aceptación

Consideraré exitosa la tarea únicamente cuando:

1. La feature COMPAS Experience esté conservada íntegramente.
2. El resultado incluya todos los avances recientes de `origin/main`.
3. No se haya perdido ninguna implementación importante del backend del equipo.
4. Los conflictos de Git estén resueltos.
5. Los conflictos semánticos relevantes estén resueltos.
6. El servidor tenga correctamente integradas sus rutas y dependencias.
7. La API de mandatos utilice PostgreSQL cuando corresponda.
8. El consentimiento Open Payments esté asociado al mandato correcto.
9. Los flujos de ARQ y Nequi funcionen contra la misma API.
10. La reserva atómica de presupuesto permanezca intacta.
11. Las pruebas automatizadas pasen.
12. El frontend compile correctamente.
13. Nequi Negocios no tenga regresiones.
14. Los datos simulados estén diferenciados de los reales.
15. El proyecto cumpla las reglas del hackathon o se documenten fallos preexistentes.
16. La rama `main` local esté actualizada, salvo un bloqueo de seguridad o preservación de trabajo debidamente explicado.
17. No se hayan publicado cambios en GitHub.
18. El trabajo original de los otros worktrees esté preservado.

---

# 18. Informe final obligatorio

Al concluir, proporciona un informe con:

### Git

- HEAD inicial de `origin/main`.
- HEAD final de `origin/main`.
- Commit base de `feature/compas-experience`.
- Commit de respaldo local.
- Rama de integración utilizada.
- Commit de merge.
- Estado de `main` local.
- Estado de cada worktree.
- Estado de Git limpio o explicación de modificaciones pendientes.

### Resolución de conflictos

Para cada conflicto significativo:

- Archivo.
- Causa.
- Decisión adoptada.
- Funcionalidad conservada de cada rama.
- Prueba realizada.

### Integración funcional

Explica:

- Cómo está conectado `MandateService`.
- Qué repositorio utiliza.
- Qué ocurre cuando `DATABASE_URL` está configurado.
- Cómo se persiste el estado del mandato.
- Cómo se almacena el grant.
- Cómo se completa el consentimiento.
- Cómo aparecen los mandatos en ARQ y Nequi.
- Cómo se evitan inconsistencias del presupuesto.

### Pruebas

Presenta una tabla con:

- Comando.
- Resultado.
- Número de pruebas.
- Fallos.
- Estado real de la prueba.

Distingue las pruebas con mocks de las realizadas contra servicios externos.

### Pendientes

Separa:

- Fallos críticos.
- Limitaciones del entorno.
- Integraciones no verificadas.
- Funcionalidades fuera del alcance.
- Pasos necesarios antes del push a GitHub.

No afirmes que el sistema está listo para producción.

---

# 19. Instrucción final

**Empieza inmediatamente.**

No necesito que me vuelvas a presentar un plan para aprobarlo: este prompt ya define los scopes y autoriza las operaciones locales necesarias.

Primero inspecciona y protege los worktrees actuales. Después crea el entorno aislado de integración, fusiona `feature/compas-experience` con el `origin/main` actualizado, resuelve los conflictos individualmente, conserva la arquitectura Supabase/Open Payments del equipo y verifica el funcionamiento.

Una vez superadas las pruebas, actualiza `main` local cuando sea seguro.

No hagas push.

**El resultado esperado es una versión local de COMPAS donde convivan correctamente los avances recientes del equipo y toda la funcionalidad desarrollada para el botón COMPAS, sin pérdida de código, datos o historial.**
````
