# Registro de Cursos de Extensión

**Armada de Colombia · Escuela Naval de Cadetes «Almirante Padilla»**
**Oficina de Estadística** · Cartagena de Indias D. T. y C.

Aplicación web que valida la plantilla de Xertify que diligencian las facultades,
corrige lo que se puede corregir sin criterio humano, y —solo cuando el lote queda
en **cero errores**— asienta una fila por graduado en `Tabla3` de la
**Base de Datos Cursos de Extensión.xlsx** alojada en SharePoint.

```
Plantilla Cursos Extensión.xlsx  ──▶  auditoría  ──▶  Registro Oficial
        (hoja People)                                  ├─ filas en Tabla3 (SharePoint)
                                                       └─ Excel corregido para Xertify
```

## Puesta en marcha

```bash
npm install
cp .env.example .env      # opcional: también se configura desde la app
npm run dev               # http://localhost:5173
npm test                  # 98 pruebas
npm run build             # genera dist/
```

Sin configurar nada, la app arranca en **modo local**: audita, corrige y exporta,
pero guarda el registro en el navegador en lugar de escribir en SharePoint.

## Los dos archivos

### Plantilla (entrada)

Hoja `People`. Fila 1 = leyendas, **fila 2 = encabezados**, fila 3 en adelante = datos.

| Columna | Uso |
| --- | --- |
| `NOMBRES`, `APELLIDOS` | Tipo título, tildes restauradas |
| `nomfirma1`, `nomfirma2`, `nomfirma3` | Igual, pero el grado militar se respeta: `CA Juan Pablo Pinilla Acosta` |
| `TELEFONO`, `TELEFONO2` | Dígitos, con `+` y un espacio tras el indicativo: `+57 3052812384` |
| `TIPODOCUMENTO` | Debe coincidir **carácter por carácter** con `Parameters!D4:D196` (193 valores) |
| `NUMERODOCUMENTO` | Cédula como **texto con separador de miles**: `1.026.286.605`. Pasaporte sin puntos ni espacios |
| `LUGAREXPEDICION` | Opcional. Si viene: solo el municipio, y Bogotá se escribe `Bogotá D.C` |
| `lugarexpi` | Sin uso: se conserva tal cual y no se valida |
| `docformato` | Uno de: cédula de ciudadanía · pasaporte · tarjeta de identidad · cédula de extranjería |
| `titulo`, `intensidad` | Curso y horas |
| `fechaemite`, `FECHAEXPEDICION`, `fechanacimiento2` | Formato `15 de mayo de 2026`, **sin cero inicial** en el día |
| `fechainicio` | Una fecha o el **rango** del curso: `12 de junio al 4 de julio de 2026` |
| `EMAIL` | Obligatorio para Xertify |
| `li`, `fo`, `numre` | Los asigna la app al registrar |

### Base de datos (salida)

Hoja `Libro No. 2`, tabla `Tabla3`. Se **anexan** filas al final; nunca se sobrescribe.

| Plantilla | Tabla3 |
| --- | --- |
| `NOMBRES` | `NOMBRES` |
| `APELLIDOS` | `APELLIDOS` |
| `NUMERODOCUMENTO` | `DOCUMENTO DE IDENTIDAD` |
| `LUGAREXPEDICION` | `LUGAR EXPEDICION` |
| `docformato` | `TIPO DE DOC` (abreviado: `CC`, `TI`, `CE`, `PS`) |
| `titulo` | `NOMBRE DEL CURSO` |
| `intensidad` | `INTENSIDAD` |
| `fechainicio` | `FECHA INICIO` |
| `fechaemite` | `FECHA DE REGISTRO` |
| `nomfirma1` | `OBSEVACIONES` |
| `nomfirma3` | `DIRECTOR FIRMANTE` · columna opcional, ver abajo |
| `li` / `fo` / `numre` | `LIBRO` / `FOLIO` / `REG` |

La app calcula por su cuenta `N` (consecutivo), `PERIODO` (la misma fórmula
estructurada de las filas existentes), `AÑO` y `OFICINA RESPONSABLE`.

`FECHA FINALIZACION` sale del rango de `fechainicio`: si la plantilla trae
«12 de junio al 4 de julio de 2026», la base recibe el 12/06 como inicio y el
04/07 como finalización. Si `fechainicio` trae una fecha suelta, queda vacía.

La cédula viaja como texto con puntos en la plantilla y entra a la base como
número: el separador de miles allá lo pone el formato `#,##0` de la columna.

Los textos van en **MAYÚSCULA conservando tildes y eñes**, como el histórico.

## Decisiones que conviene conocer

**Tildes, también en MAYÚSCULA.** Todo valor lleva tilde: `IBAGUÉ`, `CÚCUTA`,
`NAVEGACIÓN MARÍTIMA`, `JOSÉ HERNÁNDEZ`. La app las conserva al pasar a mayúscula
y además las **restituye** cuando faltan, con un diccionario de 349 palabras
extraído de tus propias 11.335 filas: cada palabra que alguien escribió alguna vez
con tilde queda registrada con su grafía correcta.

Dos salvedades deliberadas. Se excluyen los homógrafos donde la forma sin tilde
también es correcta —«educación continua» no lleva tilde en «continua»—. Y no se
convierte `n` en `ñ` en una lista corta de apellidos donde ambas grafías existen
de verdad (Nino/Niño, Pina/Piña, Montana/Montaña, Canas/Cañas, Marino/Mariño,
Pena/Peña): ahí la app propone la grafía con ñ pero no la aplica sola, porque el
nombre de una persona en un certificado no se cambia por criterio de máquina.
Fuera de esa lista sí corrige sola, porque «Munoz» y «Londono» no son apellidos:
son la ñ que se perdió al escribir.

**Rango de fechas del curso.** `fechainicio` acepta tanto una fecha suelta como
el rango completo, que es como suele imprimirse en el certificado. Se reconocen
«12 al 15 de junio de 2026», «12 de junio al 4 de julio de 2026» y
«12 de diciembre de 2025 al 4 de enero de 2026», con `al`, `a`, `hasta` o guion
como separador, y se normalizan a la forma más corta que siga siendo inequívoca.
Un rango invertido se rechaza. `fechaemite` no admite rango: es una sola fecha.

**El archivo corregido es el mismo que se subió.** La plantilla de Xertify lleva
listas de validación, rangos protegidos, formatos y una hoja `Parameters` de la
que dependen los desplegables; nada de eso sobrevive a reconstruir el libro con
una librería de escritura. Por eso la descarga no genera un archivo nuevo: abre
el .xlsx original —que es un zip—, cambia solo las celdas corregidas de la hoja
de datos y lo vuelve a cerrar. Cada parte que no se toca sale byte por byte igual
que como entró; se comprobó contra la plantilla real, donde las ocho validaciones
`x14` y los dos rangos protegidos llegan intactos. El archivo se descarga solo al
generar el registro, con la numeración que quedó asentada.

**Corrección celda por celda.** Cada hallazgo con propuesta trae su botón
**Corregir**, que la aplica solo en esa celda. No hay corrección masiva: la
auditoría se hace caso por caso, para que quien valida vea lo que aprueba.

El botón respeta las mismas dependencias que la autocorrección: si el tipo de
documento todavía está mal, la celda del número no ofrece botón sino un aviso
—«Corrija primero Tipo de documento»—, porque con `Spain - id` puesto el
pasaporte `A.123.456` se «corregiría» a `123.456` y perdería la letra.

**Grados militares.** Un grado son dos letras y va siempre en MAYÚSCULA. La app
protege cualquier sigla de dos letras que abra un nombre antes de aplicar el
formato tipo título, y levanta a mayúscula los grados del catálogo aunque hayan
venido en minúscula. Los conectores quedan fuera, para que `CN JUAN DE LA ROSA`
no termine como `CN Juan DE LA Rosa`.

**El archivo sale siempre con la misma pinta.** Las facultades pegan las filas
desde otros archivos y llega de todo: Courier 14, rellenos amarillos, alturas
distintas. El archivo corregido normaliza eso —toda la hoja en **Aptos 11**, cada
fila de datos con el formato propio de la plantilla, tomado de una fila en blanco
del área de datos o, si no queda ninguna, del estilo declarado para cada
columna—. La negrita y los colores del encabezado se respetan: solo cambian la
tipografía y el tamaño.

**Anular, no sobrescribir.** La Oficina de Estadística entra a la bitácora con su
cuenta y puede anular un asiento: se borran del libro las filas de ese lote y el
renglón queda marcado como anulado. La numeración de los asientos posteriores no
se toca. Para corregir un lote se anula y se registra otra vez ya corregido, que
es como se hace en un libro oficial. También puede retirar renglones de la
bitácora del equipo —eso no toca el libro— y **validar el último registro**, que
lee la Base de Datos y comprueba que el libro cierre justo donde termina el
último asiento. Es una barrera contra el accidente, no una cerradura: quien de
verdad puede escribir en `Tabla3` es quien tenga permiso sobre el archivo en
SharePoint.

**La bitácora guarda el archivo, no solo el renglón.** Al registrar, la copia
corregida de la plantilla queda guardada con el lote, así que desde la bitácora
se vuelve a descargar tal cual se entregó —con su numeración— sin auditar nada de
nuevo. El navegador tiene poco espacio: solo los veinte lotes más recientes
conservan el archivo; los anteriores mantienen su renglón.

**Un lote no se registra dos veces.** Pasa: alguien vuelve a cargar la plantilla
que ya asentó —porque no vio el comprobante, porque se le cerró el navegador,
porque quiere «volver a generarlo»— y el mismo graduado terminaría en dos folios
distintos, que no se deshace desde la aplicación. El lote se identifica por
`curso + documento` de cada graduado y se compara contra dos fuentes: la bitácora
de ese navegador, y las últimas 600 filas de `Tabla3`, que se leen al entrar al
paso de registro y sí ven lo que registró otra persona en otro equipo. Si hay
choque, el botón queda bloqueado y la pantalla remite a la bitácora y a la
Oficina de Estadística.

**Numeración del libro.** Ningún número pasa de 99: un folio admite 99 registros y
un libro admite 99 folios. Al agotarse, la app abre folio o libro nuevo. La
numeración no se digita: al entrar al paso de registro la app relee la última fila
de `Tabla3` y continúa desde ahí. Sin conexión arranca del último valor conocido
—libro 3, folio 99, registro 54, consecutivo N 11.476—, que se actualiza solo en
cuanto Microsoft Graph queda configurado.

El archivo vive en el OneDrive de la Oficina de Estadística, en
`Estadística / Bases de Datos / BD Cursos de Ley - Cursos de Extensión /
Base de Datos Cursos de Extensión.xlsx`; en `.env.example` están las dos consultas
de Graph que devuelven el `drive-id` y el `item-id` de ese archivo.

**Oficina responsable.** No existe en la plantilla. La app trae un índice de los
204 cursos del histórico y propone la oficina a partir del `titulo`; sobre las
11.335 filas existentes esa propuesta acierta el 98,1 %. El responsable la confirma
antes de registrar: la app nunca escribe una oficina sin confirmación.

**DIRECTOR FIRMANTE.** Esa columna todavía no existe en `Tabla3`. La app consulta
las columnas reales de la tabla; si la encuentra, escribe `nomfirma3`, y si no, la
omite y lo advierte, en lugar de romper la inserción. Para activarla basta con
agregarla al final de la tabla en la Base de Datos.

## Conexión con SharePoint

### Opción A · Microsoft Graph (recomendada)

`POST /drives/{drive}/items/{item}/workbook/tables/{tabla}/rows/add`, en tandas de
100 filas, con reintentos que respetan `Retry-After` ante 429 y 503.

1. En Entra ID, registre una aplicación de tipo **SPA** con el Redirect URI del sitio.
2. Permisos delegados: `Files.ReadWrite.All` (y `Sites.ReadWrite.All` si el archivo
   vive en un sitio de equipo). Conceda consentimiento de administrador.
3. Obtenga los IDs con Graph Explorer:
   ```
   GET /sites/{host}:/sites/{sitio}                    → site-id
   GET /sites/{site-id}/drives                         → drive-id
   GET /drives/{drive-id}/root:/ruta/archivo.xlsx      → item-id
   ```
4. Póngalos en `.env` o en el panel de **Ajustes** y pulse «Probar conexión».

### Opción B · Power Automate

Un flujo con disparador *When a HTTP request is received*. La app envía:

```json
{
  "tabla": "Tabla3",
  "hoja": "Libro No. 2",
  "columnas": ["N", "LIBRO", "FOLIO", "..."],
  "filas":    [{ "N": 11351, "LIBRO": 3, "...": "..." }],
  "valores":  [[11351, 3, 98, 28, "..."]]
}
```

En el flujo, un `Apply to each` sobre `filas` con la acción *Add a row into a table*.

### Opción C · Local

Guarda el lote en el navegador. Es la red de seguridad: si el envío a SharePoint
falla a mitad de camino, el lote queda respaldado aquí y la app lo dice en lugar
de perderlo.

## Identidad institucional

El escudo está empaquetado en `src/assets/escudo.png` (y `escudo-blanco.png`
para fondos oscuros), así que la aplicación se ve completa sin conexión. Aparece
en el membrete, en el pie, como marca de agua de fondo y como sello dentro del
comprobante. Los textos oficiales y la paleta —azul naval `#0B2A5B` y dorado
`#C9A227`— están en `src/data/brand.ts` y en `tailwind.config.js`.

Una sola tipografía en toda la aplicación: **Aptos Display** cuando el equipo la
tiene instalada (viene con Microsoft 365) y **Libre Franklin** como respaldo
descargable, que es la que se ve en equipos sin Office.

## Estructura

```
src/
├── assets/                   escudo institucional (color y blanco)
├── data/                     catálogos (no editar a mano)
│   ├── brand.ts              nombres oficiales y paleta institucional
│   ├── xertifyParameters.ts  las 193 opciones de TIPODOCUMENTO, extraídas del archivo
│   ├── accents.ts            349 palabras con su grafía acentuada, del histórico
│   ├── courseOffice.ts       índice curso → oficina (204 cursos del histórico)
│   ├── cities.ts             municipios con su grafía oficial
│   ├── countries.ts          país en español → país como lo escribe Xertify
│   ├── names.ts              conectores y diccionario de tildes
│   └── fields.ts             las 26 columnas: etiqueta, alias, obligatoriedad
├── services/
│   ├── textUtils.ts          normalización, tipo título, Levenshtein
│   ├── dateService.ts        análisis y formato de fechas ES/EN
│   ├── documentService.ts    país + tipo de documento contra la lista Xertify
│   ├── validatorService.ts   todas las reglas
│   ├── correctorService.ts   autocorrección y métricas del lote
│   ├── excelService.ts       lectura de la plantilla y reexportación
│   ├── numberingService.ts   libro / folio / registro
│   ├── officeService.ts      propuesta de oficina responsable
│   ├── databaseService.ts    mapeo a las filas de Tabla3
│   ├── duplicateService.ts   bloqueo del lote ya registrado
│   ├── xlsxPatchService.ts   reescritura quirúrgica de la plantilla
│   ├── sharepointService.ts  los tres adaptadores
│   └── registryService.ts    orquestación y bitácora
├── components/               los cuatro pasos de la interfaz
├── hooks/useAudit.ts         estado central
└── types.ts                  contratos de dominio
```

## Pruebas

`npm test` corre 95 pruebas: 83 de reglas unitarias y 12 de extremo a extremo sobre
una copia literal de la plantilla real con filas deliberadamente sucias
(`src/services/__fixtures__/plantilla-sucia.xlsx`).

Dos detalles que salieron de ahí y que conviene no volver a romper:

- El orden importa. `Spain - id` + `A.123.456` se corregía como si fuera cédula y
  perdía la letra («123456»). El autocorrector declara dependencias entre campos y
  espera a que el tipo de documento quede bien antes de tocar el número.
- Las advertencias de discrepancia entre dos campos (`lugarexpi` contra
  `LUGAREXPEDICION`, fechas ambiguas) muestran sugerencia pero **no** se
  autoaplican: cuál de los dos valores está bien es criterio humano.
- Lo mismo con la `ñ` de los apellidos ambiguos: `Rincon Nino` se corrige a
  `Rincón Nino`, no a `Rincón Niño`, y queda la advertencia con la sugerencia
  lista para aplicar a mano.
