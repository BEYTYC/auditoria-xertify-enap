# Puesta en marcha

**Registro de Cursos de Extensión** · Escuela Naval de Cadetes «Almirante Padilla» ·
Oficina de Estadística

Este documento explica cómo pasar de la aplicación que ya funciona en modo local a
la aplicación conectada con la Base de Datos en SharePoint, y dónde publicarla para
que las facultades la usen.

---

## Antes de empezar

La aplicación es una página web que corre **entera en el navegador**. No hay
servidor, no hay base de datos propia, no hay usuarios ni contraseñas que
administrar: el único dato que sale del computador es la fila que se anexa a
`Tabla3`, y sale con la sesión de Microsoft de quien está usando la aplicación.

Eso tiene una consecuencia útil: quien no tenga permiso sobre el archivo en
SharePoint tampoco lo tendrá desde aquí. Los permisos siguen siendo los de
siempre, administrados donde siempre.

---

## Paso 1 · Dónde va a vivir la aplicación

Tres caminos, de menor a mayor esfuerzo. El primero ya sirve para trabajar.

### A. El archivo suelto (hoy mismo, sin nadie más)

`Registro de Cursos de Extensión — ENAP.html` es la aplicación completa en un solo
archivo. Se abre con doble clic y funciona sin conexión: audita, corrige y descarga
el Excel corregido. Guarda el registro en el navegador, no en SharePoint.

Sirve para empezar y para usarlo la Oficina de Estadística mientras se decide el
resto. Su límite: cada computador lleva su propia bitácora, y la numeración del
libro sale del último valor conocido en lugar de leerse de la base.

> Para Microsoft Graph este camino **no** sirve: el inicio de sesión de Microsoft
> exige una dirección `https://…`, y un archivo abierto con doble clic no la tiene.

### B. Un sitio interno (lo recomendado)

Publicar el contenido de `dist/` —la carpeta que genera `npm run build`— en
cualquier lugar que sirva páginas por `https`:

- **Azure Static Web Apps**, si la Escuela ya tiene suscripción de Azure. Es
  gratuito en su nivel básico y da una dirección `https` de inmediato.
- **IIS** en un servidor de la Escuela, publicando la carpeta como sitio.
- **SharePoint Online** no sirve para esto: guarda el `.html` como archivo y lo
  ofrece para descargar en vez de ejecutarlo.

Quedaría en algo como `https://cursos.enap.edu.co` o
`https://registro-extension.azurestaticapps.net`. Esa dirección es la que hay que
anotar: se usa en el paso siguiente.

### C. Dentro de una aplicación de Teams

Es el mismo sitio del punto B, incrustado como pestaña en un canal de Teams. Se
hace después, cuando el sitio ya exista; no cambia nada de la configuración.

---

## Paso 2 · Registrar la aplicación en Entra ID

Lo hace quien administre el tenant `enap.edu.co` (Dirección de TIC). Toma unos
diez minutos.

1. Entrar a **portal.azure.com** → *Microsoft Entra ID* → **Registros de
   aplicaciones** → **Nuevo registro**.
2. **Nombre**: `Registro de Cursos de Extensión — ENAP`.
3. **Tipos de cuenta admitidos**: *Solo cuentas en este directorio organizativo*.
4. **URI de redirección**: elegir la plataforma **SPA** —no «Web»— y escribir la
   dirección del paso 1B, por ejemplo `https://cursos.enap.edu.co`. Si también se
   va a usar en pruebas locales, agregar después `http://localhost:5173`.
5. **Registrar**.

Ya en la aplicación creada:

6. **Información general** → copiar el **Id. de aplicación (cliente)** y el
   **Id. de directorio (inquilino)**. Son los dos primeros datos que pide la app.
7. **Permisos de API** → **Agregar un permiso** → *Microsoft Graph* → **Permisos
   delegados** → marcar:
   - `Files.ReadWrite.All`
   - `Sites.ReadWrite.All` (solo si el archivo se mueve a una biblioteca de sitio;
     hoy vive en OneDrive y no hace falta)
   - `User.Read` ya viene incluido.
8. **Conceder consentimiento del administrador**. En esta Escuela **este paso es
   obligatorio**: el inquilino tiene deshabilitado el consentimiento de usuario
   —se comprobó al intentar abrir Graph Explorer, que respondió «Se necesita la
   aprobación del administrador»—. Sin ese clic, la aplicación no podrá iniciar
   sesión. El botón solo se habilita para quien tenga el rol de **Administrador
   global** o **Administrador de aplicaciones en la nube**.

> **Permisos delegados, no de aplicación.** La aplicación escribe *en nombre de
> quien la usa*, no con una identidad propia. Así el rastro de auditoría en
> SharePoint queda con el nombre de la persona que registró el lote, que es lo que
> corresponde para un libro oficial.

---

## Paso 3 · Indicar el archivo

**No hace falta Graph Explorer.** La Escuela lo tiene bloqueado para los usuarios
corrientes —aparece «Se necesita la aprobación del administrador»—, así que la
aplicación resuelve sola los identificadores: basta decirle **de quién es el
archivo** y **dónde está**.

```
Cuenta dueña : jestadisticaplen@enap.edu.co
Ruta         : Estadística/Bases de Datos/BD Cursos de Ley - Cursos de Extensión/Base de Datos Cursos de Extensión.xlsx
```

Con eso, al probar la conexión la aplicación consulta ella misma
`/users/{cuenta}/drive/root:/{ruta}`, obtiene el drive y el item, y sigue
trabajando con ellos. Si algún día ya se tienen los identificadores a mano, se
pueden escribir directamente y la aplicación los usa sin resolver nada.

Quien use la aplicación debe tener permiso sobre ese archivo: los permisos son
los de SharePoint, no unos propios.

---

## Paso 4 · Configurar la aplicación

Dos formas, equivalentes:

**Desde la propia aplicación** (sin recompilar nada): botón de engranaje arriba a
la derecha → *Microsoft Graph* → pegar los cuatro datos → **Probar conexión**. La
configuración queda guardada en ese navegador.

**En el archivo `.env`** (para que venga configurada de fábrica), antes de
`npm run build`:

```env
VITE_SHAREPOINT_MODE=graph
VITE_GRAPH_CLIENT_ID=be68b5b7-e7eb-45e2-98f4-e5ffd88b8ce6
VITE_GRAPH_TENANT_ID=f53f66b3-ea23-461a-b6ff-01654042a799
VITE_GRAPH_OWNER_UPN=jestadisticaplen@enap.edu.co
VITE_GRAPH_FILE_PATH=Estadística/Bases de Datos/BD Cursos de Ley - Cursos de Extensión/Base de Datos Cursos de Extensión.xlsx
VITE_GRAPH_TABLE_ID=Tabla3
VITE_GRAPH_WORKSHEET=Libro No. 2
VITE_GRAPH_REDIRECT_URI=https://cursos.enap.edu.co
```

Los dos identificadores de la aplicación ya son los reales: el registro en Entra
ID quedó creado el 5 de septiembre de 2026 con el nombre
*Registro de Cursos de Extensión — ENAP*. El archivo `.env` del proyecto ya viene
con ellos; solo hay que cambiar la primera línea a `graph` cuando TIC conceda el
consentimiento.

**Probar conexión** debe responder con el número de columnas de la tabla y con la
última posición del libro leída del archivo. Si responde eso, ya está: la
numeración deja de depender del valor guardado y sale del libro real.

---

## Paso 5 · Si TIC prefiere no crear la aplicación

Existe el camino B, sin registro en Entra ID: **Power Automate**.

1. Crear un flujo con el disparador **«Cuando se recibe una solicitud HTTP»**.
2. Esquema del cuerpo: un objeto con `filas`, una lista de objetos con las
   columnas de `Tabla3`.
3. Agregar **«Aplicar a cada uno»** sobre `filas` con la acción **«Agregar una
   fila a una tabla»** de Excel Online, apuntando al archivo y a `Tabla3`.
4. Guardar: el disparador entrega una URL larga.
5. Pegarla en Ajustes → *Power Automate*.

Ventaja: no hace falta tocar Entra ID; el flujo corre con la cuenta de quien lo
creó. Desventaja: la aplicación no puede leer la última posición del libro —el
flujo no la devuelve—, así que la numeración arranca del último valor conocido, y
todos los asientos quedan a nombre del dueño del flujo, no de quien registró.

---

## Paso 6 · Poner a andar la oficina

1. **La Oficina de Estadística primero.** Registrar dos o tres lotes reales, uno
   pequeño, y comprobar en el archivo de SharePoint que las filas quedaron donde
   debían y que la numeración siguió la serie.
2. **Después las facultades.** Se les pasa la dirección del sitio. No necesitan
   instalar nada ni tener permisos especiales: el registro lo sigue haciendo la
   Oficina de Estadística; ellas cargan la plantilla, ven sus errores y la corrigen.
3. **La bitácora es por navegador.** Cada equipo guarda la suya. El bloqueo de
   lotes repetidos también consulta las últimas 600 filas de la base, así que ve lo
   que registró otra persona en otro computador.

---

## Mantenimiento

**Cuando cambie el archivo de la base** —se traslada, se renombra, se abre un
libro nuevo— hay que actualizar `ITEM_ID` (y `DRIVE_ID` si cambió de biblioteca).
Todo lo demás sigue igual.

**Cuando aparezca la columna `DIRECTOR FIRMANTE`** en `Tabla3`, la aplicación la
detecta sola y empieza a escribir `nomfirma3` sin tocar nada.

**Cuando una facultad traiga una plantilla nueva**, no hay que reprogramar: la
aplicación lee por el nombre del encabezado, y el panel *Columnas leídas* permite
reasignar a mano lo que no reconozca.

**Para recompilar** después de cualquier cambio:

```bash
npm install
npm test          # 98 pruebas
npm run build     # deja el sitio en dist/
```
