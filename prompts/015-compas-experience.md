# 015 — COMPAS experience: mandates, budgets and authorizations

Tool: Claude Code (Claude Opus 5.5), 2026-10-16.

Numbered 014 on `feature/compas-experience`, renumbered 015 when it was merged with `main`, which already had a prompt 014. The verbatim user prompt for the session that built the COMPAS module in the ARQ and Nequi simulations, on branch `feature/compas-experience`. The fence uses four backticks because the prompt contains code blocks.

## 1

````text
# PROMPT MAESTRO — COMPAS Experience: mandatos, presupuestos y autorizaciones

## 0. Rol y objetivo general

Actúa como un **Senior Full-Stack Engineer, Software Architect y Product Engineer**, especializado en Next.js, React, TypeScript, Node.js, PostgreSQL, Supabase, Open Payments e integración de productos financieros.

Estamos desarrollando **COMPAS**, para el Interledger Open Payments Hackathon 2026.

Repositorio: https://github.com/ybedoyab/compas

Tu tarea es construir la primera experiencia funcional del módulo COMPAS, accesible desde los botones COMPAS ya existentes en las interfaces simuladas de ARQ y Nequi.

**No queremos solamente diseñar pantallas. Queremos implementar los flujos de negocio necesarios para que un usuario pueda crear, consultar y administrar autorizaciones de gasto con propósito, y otro usuario pueda consultar las autorizaciones que recibió.**

El desarrollo debe aprovechar el backend existente, especialmente Open Payments, los mandatos, las políticas de propósito, los modelos de confianza comercial y el esquema PostgreSQL/Supabase.

No debes reinventar componentes ya implementados, modificar indiscriminadamente módulos de otros compañeros ni crear una arquitectura paralela.

Trabaja de manera autónoma, con decisiones técnicas justificadas y entregables verificables.

---

# 1. Git: actualización, selección de base y creación de rama

**OBLIGATORIO: antes de modificar archivos.**

El repositorio se desarrolla simultáneamente en distintas ramas.

En la última revisión conocida:

- `main`: frontend integrado.
- `open-payments`: backend avanzado, grants, políticas, matriz de confianza y esquema Supabase.
- `trust-matrix`: cambios que ya son ancestros de `open-payments`.
- `feat/nequi-ui`: trabajo anterior integrado.

La última referencia conocida de `open-payments` era:

`8a1aa24b1b31c1aa9d213d144fa1c63e623c4836`

No asumas que sigue siendo el HEAD actual.

### Instrucciones

1. Ejecuta:

```bash
git status
git remote -v
git branch -a
git fetch origin --prune
git log --oneline --graph --decorate --all -25
```

2. Comprueba si existen cambios locales sin confirmar.

3. Compara las ramas relevantes mediante `git merge-base`, `git log` y `git diff`.

4. Identifica la rama con la base integrada más avanzada para esta funcionalidad. Prioriza `origin/open-payments` si sigue conteniendo los avances de `main`, `trust-matrix` y el esquema de datos.

5. No elijas la base únicamente por la fecha del último commit.

6. No realices merges ni rebases innecesarios para comenzar.

7. Crea una nueva rama:

`feature/compas-experience`

Partiendo directamente de la referencia remota actualizada. Por ejemplo, cuando corresponda:

```bash
git switch -c feature/compas-experience origin/open-payments
```

8. Si existe trabajo local que impide cambiar de rama, utiliza un `git worktree` nuevo o una alternativa segura. No descartes, sobrescribas ni alteres trabajo ajeno.

9. Si la rama ya existe, inspecciona su estado antes de continuar. Evita sobrescribirla.

10. Reporta el nombre de la rama, el commit base y su relación con `main`.

**No realices push, force-push, merge a main ni commits automáticos sin mi autorización.**

---

# 2. Leer y respetar las instrucciones del proyecto

Antes de implementar, inspecciona las instrucciones existentes, especialmente:

- `AGENTS.md`
- `CLAUDE.md`
- `.AGENTS/`
- `.skills/compas-context/`
- `.skills/frontend-design/`
- `.skills/hackathon-ai-rules/`
- `frontend/AGENTS.md`
- `README.md`
- `AI_USAGE.md`

Revisa asimismo:

- `docs/00-product-vision.md`
- `docs/01-demo-story.md`
- `docs/02-domain-model.md`
- `docs/03-architecture.md`
- `docs/04-open-payments-mapping.md`
- `docs/05-policy-engine.md`
- `docs/07-security-privacy-ethics.md`
- `docs/adr/0005-merchant-category-attestations.md`
- `docs/adr/0006-monitored-budgets.md`
- `docs/adr/0007-merchant-confidence-matrix.md`
- `docs/plans/open-payments-integration.md`
- `contracts/`
- `data/schema/README.md`

Inspecciona los componentes frontend y las APIs existentes antes de decidir cómo extenderlos.

Si las instrucciones han cambiado, utiliza su versión más reciente.

Para Next.js, sigue también las instrucciones específicas de `frontend/AGENTS.md`.

---

# 3. Principios de negocio innegociables

COMPAS es una capa de autorización y políticas de gasto delegado.

No es una billetera, una cuenta bancaria, un sistema de custodia ni una nueva red de pagos.

La historia principal es:

- Pedro es el titular de los fondos.
- Andrea es su delegada.
- Gladys es la beneficiaria.
- Pedro autoriza un presupuesto de USD 40 para medicamentos.
- Andrea puede iniciar compras sujetas a las reglas del mandato.
- El dinero sigue en la billetera de Pedro hasta que ocurre un pago autorizado.
- Si se ejecuta una compra permitida, Open Payments transfiere directamente de la billetera de Pedro a la del comercio.
- Andrea nunca recibe ese presupuesto como saldo propio.

### Modelo central

Un `Mandate` incluye:

- `payer`
- `delegate`
- `beneficiary`
- `budget`
- `remainingAuthorizedAmount`
- `purposePolicy`
- `status`
- `validFrom`
- `expiresAt`
- `createdAt`

Los estados son:

- `DRAFT`
- `PENDING_AUTHORIZATION`
- `ACTIVE`
- `EXHAUSTED`
- `EXPIRED`
- `REVOKED`

Respeta los estados y tipos ya definidos.

### Políticas

Actualmente existen:

**ENFORCED:** las comprobaciones de propósito determinan si la compra se permite, rechaza o requiere revisión.

**MONITORED:** el titular admite de antemano compras que no superen la comprobación de propósito. COMPAS registra la excepción; las reglas obligatorias del mandato y el límite financiero del grant continúan aplicando.

No interpretes `MONITORED` como una aprobación de seguridad del comercio.

### Confianza comercial

El backend maneja:

- `HIGH`
- `MEDIUM`
- `LOW`
- `CONTESTED`

Un mandato puede especificar:

- `merchantConfidence.minimum`
- `merchantConfidence.maxDebitBelowHigh`

El frontend debe interpretar esas opciones mediante lenguaje comprensible y no mediante términos exclusivamente técnicos.

No modifiques el motor de confianza para adaptar las pantallas. Las pantallas deben adaptarse a la lógica existente.

---

# 4. Alcance exacto de esta feature

Implementaremos una primera versión funcional de COMPAS para **titulares y delegados**.

## SCOPE A — Pantalla principal COMPAS en ARQ

Archivo de entrada actual:

`frontend/src/features/arq/ArqCompasShell.tsx`

Actualmente muestra una pantalla introductoria.

Reemplaza esa experiencia por un módulo funcional y navegable, manteniendo la identidad visual de ARQ y su animación de apertura y regreso.

### Pantalla inicial del titular

Debe incluir:

1. Encabezado COMPAS.
2. Explicación breve: «Tu dinero, tus reglas».
3. Acción principal: **Crear presupuesto**.
4. Sección **Mis presupuestos**.
5. Resumen de mandatos activos.
6. Sección de actividad reciente, cuando existan movimientos.
7. Estados vacíos útiles cuando todavía no haya mandatos.

Cada tarjeta de presupuesto debería mostrar:

- Propósito.
- Nombre del beneficiario.
- Nombre del delegado.
- Presupuesto originalmente autorizado.
- Capacidad restante.
- Estado.
- Modo estricto o supervisado.
- Fecha de expiración.

Los importes deben respetar `assetCode` y `assetScale` mediante las utilidades de formato existentes.

Nunca presentar `remainingAuthorizedAmount` como dinero depositado en COMPAS.

### Navegación

Desde la pantalla principal, el usuario debe poder abrir:

- Crear presupuesto.
- Detalle del mandato.
- Historial de movimientos del mandato.
- Reglas y autorizaciones.
- Revocar una autorización activa, cuando el backend soporte hacerlo de manera segura.

Mantén la navegación dentro de la aplicación anfitriona.

No conviertas ARQ en una aplicación COMPAS independiente.

---

# 5. SCOPE B — Asistente para crear presupuestos

Implementa un wizard de cinco pasos con validaciones y navegación hacia atrás.

## Paso 1: Participantes

Título sugerido: «¿Para quién es este presupuesto?»

Solicitar:

- Delegado.
- Beneficiario.

El titular se obtiene de la identidad autenticada de la aplicación anfitriona o del contexto de demo controlado, nunca de un campo libre enviado por el navegador en un flujo de producción.

Para el caso de demostración:

- Titular: Pedro.
- Delegada: Andrea.
- Beneficiaria: Gladys.

No exijas que Gladys tenga wallet address, ya que el beneficiario no es el destinatario financiero.

Si todavía no hay sistema de contactos, utiliza exclusivamente participantes de demostración claramente identificados; no finjas una agenda real.

## Paso 2: Propósito

Título: «¿En qué se podrá utilizar?»

Utiliza las categorías existentes:

- `MEDICATION`: Medicamentos.
- `FOOD`: Alimentos.
- `PERSONAL_CARE`: Cuidado personal.
- `ALCOHOL`: Bebidas alcohólicas.
- `TOBACCO`: Tabaco.

Permite elegir las categorías según lo que admite el contrato actual.

No inventes categorías fuera de `COMPAS_CATEGORIES`.

Muestra una explicación breve del propósito seleccionado.

Para el flujo principal de demostración, utiliza `MEDICATION`.

## Paso 3: Presupuesto y vigencia

Título: «¿Cuánto puede gastar y hasta cuándo?»

Solicitar:

- Importe máximo.
- Moneda, derivada de la wallet del titular cuando pueda resolverse.
- Fecha de inicio.
- Fecha de expiración.

Valida:

- Monto positivo.
- Unidades menores correctas.
- Moneda compatible.
- Fecha final posterior a la inicial.
- Ausencia de importes que excedan límites seguros.

El presupuesto es capacidad de gasto autorizada. No se debe solicitar una transferencia inicial a COMPAS o al delegado.

**No introducir presupuestos recurrentes todavía:** el dominio y el esquema actual de mandatos no incorporan un intervalo recurrente completo. Aunque Open Payments soporte `interval`, no debemos mostrar esa opción sin una integración persistente coherente.

## Paso 4: Reglas y confianza

Título: «¿Cómo quieres controlar las compras?»

### Modo estricto

Predeterminado.

Texto sugerido:

«Solo se podrán pagar compras que cumplan las condiciones que establezcas. Si falta información suficiente, el pago no continuará automáticamente».

Mapear a `ENFORCED`.

### Modo supervisado

Alternativa explícita, nunca seleccionada de forma predeterminada.

Texto sugerido:

«Permitirás también compras que no cumplan completamente el propósito. COMPAS registrará las excepciones para que puedas revisarlas después».

Mapear a `MONITORED`.

Mostrar una advertencia específica antes de confirmar este modo.

### Confianza mínima del comercio

Opciones:

- Alta: `HIGH`.
- Media: `MEDIUM`.
- Básica: `LOW`.

Texto comprensible, indicando que confianza más baja permite comercios con evidencia limitada.

Valor predeterminado: `HIGH`.

### Límite adicional

En configuración avanzada, ofrecer `maxDebitBelowHigh`, únicamente para comercios que pasan la política con confianza inferior a `HIGH`.

Validar la moneda y las unidades.

No permitir `CONTESTED` como nivel mínimo aceptable.

## Paso 5: Revisión y autorización

Mostrar resumen completo:

- Titular.
- Delegado.
- Beneficiario.
- Propósito.
- Categorías.
- Presupuesto.
- Vigencia.
- Modo de control.
- Confianza mínima.
- Límite adicional, cuando exista.

Botón principal: **Crear y autorizar presupuesto**.

La operación debe:

1. Validar y guardar el mandato como `DRAFT`.
2. Solicitar la autorización financiera mediante el gateway existente.
3. Pasar a `PENDING_AUTHORIZATION` cuando se inicie el consentimiento.
4. Redirigir al proveedor financiero para que Pedro otorgue consentimiento.
5. Completar el grant mediante el callback existente.
6. Activar el mandato solamente tras una confirmación auténtica del backend y un grant válido.

En caso de rechazo o error, no mostrar el mandato como activo.

Permitir reintentar la autorización cuando el estado lo permita.

No autorizar utilizando un token creado artificialmente en el frontend.

---

# 6. SCOPE C — Mis presupuestos y detalle del mandato

Implementar listado filtrado por el usuario titular.

Mostrar estados comprensibles:

- Borrador.
- Esperando autorización.
- Activo.
- Agotado.
- Vencido.
- Revocado.

Cada presupuesto debe tener pantalla de detalle.

### Secciones

**Resumen**

Presupuesto, gasto confirmado, capacidad de autorización restante, vigencia, delegado, beneficiario y estado.

**Reglas**

Categorías, modalidad de control y confianza exigida.

**Actividad**

Intentos de gasto y operaciones realizadas.

**Administración**

Revocación, cuando esté soportada con garantías suficientes.

### Revocación

Utiliza `cancelPayerGrant()` del gateway existente.

La revocación debe bloquear nuevos intentos de pago en COMPAS inmediatamente y gestionar la cancelación del permiso en el proveedor.

Contempla fallos de comunicación con el proveedor y no muestres «revocado completamente» si todavía hay cancelación remota pendiente.

No implementes modificaciones de un grant activo cambiando directamente su límite o su propósito.

Modificar un presupuesto activo puede requerir una nueva autorización. Déjalo fuera de esta primera versión.

---

# 7. SCOPE D — Pantalla COMPAS en Nequi

Archivo existente:

`frontend/src/features/nequi/NequiCompasShell.tsx`

Corresponde a Andrea, delegada en la historia.

Transforma el placeholder en una experiencia real para consultar autorizaciones recibidas.

### Pantalla principal

Título sugerido: «Tus autorizaciones».

Mostrar:

- Autorizaciones activas recibidas.
- Nombre del titular.
- Beneficiario.
- Propósito.
- Capacidad restante.
- Vigencia.
- Estado.

El usuario debe poder abrir el detalle.

### Detalle

Mostrar:

- Quién concedió el permiso.
- Para quién se puede gastar.
- Qué categorías están permitidas.
- Cuánto queda autorizado.
- Modo estricto o supervisado.
- Confianza de comercios exigida.
- Estado actual.

Explicar que el dinero permanece en la billetera del titular.

### Acceso al pago

Incluye una sección contextual «Pagar con COMPAS».

Sin embargo, **no implementes en esta feature el flujo completo de compra, QR o outgoing payment**.

Si todavía no existe la API correspondiente, muestra claramente que la función de pago requiere conectar el flujo de cobros. No agregues un botón aparentemente funcional que invente un resultado `ALLOW`.

El propósito de esta entrega es que Andrea pueda consultar y entender las autorizaciones que recibió.

### Arquitectura multirrol

No hagas que `payer = ARQ` y `delegate = Nequi` sean reglas rígidas del dominio.

En la demostración esas son las aplicaciones donde aparecen los usuarios, pero una misma persona debería poder ser titular de un mandato y delegada de otro.

La consulta y autorización deben depender de la relación en el mandato.

---

# 8. SCOPE E — Historial de movimientos

Reutiliza:

- `backend/src/domain/spending.ts`
- `backend/src/application/spending-report.ts`
- `backend/src/ports/spending-log.ts`
- `contracts/purchases/README.md`

El historial debe distinguir claramente:

- Compra completada.
- Pago pendiente.
- Pago fallido.
- Compra rechazada.
- Compra retenida para revisión.
- Compra pagada bajo una excepción del modo supervisado.

Utiliza los `PolicyReason` y `PolicyReasonCode` existentes para crear descripciones amigables en español.

Ejemplos:

- `BUDGET_EXCEEDED`: «La compra supera el presupuesto autorizado».
- `MERCHANT_NOT_ELIGIBLE`: «El comercio no cumple las categorías permitidas».
- `CLASSIFICATION_UNCERTAIN`: «Falta información para comprobar la compra».
- `MERCHANT_EVIDENCE_CONFLICT`: «Encontramos información contradictoria sobre el comercio».
- `DELEGATE_NOT_AUTHORIZED`: «Esta autorización pertenece a otra persona».
- `PAYER_MONITORED_EXCEPTION`: «Compra realizada bajo supervisión».

No cambies los códigos técnicos del backend.

### Precisión financiera

El historial actual puede sumar operaciones que tienen outgoing payment aun cuando su estado sea `PENDING`.

Corrige o evita esa interpretación en la capa de presentación:

- «Pagado» debe representar pagos efectivamente completados y reconciliados.
- «En proceso» debe mantenerse separado.
- «Intentado» no significa «debitado».
- Los importes no se deben duplicar.
- El gasto debe expresarse en el activo correspondiente, utilizando el `debitAmount` de Open Payments cuando proceda.

No expongas descripciones sensibles de medicamentos o datos médicos en el historial si el modelo deliberadamente las excluye.

No agregues movimientos ficticios como si provinieran de la red financiera.

---

# 9. SCOPE F — Integración mínima con el backend

Esta parte es obligatoria: el frontend no debe depender exclusivamente de objetos hardcodeados.

### Inspecciona antes de modificar

- `backend/src/api/server.ts`
- `backend/src/api/open-payments-finish.ts`
- `backend/src/ports/mandate-repository.ts`
- `backend/src/ports/grant-store.ts`
- `backend/src/ports/open-payments-gateway.ts`
- `backend/src/integrations/open-payments/`
- `backend/src/application/spending-report.ts`
- `data/migrations/20261017032839_compas_core.sql`

Actualmente existen el dominio y las funciones de Open Payments, pero faltan varias rutas HTTP y adaptadores de persistencia.

Implementa la **mínima capa de aplicación y API necesaria para las vistas anteriores**.

### Operaciones que deben quedar disponibles

- Consultar mandatos del titular.
- Consultar autorizaciones recibidas como delegado.
- Consultar detalle de un mandato.
- Crear un mandato.
- Iniciar el consentimiento del grant.
- Consultar el estado de autorización.
- Revocar un mandato activo.
- Consultar el historial del mandato.

Propón y documenta contratos HTTP claros, como:

```text
GET  /mandates?role=payer
GET  /mandates?role=delegate
GET  /mandates/:id
POST /mandates
POST /mandates/:id/authorize
POST /mandates/:id/revoke
GET  /mandates/:id/spending
```

Estas rutas son un diseño objetivo, **no afirmaciones de que existan actualmente**.

Puedes ajustar los nombres tras inspeccionar los contratos existentes, pero mantén coherencia y documenta la versión final.

La identidad del usuario debe obtenerse del backend autenticado, nunca confiar exclusivamente en un `payerId` o `delegateId` suministrado por el navegador.

### Grant y consentimiento

Reutiliza los métodos existentes:

- `startPayerGrant`
- `finishPayerGrant`
- `cancelPayerGrant`
- `readGrantSpentAmounts`

No dupliques el SDK ni crees un segundo gateway.

No expongas access tokens, continuation tokens ni claves privadas.

El callback existente `/open-payments/finish` debe seguir funcionando.

No consideres `payerAuthorization=granted` en una URL como prueba suficiente por sí sola. Verifica el estado auténtico y persistido del grant en el backend.

### Persistencia

El proyecto tiene una migración inicial aplicada según `data/schema/README.md`, aunque el runtime todavía utiliza almacenamiento en memoria.

Prioriza reutilizar el esquema `compas` y los puertos existentes.

Si hay una conexión PostgreSQL configurada y accesible:

1. Implementa los adaptadores mínimos necesarios.
2. Utiliza las tablas existentes.
3. Mantén acceso exclusivamente desde el backend.
4. No expongas el esquema mediante Supabase Data API.
5. No modifiques tablas sin necesidad.
6. Si hacen falta migraciones adicionales, créalas de manera incremental y documentada; no ejecutes cambios destructivos ni alteres la base compartida sin autorización.

Si faltan las credenciales de conexión:

- No las inventes.
- No solicites secretos dentro del código fuente.
- Implementa, si es necesario, un modo local de demostración explícito y aislado.
- Identifica visualmente el modo de demostración.
- Deja completamente documentado qué integración PostgreSQL no pudo verificarse.
- No presentes datos en memoria como persistencia real.

**La falta de credenciales no debe detener todo el desarrollo visual y funcional que sí pueda realizarse.**

### Identidad de demostración

El proyecto no tiene todavía un sistema completo de autenticación de usuarios.

Si necesitas simular las identidades de Pedro y Andrea, construye un mecanismo de demostración restringido y explícito, separado de la autenticación de producción.

No permitas que una simple modificación de un identificador en el navegador se convierta en autorización válida para fondos reales.

No conectes ese mecanismo de demostración a pagos reales fuera del entorno de prueba controlado.

---

# 10. SCOPE G — Componentes compartidos del frontend

Crea componentes reutilizables para:

- Tarjeta de mandato.
- Etiqueta de estado.
- Resumen de presupuesto.
- Formulario de participantes.
- Selector de categorías.
- Selector de modo estricto/supervisado.
- Selector de confianza.
- Resumen de autorización.
- Historial de movimientos.
- Vistas vacías.
- Estados de carga y error.
- Confirmaciones de acciones sensibles.

Una ubicación sugerida:

`frontend/src/features/compas/`

Crea un cliente tipado de API y hooks separados de la UI.

No copies lógica de negocio financiera al frontend.

### Identidad visual

Las pantallas deben encajar visualmente dentro de sus aplicaciones anfitrionas:

- ARQ conserva sus colores y convenciones.
- Nequi conserva sus colores y convenciones.
- COMPAS mantiene una identidad reconocible y consistente.
- Los componentes de negocio son compartidos, con variantes de presentación según la aplicación.

Conserva:

- Las animaciones existentes.
- La navegación hacia atrás.
- La restauración del foco.
- La compatibilidad móvil.
- El funcionamiento de `/demo`, `/arq` y `/nequi`.

Usa textos en español colombiano, naturales y fáciles de entender.

No expongas expresiones como `GrantStore`, `MerchantConfidencePolicy` o `debitAmount` directamente al usuario.

---

# 11. Fuera de alcance: prohibiciones explícitas

NO implementar en esta rama:

1. Una aplicación Android.
2. NFC o HCE.
3. Tarjetas bancarias o integración EMV.
4. Integración real con Bre-B.
5. Integraciones de producción con ARQ o Nequi.
6. Sistema de clasificación IA nuevo.
7. Reescritura de la matriz de confianza.
8. Nuevo gateway Open Payments.
9. Un nuevo servidor Rafiki.
10. Sistema de pagos empresariales, ONG o gubernamentales.
11. Split tender o pagos parciales.
12. Módulo completo de cobros del comercio.
13. Autorización de compras mediante lógica en React.
14. Cambio de moneda mediante tasas inventadas.
15. Nuevos grants para modificar silenciosamente presupuestos activos.
16. Cambios destructivos de Supabase.

**No modificar el flujo de pago existente para adaptar la UI. La UI debe integrarse con sus contratos.**

---

# 12. Límites de archivos y responsabilidades

### Modificaciones permitidas

Frontend:

- `frontend/src/features/arq/ArqCompasShell.tsx`
- `frontend/src/features/nequi/NequiCompasShell.tsx`
- Nuevos componentes bajo `frontend/src/features/compas/`
- Nuevos clientes o hooks bajo `frontend/src/lib/` o una estructura equivalente
- Tipos, utilidades y pruebas asociadas
- Cambios mínimos de navegación en `ArqExperience.tsx` y `NequiExperience.tsx`
- Ajustes estrictamente necesarios de `/demo`

Backend:

- Nuevos controladores en `backend/src/api/`
- Nuevos casos de uso para mandatos en `backend/src/application/`
- Adaptadores para los repositorios existentes
- Interfaces o contratos estrictamente necesarios
- Pruebas de esas funcionalidades

Documentación:

- `contracts/`
- `docs/`
- `prompts/`
- `AI_USAGE.md`

Persistencia:

- Nuevos adaptadores de PostgreSQL
- Migraciones incrementales, solamente si son indispensables

### No modificar sin necesidad justificada

- `backend/src/integrations/open-payments/interledger-open-payments-gateway.ts`
- `backend/src/policy/evaluate-purchase.ts`
- `backend/src/policy/trust-matrix.ts`
- `backend/src/integrations/merchant-registry/`
- `frontend/src/features/nequi-business/`
- Archivos que estén siendo editados por otros compañeros

Si identificas un defecto en uno de esos módulos, documenta el problema e implementa la solución más limitada que no comprometa el trabajo paralelo.

No realices refactorizaciones generales.

---

# 13. Experiencia compartida y consistencia

El mismo mandato debe aparecer correctamente según el rol.

Ejemplo:

Pedro crea el mandato:

```text
Mandato: Medicamentos para Gladys
Titular: Pedro
Delegada: Andrea
Presupuesto: USD 40
Categoría: MEDICATION
Modo: ENFORCED
Confianza mínima: HIGH
Estado: ACTIVE
```

En ARQ:

Pedro lo ve dentro de «Mis presupuestos», con sus acciones administrativas.

En Nequi:

Andrea lo ve dentro de «Autorizaciones recibidas», con sus condiciones de uso.

No debe ser necesario duplicar manualmente el mandato para cada interfaz.

Cuando ambas pantallas están conectadas a la API, deben consultar una fuente de estado compartida.

La vista de Andrea no debe permitir revocar ni alterar una autorización concedida por Pedro.

Si el mandato se revoca, Andrea debe ver su estado actualizado y no poder utilizarlo.

---

# 14. Pruebas y criterios de aceptación

Implementa las pruebas que correspondan.

### Backend

Probar:

- Creación válida de mandato.
- Monto inválido.
- Vigencia inválida.
- Categoría no reconocida.
- Confianza inválida.
- `ENFORCED` por defecto.
- `MONITORED` mediante consentimiento explícito.
- Solo el titular puede iniciar la autorización.
- Solo el titular puede revocarla.
- Un delegado consulta sus propios mandatos.
- Un usuario ajeno no consulta un mandato de terceros.
- Consentimiento rechazado.
- Callback inválido o manipulado.
- Grant no configurado.
- Transiciones de estado.
- Revocación repetida.
- Datos sensibles no expuestos.
- El historial no presenta pagos pendientes como completados.

### Frontend

Probar:

- Apertura y cierre de COMPAS en ARQ.
- Apertura y cierre de COMPAS en Nequi.
- Wizard completo.
- Validaciones.
- Persistencia de navegación durante el formulario.
- Listados.
- Detalle.
- Estados vacíos.
- Estados de carga y errores.
- Visualización diferenciada según rol.
- Comportamiento móvil.
- Navegación accesible.

### Prueba de integración

En un entorno configurado, debe ser posible:

1. Abrir COMPAS en ARQ.
2. Crear un mandato para Andrea y Gladys.
3. Guardar sus reglas.
4. Iniciar el consentimiento financiero.
5. Confirmar el grant con el proveedor de prueba.
6. Visualizar el mandato activo.
7. Abrir COMPAS en Nequi.
8. Consultar la autorización recibida.
9. Visualizar sus condiciones.
10. Revocarla como Pedro.
11. Comprobar que Andrea ya no tiene una autorización activa.

Si el entorno no permite completar la autenticación financiera o acceder a PostgreSQL, documenta exactamente qué pasos se verificaron y cuáles quedaron pendientes.

No afirmes que una prueba end-to-end real pasó si solo funcionaron mocks.

---

# 15. Verificaciones técnicas obligatorias

Ejecuta los comandos correspondientes según los scripts reales del repositorio.

Como mínimo:

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Backend:

```bash
cd backend
npm run typecheck
npm test
```

Si existen verificaciones adicionales del hackathon, ejecútalas.

No elimines pruebas para conseguir una compilación exitosa.

Corrige errores que hayas introducido.

Si hay errores anteriores a esta feature, repórtalos y separa claramente su origen.

---

# 16. Documentación y cumplimiento

Documenta:

- Arquitectura de la experiencia COMPAS.
- Flujo de creación de mandatos.
- Consentimiento Open Payments.
- Lectura de autorizaciones por delegado.
- Estados de mandatos.
- Endpoints creados.
- Persistencia implementada.
- Limitaciones del modo de demostración.
- Funciones pendientes de la futura integración de pagos y cobros.

Registra este prompt en `prompts/`, utilizando la siguiente numeración disponible y respetando los nombres existentes.

Actualiza `AI_USAGE.md` sin sobrescribir registros anteriores.

Sigue las instrucciones de las skills del repositorio y de las reglas del hackathon.

---

# 17. Orden de ejecución obligatorio

Trabaja en estas fases:

**Fase 1 — Auditoría**

Inspecciona el repositorio, crea la rama, identifica contratos existentes y documenta brevemente la arquitectura que vas a utilizar.

**Fase 2 — Contratos y backend**

Implementa los casos de uso, APIs y repositorios mínimos para gestionar mandatos y consultar autorizaciones.

**Fase 3 — Experiencia ARQ**

Implementa la pantalla COMPAS de Pedro, el asistente de creación y el detalle de presupuestos.

**Fase 4 — Experiencia Nequi**

Implementa autorizaciones recibidas para Andrea, reutilizando los componentes de negocio.

**Fase 5 — Historial y administración**

Conecta movimientos y revocación con sus estados reales.

**Fase 6 — Integración y pruebas**

Verifica que las dos experiencias funcionen coherentemente y que no haya regresiones.

**Fase 7 — Documentación**

Registra decisiones, archivos, pruebas, limitaciones y siguientes pasos.

No dediques tiempo a funcionalidades excluidas antes de completar los criterios principales.

No detengas la implementación para solicitar aprobación sobre detalles visuales menores. Utiliza decisiones razonables coherentes con el diseño existente.

---

# 18. Entregables finales

Al terminar, proporciona un informe con:

1. Rama creada y commit base.
2. Estado de Git.
3. Arquitectura resultante.
4. Lista de archivos modificados.
5. Pantallas implementadas.
6. Flujos de negocio implementados.
7. APIs disponibles.
8. Persistencia utilizada.
9. Integración con grants.
10. Estado del modo de demostración.
11. Pruebas ejecutadas y resultados.
12. Limitaciones y dependencias pendientes.
13. Instrucciones para ejecutar la aplicación.
14. Cambios que necesitará el equipo de Open Payments o el módulo de comercios.
15. Recomendación sobre el momento apropiado para integrar esta rama a `main`.

Distingue explícitamente:

- **IMPLEMENTADO Y PROBADO**
- **IMPLEMENTADO, NO VERIFICADO**
- **SIMULADO**
- **PENDIENTE**

No realices commits o pushes automáticamente.

---

# 19. Definición final de éxito

Esta feature estará completa cuando:

**Pedro** pueda abrir COMPAS, configurar un presupuesto con reglas, consultar su estado y administrarlo de acuerdo con las capacidades disponibles del backend.

**Andrea** pueda abrir COMPAS desde su aplicación y consultar las autorizaciones que recibió de forma coherente con lo que creó Pedro.

**El sistema** distinga correctamente un mandato de un grant, una autorización de un saldo y una decisión de política de un pago ejecutado.

**El frontend y el backend** utilicen contratos compartidos sin duplicar la lógica financiera.

**El proyecto existente** siga funcionando, con sus tres interfaces anfitrionas, sus políticas y su gateway Open Payments intactos.

La experiencia debe estar diseñada para ampliarse posteriormente con los cobros del comercio y las compras completas, pero no debe intentar implementar esas funcionalidades en esta rama.

**Comienza ahora con la inspección de Git, selecciona la base actualizada, crea la rama `feature/compas-experience` y ejecuta las fases hasta dejar una implementación funcional y verificable.**
````
