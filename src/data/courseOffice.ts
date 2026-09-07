/**
 * courseOffice.ts
 * Índice curso → oficina responsable, derivado de las 11.335 filas históricas
 * de Tabla3. La oficina no viene en la plantilla de Xertify, así que la app la
 * propone a partir del `titulo` y el responsable la confirma.
 *
 * Cobertura medida sobre el histórico: 204 cursos, 98,1 % de acierto
 * usando la oficina mayoritaria de cada curso.
 *
 * Generado automáticamente. Cada entrada es
 * [índice en OFICINAS_RESPONSABLES, confianza 0..1, filas históricas].
 */

/** Las 12 oficinas vigentes, en el orden autorizado por la institución. */
export const OFICINAS_RESPONSABLES: string[] = [
  "BAENA - BATALLÓN DE CADETES",
  "DIDEN - DECANATURA DE INVESTIGACIÓN Y DESARROLLO ENAP",
  "FACAM - FACULTAD DE ADMINISTRACIÓN MARÍTIMA",
  "FACCN - FACULTAD CIENCAS NAVALES",
  "FACIM - FACULTAD DE INFANTERÍA DE MARINA",
  "FACIN - FACULTAD DE INGENIERÍA NAVAL",
  "FACMM - FACULTAD DE MARINA MERCANTE",
  "FACOF - FACULTAD DE OCEANOGRAFÍA FÍSICA",
  "SACEN - SECRETARÍA ACADÉMICA",
  "DICBA - DIVISIÓN CIENCIAS BÁSICAS",
  "DICSH - DIVISIÓN CIENCIAS SOCIALES",
  "SETIC - SECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN Y DE LAS COMUNICACIONES"
];

/**
 * Oficinas que ya no se usan pero aparecen en el histórico, con su equivalente
 * vigente. Solo se aplican al leer datos antiguos, nunca al escribir.
 */
export const OFICINAS_LEGADO: Record<string, string> = {
  "SECSH - SECCIÓN CIENCIAS SOCIALES": "DICSH - DIVISIÓN CIENCIAS SOCIALES",
  "SECBA - SECCIÓN CIENCIAS BÁSICAS": "DICBA - DIVISIÓN CIENCIAS BÁSICAS"
};

/** Clave: nombre del curso normalizado (minúscula, sin tildes ni puntuación). */
export const CURSO_OFICINA: Record<string, [number, number, number]> = {
 "seminario sobre liderazgo y manejo del mando": [
  0,
  1.0,
  78
 ],
 "curso introduccion sap": [
  2,
  0.958,
  24
 ],
 "curso virtual arcgis": [
  7,
  0.933,
  90
 ],
 "diplomado en metodos estadisticos para el analisis de datos ambientales": [
  9,
  0.889,
  18
 ],
 "programa de informacion sobre la carrera naval": [
  0,
  0.99,
  1122
 ],
 "taller para la generacion de soluciones multidiciplinarias a problemas oceanicos y costeros asociados al cambio climatico": [
  7,
  0.941,
  17
 ],
 "curso de contenedores y puertos": [
  5,
  0.985,
  68
 ],
 "diplomado en sistemas de informacion geografica sig": [
  7,
  0.942,
  156
 ],
 "curso ambientacion naval y militar": [
  3,
  0.5,
  4
 ],
 "curso intensivo de ingles": [
  10,
  0.889,
  18
 ],
 "diplomado ingenieria naval": [
  5,
  0.933,
  15
 ],
 "diplomado en manejo tactico de recursos navales": [
  3,
  0.973,
  593
 ],
 "logistica humanitaria": [
  2,
  0.933,
  15
 ],
 "diplomado en ingenieria naval": [
  5,
  0.964,
  275
 ],
 "diplomado en gestion de proyectos": [
  5,
  0.952,
  21
 ],
 "curso ambientacion en operaciones navales": [
  5,
  0.889,
  9
 ],
 "generalidades data link y sistemas de armas": [
  5,
  0.889,
  9
 ],
 "curso tactica naval": [
  5,
  0.889,
  9
 ],
 "simposio de metrologia": [
  5,
  0.986,
  69
 ],
 "ingles defense language institute": [
  10,
  0.789,
  19
 ],
 "diplomado en formacion y capacitacion como oficiales navales": [
  3,
  0.973,
  256
 ],
 "taller de investigacion formativa": [
  10,
  0.929,
  14
 ],
 "curso de estadistica no parametrica": [
  9,
  0.889,
  9
 ],
 "curso estadistica basica": [
  9,
  1.0,
  12
 ],
 "diplomado en gestion del riesgo y adaptacion al cambio climatico": [
  4,
  0.938,
  16
 ],
 "curso en metrologia basica": [
  5,
  0.917,
  12
 ],
 "diplomado en logistica portuaria": [
  2,
  0.968,
  221
 ],
 "curso de orientacion militar": [
  3,
  0.997,
  393
 ],
 "diplomado actualizacion en ciencias navales": [
  3,
  0.962,
  132
 ],
 "ofimatica basica": [
  11,
  0.909,
  11
 ],
 "curso ingles intensivo nivel basico": [
  10,
  0.875,
  8
 ],
 "curso de hidrografia": [
  7,
  0.875,
  8
 ],
 "diplomado en docencia universitaria y herramientas didacticas de ensenanzas": [
  3,
  1.0,
  45
 ],
 "diplomado asuntos maritimos y fluviales": [
  3,
  1.0,
  28
 ],
 "curso para inspectores de ayudas a la navegacion": [
  7,
  0.944,
  18
 ],
 "curso basico audiovisuales": [
  11,
  0.933,
  15
 ],
 "english elementary a2": [
  10,
  0.941,
  17
 ],
 "conceptos avanzados de diseno naval": [
  5,
  0.867,
  15
 ],
 "english starters a1": [
  10,
  0.85,
  20
 ],
 "english pre intermediate b1": [
  10,
  1.0,
  13
 ],
 "curso ingles intensivo nivel intermedio": [
  3,
  1.0,
  4
 ],
 "curso intermedio en materiales compuestos": [
  5,
  1.0,
  8
 ],
 "curso de ingles intensivo nivel basico": [
  10,
  0.929,
  28
 ],
 "curso taller internacional de formacion de hidrografia": [
  7,
  0.75,
  4
 ],
 "english intermediate b2": [
  10,
  1.0,
  13
 ],
 "i seminario taller en maniobrabilidad de las operaciones portuarias y offshore": [
  1,
  0.962,
  26
 ],
 "simulacion de maniobras y emergencias en instalaciones monoboyas multiboyas y muelles": [
  1,
  1.0,
  6
 ],
 "simulacion de maniobras especiales reaprovisionamiento en el mar": [
  1,
  0.8,
  5
 ],
 "curso de ingles intensivo nivel intermedio": [
  10,
  0.889,
  9
 ],
 "diplomado en gestion de activos y mantenimiento": [
  5,
  0.974,
  38
 ],
 "diplomado en docencia universitaria y herramientas pedagogicas de aprendizaje": [
  3,
  0.995,
  215
 ],
 "curso de complementacion de formacion del oficial naval": [
  3,
  0.977,
  44
 ],
 "curso en electronica aplicada": [
  4,
  0.957,
  23
 ],
 "curso en quimica aplicada": [
  4,
  1.0,
  23
 ],
 "simulacion de maniobras especiales operacion de sistemas con propulsion azimutal": [
  1,
  0.875,
  8
 ],
 "curso ambientacion naval": [
  3,
  0.714,
  7
 ],
 "curso basico de ingles intesivo": [
  10,
  0.944,
  18
 ],
 "diplomado en oceanografia": [
  7,
  0.974,
  39
 ],
 "curso de hidrografia categoria a": [
  7,
  1.0,
  21
 ],
 "politica y estrategia naval": [
  3,
  0.95,
  20
 ],
 "diplomado en docencia universitaria y herramientas pedagogicas de ensenanza": [
  3,
  0.968,
  63
 ],
 "entrenamiento especializado en simulacion de maniobras y emergencias": [
  1,
  0.833,
  6
 ],
 "diplomado manejo tactico de recursos navales": [
  3,
  0.981,
  207
 ],
 "diplomado sig": [
  7,
  0.95,
  100
 ],
 "ii congreso de ciencia y tecnologia naval": [
  1,
  0.997,
  316
 ],
 "diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.988,
  86
 ],
 "mando y toma de decisiones estrategicas": [
  8,
  0.95,
  20
 ],
 "variables oceanograficas": [
  7,
  0.857,
  7
 ],
 "analisis univariado": [
  7,
  1.0,
  10
 ],
 "diplomado en desarrollo de habilidades pedagogicas para la formacion de liderazgo etico": [
  3,
  0.981,
  53
 ],
 "diplomado meteorologia": [
  7,
  0.967,
  30
 ],
 "diplomado en planeacion y gestion de proyectos": [
  5,
  0.956,
  68
 ],
 "diplomado en geoestrategia y asuntos politicos": [
  3,
  0.952,
  42
 ],
 "diplomado de actualizacion de ciencias nauticas": [
  6,
  0.952,
  21
 ],
 "topografia basica": [
  7,
  0.833,
  6
 ],
 "arcgis virtual": [
  7,
  0.833,
  6
 ],
 "english elementary a1": [
  10,
  0.778,
  9
 ],
 "cadete naval por una semana": [
  0,
  0.996,
  949
 ],
 "curso de formacion y capacitacion para oficiales de infanteria de marina": [
  4,
  0.969,
  65
 ],
 "diplomado gestion estrategica del poder maritimo de la nacion": [
  8,
  0.95,
  20
 ],
 "diplomado en conduccion de fuerzas navales": [
  8,
  1.0,
  20
 ],
 "tercera cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.958,
  24
 ],
 "curso de hidrografia no 2": [
  7,
  0.909,
  11
 ],
 "diplomado en docencia universitaria y herramientas pedagogicas de aprendizaje v cohorte": [
  3,
  0.976,
  42
 ],
 "diplomado de actualizacion en administracion y administracion maritima": [
  2,
  0.955,
  22
 ],
 "curso pre antartico": [
  7,
  0.993,
  306
 ],
 "cuarta cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.964,
  28
 ],
 "diplomado en docencia universitaria y herramientas pedagogicas de aprendizaje vl cohorte": [
  3,
  0.978,
  46
 ],
 "diplomado de dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  0.978,
  45
 ],
 "entrenamientos especiales con simulacion maniobras y emergencias puente full mission": [
  1,
  0.855,
  55
 ],
 "english pre intermediate a2": [
  10,
  0.778,
  9
 ],
 "diplomado observacion medicion y tecnicas de muestreo de ecosistemas marinos": [
  7,
  0.9,
  10
 ],
 "entrenamientos especiales con simulacion operacion de sistemas con propulsion azimutal": [
  1,
  0.857,
  7
 ],
 "quinta cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.964,
  28
 ],
 "segunda cohorte diplomado dinamicas del narcotrafico maritimo fluvial y portuario herramientas y estrategias para su contencion": [
  4,
  1.0,
  20
 ],
 "english upper intermediate b2": [
  10,
  0.956,
  158
 ],
 "upper intermediate": [
  10,
  1.0,
  1
 ],
 "entrenamientos especiales con simulacion maniobras con emergencias en escenario virtual puerto drumond": [
  1,
  0.947,
  19
 ],
 "entrenamiento especial con simulacion operacion basica de sistemas azimutales": [
  1,
  1.0,
  11
 ],
 "diplomado en tecnologias de la informacion y las comunicaciones": [
  5,
  0.917,
  24
 ],
 "septima cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.944,
  18
 ],
 "english intermediate b1": [
  10,
  0.994,
  321
 ],
 "entrenamientos especiales con simulacion maniobras con emergencias en escenario virtual": [
  1,
  0.9,
  10
 ],
 "seminario de actualizacion en maestria en gestion logistica": [
  2,
  0.933,
  15
 ],
 "curso de arcgis virtual": [
  7,
  0.947,
  38
 ],
 "curso de hidrografia no 3": [
  7,
  1.0,
  9
 ],
 "tercera cohorte diplomado en dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  0.963,
  27
 ],
 "diplomado observacion medicion y tecnicas de muestreo": [
  7,
  0.909,
  11
 ],
 "sexta cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.917,
  12
 ],
 "curso de arcgis avanzado": [
  7,
  0.923,
  13
 ],
 "diplomado docencia universitaria y herramientas pedagogicas de aprendizaje": [
  3,
  0.967,
  30
 ],
 "diplomado oceanografia": [
  7,
  0.973,
  37
 ],
 "simulacion de maniobras y emergencias a bordo puente full mission clase a": [
  1,
  0.958,
  24
 ],
 "curso de arcgis": [
  7,
  0.929,
  14
 ],
 "diplomado geoetrategia y asuntos politicos": [
  3,
  0.933,
  15
 ],
 "diplomado en planeacion estrategica y prospectiva": [
  2,
  0.967,
  30
 ],
 "diplomado de meteorologia": [
  7,
  0.957,
  23
 ],
 "diplomado sistema de comabte": [
  3,
  1.0,
  11
 ],
 "seminario en ingenieria naval con enfasis en mantenimiento": [
  5,
  0.923,
  13
 ],
 "cuarta cohorte diplomado en dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  0.952,
  21
 ],
 "entrenamiento especial con simulacion maniobras y emergencias en escenarios virtuales": [
  4,
  0.5,
  2
 ],
 "diplomado en logistica humanitaria": [
  2,
  0.96,
  25
 ],
 "octava cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  0.875,
  8
 ],
 "quinta cohorte diplomado en dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  1.0,
  35
 ],
 "diplomado hidraulica fluvial": [
  7,
  1.0,
  26
 ],
 "diplomado sistemas de informacion geografico": [
  7,
  0.979,
  47
 ],
 "curso de hidrografia categoria a no 4": [
  7,
  1.0,
  10
 ],
 "diplomado en operaciones navales": [
  3,
  0.998,
  406
 ],
 "diplomado de actualizacion maestria en ingenieria naval": [
  5,
  0.933,
  15
 ],
 "diplomado en observacion medicion y tecnicas de muestreo en ecosistemas submarinos": [
  7,
  0.9,
  10
 ],
 "entrenamientos especiales con simulacion operacion basica de sistemas azimutales": [
  1,
  0.923,
  13
 ],
 "entrenamientos especiales con simulacion maniobras y emergencias en escenarios virtuales": [
  1,
  1.0,
  86
 ],
 "entrenamientos especiales con simulacion maniobras y emergencias sistemas azimutales": [
  1,
  1.0,
  5
 ],
 "curso iala nivel 1 administrador en ayudas a la navegacion maritima": [
  7,
  1.0,
  31
 ],
 "sexta cohorte diplomado en dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  1.0,
  31
 ],
 "diplomado en meteorologia": [
  7,
  1.0,
  42
 ],
 "diplomado en geostrategia y asuntos politicos": [
  3,
  1.0,
  22
 ],
 "diplomado en sistemas de combate": [
  3,
  1.0,
  21
 ],
 "curso en ingenieria naval con enfasis en mantenimiento y confiabilidad": [
  5,
  1.0,
  15
 ],
 "undecima cohorte diplomado en planeamiento tactico en operaciones navales": [
  4,
  1.0,
  13
 ],
 "english pre beginner a0": [
  10,
  1.0,
  374
 ],
 "diplomado en geostrategia y asuntos politicos quinta cohorte": [
  3,
  1.0,
  14
 ],
 "diplomado logistica portuaria": [
  2,
  1.0,
  10
 ],
 "english beginner a1": [
  10,
  1.0,
  541
 ],
 "english prementary a2": [
  10,
  1.0,
  438
 ],
 "english academic writing c1": [
  10,
  1.0,
  14
 ],
 "francais debutant a1 1": [
  10,
  1.0,
  6
 ],
 "diplomado de sistemas de informacion geografico sig": [
  7,
  1.0,
  14
 ],
 "decima cohorte diplomado planeamiento tactico en operaciones navales": [
  4,
  1.0,
  21
 ],
 "taller la imagen como herramienta de investigacion": [
  7,
  1.0,
  8
 ],
 "simulacion de maniobras y emergencia remolque oceanico": [
  1,
  1.0,
  3
 ],
 "aproximacion a la cultura material de naufragios historicos": [
  7,
  1.0,
  26
 ],
 "apuntes sobre la porcelana china en contextos arqueologicos relacionados con el galeon de manila primera parte del taller sobre porcelanas chinas en america latina": [
  7,
  1.0,
  51
 ],
 "managing underwater cultural heritage": [
  7,
  1.0,
  26
 ],
 "application of auv rovs for the study of underwater cultural heritage": [
  7,
  1.0,
  30
 ],
 "taller de la imagen como herramienta de investigacion": [
  7,
  1.0,
  8
 ],
 "simulacion de maniobras y emergencia escenarios virtuales": [
  1,
  1.0,
  23
 ],
 "octava cohorte diplomado en dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  1.0,
  17
 ],
 "english beginner a0": [
  10,
  1.0,
  1
 ],
 "doceava cohorte diplomado planeamiento tactico en operaciones navales": [
  4,
  1.0,
  21
 ],
 "diplomado en geoestrategia y asuntos politicos vi cohorte": [
  3,
  1.0,
  17
 ],
 "seminario dinamicas del narcotrafico maritimo fluvial y portuario fundamentos herramientas y estrategias para su contencion": [
  4,
  1.0,
  9
 ],
 "frances a1": [
  10,
  1.0,
  2
 ],
 "english academic writing c": [
  10,
  0.964,
  28
 ],
 "english upper intermediate b2 mod 2": [
  10,
  1.0,
  5
 ],
 "curso oficial de guardia en el mar avanzado": [
  3,
  1.0,
  10
 ],
 "curso de orientacion a la vida militar": [
  3,
  1.0,
  27
 ],
 "curso de formacion": [
  3,
  1.0,
  47
 ],
 "ascenso a teniente de fragata de la reserva naval": [
  3,
  1.0,
  2
 ],
 "ascenso a teniente de navio de la reserva naval": [
  3,
  1.0,
  24
 ],
 "ascenso a capitan de corbeta de la reserva naval": [
  3,
  1.0,
  35
 ],
 "diplomado en sistemas de informacion geografica teledeteccion y bases de datos georreferenciadas": [
  7,
  1.0,
  27
 ],
 "diplomado en geoestrategia asuntos politicos y wargaming octava cohorte": [
  3,
  1.0,
  11
 ],
 "diplomado en geoestrategia asuntos politicos y wargaming vii cohorte": [
  3,
  1.0,
  17
 ],
 "diplomado en gerencia de mantenimiento con enfasis en confiabilidad": [
  5,
  1.0,
  11
 ],
 "diplomado en geoestrategia asuntos politicos y wargaming": [
  3,
  1.0,
  56
 ],
 "sistemas de informacion geografico teledeteccion y bases de datos georreferenciadas": [
  7,
  1.0,
  18
 ],
 "oficial de accion tactica tao": [
  3,
  1.0,
  10
 ],
 "entrenamientos especiales con simulacion maniobras y emergencias asistencia a plataformas offshore": [
  1,
  1.0,
  3
 ],
 "diplomado formacion y capacitacion como oficiales navales": [
  3,
  1.0,
  16
 ],
 "planeamiento tactico en operaciones navales opcion derecho a grado": [
  4,
  1.0,
  20
 ],
 "english intermediate b0": [
  10,
  1.0,
  1
 ],
 "prementary a2": [
  10,
  1.0,
  1
 ],
 "prementary a3": [
  10,
  1.0,
  1
 ],
 "prementary a4": [
  10,
  1.0,
  1
 ],
 "prementary a5": [
  10,
  1.0,
  1
 ],
 "prementary a6": [
  10,
  1.0,
  1
 ],
 "prementary a7": [
  10,
  1.0,
  1
 ],
 "academic writing c": [
  10,
  1.0,
  4
 ],
 "beginner a1": [
  10,
  1.0,
  2
 ],
 "prementary": [
  10,
  1.0,
  11
 ],
 "intermediate": [
  10,
  1.0,
  13
 ],
 "english premetary a2": [
  10,
  1.0,
  1
 ],
 "english pre beginner a1": [
  10,
  1.0,
  1
 ],
 "english pre beginner a2": [
  10,
  1.0,
  1
 ],
 "cadete por una semana": [
  0,
  1.0,
  98
 ],
 "diplomado de planeamiento tactico en operaciones navales": [
  4,
  1.0,
  47
 ],
 "diplomado en contratacion estatal": [
  2,
  1.0,
  16
 ],
 "curso de formacion y capacitacion para oficiales de infanteria de marina oficiales de infanteria de marina oficiales de infanteria de marina": [
  4,
  1.0,
  8
 ],
 "diplomado en hidrologia y meteorologia tactica para las operaciones fluviales": [
  4,
  1.0,
  20
 ],
 "curso de orientacion a la vida militar extraordinario": [
  3,
  1.0,
  3
 ],
 "diplomado en sistemas de informacion geografico teledeteccion y bases de datos georreferenciadas": [
  7,
  1.0,
  20
 ],
 "diplomado en salud e interculturalidad en territorios de conflicto": [
  4,
  1.0,
  25
 ],
 "curso iala nivel 1 gestor de ayudas marinas a la navegacion l1 1 aton manager": [
  7,
  1.0,
  14
 ]
};
