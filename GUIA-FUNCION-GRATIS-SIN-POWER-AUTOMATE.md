# Registrar sin Power Automate y sin costo: función propia gratis

Esta guía reemplaza el camino de Power Automate (que requiere una licencia
Premium que hoy nadie tiene en la ENAP) por una función pequeña, gratis, que
ya le dejé escrita en su proyecto. Hace exactamente lo mismo que iba a hacer
el flujo — escribir el lote en el Excel real y mandar el correo — pero corre
gratis en Vercel, en lugar de Power Automate.

**Lo mejor:** no hay que tocar nada de la app ni de cómo la usan los jefes de
programa. Solo cambia una URL en el panel de Administración.

## Cómo va a quedar

- La app le sigue mandando el mismo JSON de siempre (el mismo que iba a
  recibir Power Automate) — eso no cambió.
- En vez de llegarle a Power Automate, le llega a un archivo nuevo que ya
  agregué a su proyecto: `api/registrar.js`. Ese archivo se publica junto con
  el resto de la app cuando corre `npx vercel --prod`, y Vercel lo convierte
  automáticamente en su propia dirección web (algo como
  `https://auditoria-xertify.vercel.app/api/registrar`).
- Esa función se autentica sola con Microsoft — no como una persona que
  inicia sesión, sino como una "aplicación" — y desde ahí escribe en Tabla3 y
  manda el correo, usando la cuenta `jestadisticaplen@enap.edu.co` como
  remitente.
- Nadie necesita licencia de Power Automate, ni Premium, ni nada por el
  estilo. Todo lo que usa esta función es gratis: Vercel (su plan actual),
  Microsoft Graph (incluido en cualquier cuenta de Microsoft 365) y el App
  Registration en Entra ID (también gratis — es solo un permiso, no una
  licencia).

## Lo que hay que hacer, en orden

### Paso 1 — Pedirle a TIC que habilite el permiso de aplicación

Ya existe el App Registration de su proyecto (`Auditoría Xertify`, Client ID
`be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6` — el mismo que usa hoy el modo
"Microsoft Graph"). Solo hay que agregarle un permiso nuevo y un secreto;
no hay que crear nada desde cero. Mándele este mensaje a TIC:

> Para el App Registration "Auditoría Xertify" (Client ID
> `be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6`) en Microsoft Entra ID, necesito dos
> cosas:
>
> 1. **Un secreto de cliente nuevo**: en el registro → "Certificados y
>    secretos" → "Nuevo secreto de cliente" → cualquier descripción, vigencia
>    de 12 o 24 meses. Necesito el **valor** del secreto apenas se genere
>    (solo se muestra una vez).
> 2. **Un permiso de aplicación (no delegado) de Microsoft Graph**:
>    "Permisos de API" → "Agregar un permiso" → "Microsoft Graph" →
>    **"Permisos de aplicación"** (no "Permisos delegados") → agregar
>    `Sites.Selected`. Si `Sites.Selected` da complicaciones, como
>    alternativa más simple (pero de alcance más amplio) sirve
>    `Files.ReadWrite.All` de aplicación.
> 3. Para el envío de correos, agregar también el permiso de aplicación
>    `Mail.Send`.
> 4. Dar **consentimiento de administrador** a esos permisos nuevos (el
>    mismo botón que ya usan para los permisos delegados existentes).
>
> Si usaron `Sites.Selected`, falta un paso adicional puntual: conceder
> acceso de escritura sobre el sitio de SharePoint/OneDrive donde vive el
> archivo `Base de Datos Cursos de Extensión.xlsx` (el de la cuenta
> jestadisticaplen), a esta aplicación puntual. Ese paso no se hace desde el
> portal de Azure sino con una llamada a Microsoft Graph; les puedo pasar el
> comando exacto si me confirman que optaron por `Sites.Selected`.

Guarde el secreto que le entreguen en un lugar seguro (no lo pegue en el
código ni lo comparta por correo sin cifrar) — lo va a necesitar en el
Paso 3.

### Paso 2 — Nada que buscar: solo el correo y la ruta del archivo

A diferencia de la primera versión de esta guía, ya no hace falta ir a
Graph Explorer a buscar ningún identificador largo. La función resuelve
sola el archivo — igual que hace el Portal de Solicitud de Certificados de
la Escuela — a partir de dos datos que usted ya conoce:

- La cuenta dueña del OneDrive: `jestadisticaplen@enap.edu.co`.
- La ruta del archivo dentro de ese OneDrive, tal como se ve en la
  dirección de OneDrive/SharePoint, por ejemplo:
  ```
  Estadística/Bases de Datos/BD Cursos de Ley - Cursos de Extensión/Base de Datos Cursos de Extensión.xlsx
  ```

Ambos van directo al Paso 3, sin pasos intermedios.

### Paso 3 — Cargar todo en Vercel (sin tocar código)

1. Vaya a [vercel.com](https://vercel.com) e inicie sesión con la cuenta que
   ya usa para publicar la app.
2. Entre al proyecto (por ejemplo `auditoria-xertify`).
3. Vaya a **Settings → Environment Variables**.
4. Agregue, una por una (marcando "Production" al menos):

   | Nombre | Valor |
   |---|---|
   | `GRAPH_TENANT_ID` | El mismo Tenant ID que ya usa en Administración → Microsoft Graph |
   | `GRAPH_CLIENT_ID` | `be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6` |
   | `GRAPH_CLIENT_SECRET` | El secreto que le dio TIC en el Paso 1 |
   | `GRAPH_UPN_DRIVE` | `jestadisticaplen@enap.edu.co` |
   | `GRAPH_RUTA_ARCHIVO` | `Estadística/Bases de Datos/BD Cursos de Ley - Cursos de Extensión/Base de Datos Cursos de Extensión.xlsx` |
   | `GRAPH_TABLE_ID` | `Tabla3` |
   | `GRAPH_MAIL_FROM` | `jestadisticaplen@enap.edu.co` |
   | `API_KEY` | Invente una clave larga y difícil de adivinar (por ejemplo, generada en [1password.com/password-generator](https://1password.com/password-generator) o similar) |

5. Vuelva a publicar para que tome las variables nuevas:
   ```
   npx vercel --prod
   ```

### Paso 4 — Apuntar la app a la nueva función

1. Abra la app publicada → engranaje (⚙) → Administración.
2. Elija el modo **"Power Automate"** (sí, se sigue llamando así en la app,
   pero ya no va a Power Automate).
3. En **"URL del flujo (HTTP request)"**, pegue:
   ```
   https://SU-DOMINIO-DE-VERCEL.vercel.app/api/registrar
   ```
   (reemplace por el dominio real que le dio Vercel).
4. En el campo de la clave (si la app se lo pide, o en la variable
   `VITE_WEBHOOK_KEY` del `.env`), ponga la misma clave que puso en `API_KEY`
   en el Paso 3 — así la función rechaza cualquier solicitud que no venga de
   su propia app.
5. **Guardar**.

### Paso 5 — Probar de punta a punta

1. Cargue una plantilla, llene facultad, responsable y correo, y dé
   **"Generar registro oficial"**.
2. No debe pedirle iniciar sesión a nadie.
3. Revise que la fila haya quedado en `Tabla3`.
4. Revise que el correo haya llegado, con remitente
   `jestadisticaplen@enap.edu.co`.
5. Si algo falla, la respuesta de la app va a traer el mensaje de error
   exacto (por ejemplo "Faltan GRAPH_UPN_DRIVE..." si algo quedó sin
   configurar en Vercel, "No se encontró el archivo de Excel..." si la ruta
   no coincide exactamente con la de OneDrive, o el detalle que devuelva
   Microsoft Graph) — mándeme ese mensaje y seguimos desde ahí.

## Endurecer la seguridad del envío de correos (opcional, recomendado)

El permiso `Mail.Send` de aplicación, tal como queda en el Paso 1, le
permite a esta función mandar correo **desde cualquier buzón de la
organización**, no solo desde `jestadisticaplen`. Para acotarlo a que solo
pueda enviar como esa cuenta puntual, pídale a TIC este paso adicional
(requiere PowerShell de Exchange Online, lo hacen ellos una sola vez):

> ¿Podrían crear una "Application Access Policy" en Exchange Online que
> limite el permiso Mail.Send de la aplicación con Client ID
> `be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6` únicamente al buzón
> `jestadisticaplen@enap.edu.co`? Es el cmdlet `New-ApplicationAccessPolicy`
> de Exchange Online PowerShell.

No es obligatorio para que todo funcione, pero es la diferencia entre "esta
aplicación puede escribirle a un archivo puntual y mandar correo desde una
cuenta puntual" y "esta aplicación puede tocar cualquier buzón" — vale la
pena pedirlo.

---

**Resumen de lo que falta, en orden:**
1. Pedirle a TIC el secreto y los permisos de aplicación (Paso 1).
2. Tener a mano el correo dueño del OneDrive y la ruta del archivo (Paso 2).
3. Cargar las variables en Vercel y republicar (Paso 3).
4. Pegar la nueva URL en Administración (Paso 4).
5. Probar un registro completo (Paso 5).

Avíseme en qué paso queda y seguimos desde ahí.
