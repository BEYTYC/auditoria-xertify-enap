# Publicar la app en Vercel y conectarla al Excel real de SharePoint

Esta guía la lleva de la mano por los tres pasos que faltan: subir la app a una dirección web fija, crear el permiso de Microsoft (App Registration) y cargar esos datos en la app. Como ya tiene cuenta en Vercel y acceso a Azure/Entra, no hay que pedirle nada a nadie más.

## Paso 1 — Publicar en Vercel (dirección web fija)

Necesita esto una sola vez; después, cuando le mande correcciones, solo hay que repetir el último comando.

1. Si no tiene Node.js instalado en su computador, descárguelo de [nodejs.org](https://nodejs.org) (la versión LTS) e instálelo.
2. Descomprima el archivo `auditor-certificados.zip` que le envié, en una carpeta cualquiera.
3. Abra una terminal (en Windows: clic derecho dentro de esa carpeta → «Abrir en Terminal», o busque «cmd»/«PowerShell» y navegue ahí con `cd`).
4. Ejecute:
   ```
   npx vercel login
   ```
   e inicie sesión con la cuenta de Vercel que ya tiene (correo o GitHub).
5. Ejecute:
   ```
   npx vercel --prod
   ```
   Responda las preguntas: acepte crear un proyecto nuevo, póngale un nombre (por ejemplo `auditoria-xertify`) y deje que detecte el framework solo (Vite).
6. Al terminar le entrega una URL fija, algo como:
   ```
   https://auditoria-xertify.vercel.app
   ```
   **Anote esa dirección exacta** (con `https://`, sin barra `/` al final) — la necesita en el paso 2.

> Para actualizaciones futuras que yo le mande: descomprima el zip nuevo sobre la misma carpeta (o pídame el zip y repita desde el paso 3) y vuelva a correr `npx vercel --prod` desde ahí. La dirección web no cambia.

## Paso 2 — Ese App Registration ya existe: solo hay que actualizarlo

Revisando el proyecto encontré que esto ya se había hecho antes: el archivo de configuración trae guardados un **Client ID** y un **Tenant ID** reales, con una nota de que «los identificadores ya están registrados en Entra ID» y que se dejó en modo local *«hasta que la Dirección de TIC conceda el consentimiento de administrador»*. O sea que no hay que crear nada nuevo — solo abrir ese registro que ya existe y corregirle la dirección de vuelta, que quedó puesta como `http://localhost:5173` (la de pruebas) en vez de la real.

1. Vaya a [portal.azure.com](https://portal.azure.com) → **«Microsoft Entra ID»** → **«Registros de aplicaciones»**.
2. Busque el registro cuyo **Id. de aplicación (cliente)** sea:
   ```
   be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6
   ```
   (o por nombre, algo como «Auditoría Xertify» o similar).
3. Entre a **«Autenticación»** en el menú de la izquierda.
4. Bajo la plataforma **«Aplicación de una página (SPA)»**, debe haber una URI de redirección `http://localhost:5173`. Dos opciones, cualquiera sirve:
   - **Reemplácela** por la URL real de Vercel del paso 1, o
   - **Agregue** la URL de Vercel como una URI adicional (con «Agregar URI») y deje o borre la de `localhost` según si todavía la usa para pruebas locales.
5. **Guardar**.
6. Confirme que en **«Permisos de API»** ya estén (o agréguelos si faltan) estos dos permisos delegados de Microsoft Graph: `Files.ReadWrite.All` y `Sites.ReadWrite.All`.
7. Revise si el botón **«Conceder consentimiento de administrador para ENAP»** ya está en verde (concedido) o si toca hacer clic ahí. Si no le aparece o le da error de permisos, pregúntele a la Dirección de TIC si ya dieron ese consentimiento — la nota en la configuración indica que quedó pendiente de ellos. Mientras no esté, la app puede seguir funcionando igual: la primera vez que cada persona use el registro, Microsoft le pedirá aceptar esos permisos a título personal, y con eso basta para que esa persona registre.

Ya no hace falta copiar Client ID ni Tenant ID a mano: ambos ya quedaron guardados en la configuración de la app (paso 3).

## Paso 3 — Cargar esos datos en la app (sin tocar código)

1. Abra la app ya publicada (la URL de Vercel del paso 1).
2. Clic en el engranaje (⚙, arriba a la derecha) para abrir **Administración**.
3. Elija el modo **«Microsoft Graph»**.
4. Llene:
   - **Client ID (aplicación)** → el «Id. de aplicación (cliente)» del paso 2.
   - **Tenant ID (directorio)** → el «Id. de directorio (inquilino)» del paso 2.
   - **Cuenta dueña del archivo** → el correo de quien tiene el Excel en su OneDrive/SharePoint.
   - **Ruta del archivo en su OneDrive** → la ruta que ya tiene identificada (por ejemplo `Estadística/Bases de Datos/Base de Datos Cursos de Extensión.xlsx`).
   - **Tabla**: `Tabla3` (ya viene así por defecto).
   - **Hoja**: `Libro No. 2` (ya viene así por defecto).
5. Clic en **«Probar conexión»**: debe leer las columnas de la tabla y la última posición del libro. Si sale un error, casi siempre es la ruta del archivo mal escrita o que a esa cuenta le falta compartir el archivo con quien va a iniciar sesión.
6. **«Guardar»**.

## Paso 4 — Probar el registro real

1. Cargue una plantilla, llene facultad, responsable y correo, y dé **«Generar registro oficial»**.
2. Va a abrir una ventana de Microsoft pidiendo iniciar sesión (con la cuenta institucional de quien esté usando la app en ese momento) — esta vez sí debe funcionar, porque ya no vuelve a una dirección de prueba: vuelve a la URL real de Vercel.
3. Al aceptar, el registro debe quedar escrito directamente en la fila siguiente de `Tabla3`.

---

**Si algo falla en el camino** (la conexión de prueba del paso 3, o el login del paso 4), mándeme la captura del error exacto y seguimos desde ahí — la mayoría de estos errores dicen justo qué dato quedó mal.
