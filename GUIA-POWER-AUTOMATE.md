# Registrar sin inicio de sesión: flujo de Power Automate

Con este flujo, nadie que use la app para registrar un lote ve nunca una ventana de Microsoft. Usted lo crea una sola vez, con su propia cuenta institucional, y desde ese momento la app solo le manda los datos a una dirección web (URL) del flujo — el flujo, ya autorizado, escribe en el Excel y envía el correo.

## Qué le llega al flujo

La app hace **dos tipos de llamada** a la misma URL, según el momento:

**1. Para escribir el lote** (se manda una vez por cada registro):
```json
{
  "tabla": "Tabla3",
  "hoja": "Libro No. 2",
  "columnas": ["N", "LIBRO", "FOLIO", "REG", "APELLIDOS", "..."],
  "filas": [
    { "N": 11351, "LIBRO": 3, "FOLIO": 98, "REG": 28, "APELLIDOS": "...", "...": "..." }
  ],
  "valores": [[11351, 3, 98, 28, "...", "..."]]
}
```
`filas` trae un objeto por graduado, con el nombre exacto de cada columna como llave — es el que más le conviene usar en el paso de agregar filas al Excel, porque no depende del orden.

**2. Para avisar del correo** (se manda justo después, si el lote sí quedó escrito):
```json
{
  "accion": "notificar",
  "responsable": "PD Beyty Camargo",
  "correoResponsable": "responsable@enap.edu.co",
  "curso": "English Intermediate - B1",
  "idRegistro": "REG-2026-0908-001"
}
```

El flujo tiene que distinguir cuál de las dos llegó (más abajo, en el paso 3).

## Paso 1 — Crear el flujo

1. Vaya a [make.powerautomate.com](https://make.powerautomate.com) e inicie sesión con su cuenta institucional (@enap.edu.co).
2. **Crear** → **Flujo de nube instantáneo**.
3. Nombre: por ejemplo `Registro Cursos de Extensión`.
4. Elija el desencadenador **«Cuando se recibe una solicitud HTTP»** → **Crear**.
5. No hace falta llenar el esquema JSON: déjelo vacío por ahora y guarde el flujo una vez (**Guardar**) para que Power Automate genere la URL. Esa URL aparece en el propio paso del desencadenador, con el texto **«URL HTTP POST»** — cópiela, es la que va a pegar luego en la app.

## Paso 2 — Agregar la condición

1. Agregue un paso **«Condición»** (Control).
2. En el lado izquierdo, elija **«Contenido»** avanzado y escriba esta expresión (pestaña «Función» o «Editor de expresiones»):
   ```
   coalesce(triggerBody()?['accion'], '')
   ```
3. Operador: **«es igual a»**. Lado derecho: `notificar`.

## Paso 3a — Rama «Si es verdadero» (enviar el correo)

1. Agregue la acción **«Enviar un correo electrónico (V2)»** (conector Office 365 Outlook; si su cuenta usa Gmail institucional, use el conector de Gmail en su lugar).
2. **Para**: contenido dinámico → `correoResponsable`.
3. **Asunto**: `Registro Oficial` + contenido dinámico `idRegistro` + ` — ` + contenido dinámico `curso` (combine texto y contenido dinámico en el mismo campo).
4. **Cuerpo**: redacte el mensaje que prefiera, insertando `responsable`, `curso` e `idRegistro` como contenido dinámico donde hagan falta. Por ejemplo:
   > Estimado(a) **{responsable}**, se registró oficialmente el lote **{idRegistro}** del curso **{curso}** en la Base de Datos de Cursos de Extensión.

## Paso 3b — Rama «Si es falso» (escribir el lote en el Excel)

1. Agregue **«Aplicar a cada uno»** (Control) sobre el contenido dinámico `filas`.
2. Dentro, agregue **«Agregar una fila a una tabla»** (conector Excel Online (Business), sobre OneDrive o SharePoint — el mismo archivo de siempre).
   - **Ubicación / Documento / Archivo**: el mismo Excel de `Tabla3`.
   - **Tabla**: `Tabla3`.
   - Power Automate va a mostrar un campo por cada columna de la tabla (N, LIBRO, FOLIO, REG, APELLIDOS…). En cada uno, use el editor de expresiones para tomar el valor de la fila actual, por ejemplo para la columna N:
     ```
     items('Aplicar_a_cada_uno')?['N']
     ```
     y así sucesivamente cambiando `'N'` por el nombre exacto de cada columna (**LIBRO**, **FOLIO**, **REG**, **APELLIDOS**, **NOMBRES**, **TIPO DE DOC**, **DOCUMENTO DE IDENTIDAD**, **LUGAR EXPEDICION**, **NOMBRE DEL CURSO**, **FECHA INICIO**, **FECHA FINALIZACION**, **FECHA DE REGISTRO**, **PERIODO**, **AÑO**, **INTENSIDAD**, **OFICINA RESPONSABLE**, **FIRMANTE 1**, **FIRMANTE 2**, **FIRMANTE 3**).
   - Las columnas de fecha (**FECHA INICIO**, **FECHA FINALIZACION**, **FECHA DE REGISTRO**) llegan como número de serie de Excel (ej. `46034`), no como texto — eso es correcto, es como Excel guarda las fechas por dentro; la columna ya las muestra con su formato de fecha normal.

## Paso 4 — Responder con éxito

Fuera de la condición (después de las dos ramas), agregue **«Respuesta»** (Control), con **Código de estado** `200`. Sin esto, la app puede interpretar que el flujo falló aunque sí haya escrito el lote.

## Paso 5 — Cargar la URL en la app

1. Abra la app publicada → engranaje (⚙) → Administración.
2. Elija el modo **«Power Automate»**.
3. Pegue en **«URL del flujo (HTTP request)»** la URL que copió en el Paso 1.
4. **Guardar**.

## Paso 6 — Probar

1. Cargue una plantilla, llene facultad, responsable y correo, y dé **«Generar registro oficial»**.
2. No debe aparecer ninguna ventana de Microsoft.
3. Revise que la fila haya quedado en `Tabla3` y que el correo haya llegado a la cuenta indicada como responsable.
4. Si algo no llega, en Power Automate abra **«Historial de ejecuciones»** de este flujo: cada ejecución fallida muestra exactamente en qué paso se atascó y por qué — mándeme esa captura y seguimos desde ahí.

---

**Nota sobre anular un registro:** el modo Power Automate solo agrega filas; para anular un registro hecho por error, hay que hacerlo directamente en el archivo de Excel (o pedir que le active Microsoft Graph aparte, solo para esa función, desde el mismo panel de Administración).
