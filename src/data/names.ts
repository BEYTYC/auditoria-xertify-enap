/**
 * names.ts
 * Conectores de apellidos y diccionario de acentuación para nombres hispanos.
 */

/**
 * Partículas que permanecen en minúscula cuando NO son la primera palabra
 * del nombre o del apellido.
 */
export const NAME_CONNECTORS = new Set<string>([
  'de',
  'del',
  'la',
  'las',
  'lo',
  'los',
  'y',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'van',
  'von',
  'der',
  'den',
  'ter',
  'di',
  'du',
  'des',
  'le',
  'bin',
  'ibn',
  'al',
  'san',
  'santa',
]);

/**
 * Partículas que, aun siendo conectores, se escriben en mayúscula cuando
 * abren un apellido compuesto (p. ej. `San Juan`, `Santa Cruz`).
 */
export const CAPITALIZED_WHEN_LEADING = new Set<string>(['san', 'santa']);

/**
 * Diccionario de acentuación: clave normalizada (minúscula, sin tildes)
 * → grafía correcta. Solo se aplica cuando el token escrito carece de tildes.
 */
export const ACCENT_DICTIONARY: Record<string, string> = {
  // --- Apellidos ---
  hernandez: 'Hernández',
  gonzalez: 'González',
  gomez: 'Gómez',
  rodriguez: 'Rodríguez',
  martinez: 'Martínez',
  perez: 'Pérez',
  sanchez: 'Sánchez',
  ramirez: 'Ramírez',
  diaz: 'Díaz',
  alvarez: 'Álvarez',
  jimenez: 'Jiménez',
  munoz: 'Muñoz',
  vasquez: 'Vásquez',
  vazquez: 'Vázquez',
  velasquez: 'Velásquez',
  velazquez: 'Velázquez',
  gutierrez: 'Gutiérrez',
  cardenas: 'Cárdenas',
  bermudez: 'Bermúdez',
  quinonez: 'Quiñónez',
  quinones: 'Quiñones',
  angel: 'Ángel',
  bolivar: 'Bolívar',
  calderon: 'Calderón',
  canon: 'Cañón',
  carrion: 'Carrión',
  castaneda: 'Castañeda',
  ceron: 'Cerón',
  chacon: 'Chacón',
  cordoba: 'Córdoba',
  cordova: 'Córdova',
  cortes: 'Cortés',
  duran: 'Durán',
  estupinan: 'Estupiñán',
  farfan: 'Farfán',
  fernandez: 'Fernández',
  garcia: 'García',
  garzon: 'Garzón',
  guzman: 'Guzmán',
  ibanez: 'Ibáñez',
  leon: 'León',
  londono: 'Londoño',
  lopez: 'López',
  malagon: 'Malagón',
  marin: 'Marín',
  marquez: 'Márquez',
  martin: 'Martín',
  mejia: 'Mejía',
  melendez: 'Meléndez',
  mendez: 'Méndez',
  millan: 'Millán',
  montano: 'Montaño',
  moran: 'Morán',
  narvaez: 'Narváez',
  nino: 'Niño',
  nunez: 'Núñez',
  ordonez: 'Ordóñez',
  otalora: 'Otálora',
  paez: 'Páez',
  patino: 'Patiño',
  pelaez: 'Peláez',
  pena: 'Peña',
  pinzon: 'Pinzón',
  polania: 'Polanía',
  rincon: 'Rincón',
  rios: 'Ríos',
  roldan: 'Roldán',
  rondon: 'Rondón',
  santamaria: 'Santamaría',
  sepulveda: 'Sepúlveda',
  solis: 'Solís',
  suarez: 'Suárez',
  tellez: 'Téllez',
  tobon: 'Tobón',
  valdes: 'Valdés',
  velez: 'Vélez',
  zuniga: 'Zúñiga',
  zubieta: 'Zubieta',
  aguero: 'Agüero',
  arevalo: 'Arévalo',
  asprilla: 'Asprilla',
  avila: 'Ávila',
  barbosa: 'Barbosa',
  benitez: 'Benítez',
  betancur: 'Betancur',
  bohorquez: 'Bohórquez',
  briceno: 'Briceño',
  buitron: 'Buitrón',
  caceres: 'Cáceres',
  camacho: 'Camacho',
  carrasquilla: 'Carrasquilla',
  castellon: 'Castellón',
  chaves: 'Chaves',
  concepcion: 'Concepción',
  cuellar: 'Cuéllar',
  davila: 'Dávila',
  dominguez: 'Domínguez',
  echeverri: 'Echeverri',
  enriquez: 'Enríquez',
  escanola: 'Escañola',
  fajardo: 'Fajardo',
  galvan: 'Galván',
  giraldo: 'Giraldo',
  grisales: 'Grisales',
  guaman: 'Guamán',
  hurtado: 'Hurtado',
  inzunza: 'Inzunza',
  jaramillo: 'Jaramillo',
  lizarazo: 'Lizarazo',
  llanos: 'Llanos',
  maldonado: 'Maldonado',
  mantilla: 'Mantilla',
  marroquin: 'Marroquín',
  medellin: 'Medellín',
  monsalve: 'Monsalve',
  montoya: 'Montoya',
  mosquera: 'Mosquera',
  obregon: 'Obregón',
  olarte: 'Olarte',
  ospina: 'Ospina',
  pabon: 'Pabón',
  penaloza: 'Peñaloza',
  pineros: 'Piñeros',
  quintero: 'Quintero',
  rendon: 'Rendón',
  restrepo: 'Restrepo',
  rueda: 'Rueda',
  saavedra: 'Saavedra',
  salcedo: 'Salcedo',
  sarmiento: 'Sarmiento',
  serna: 'Serna',
  tamayo: 'Tamayo',
  tapias: 'Tapias',
  urrego: 'Urrego',
  valderrama: 'Valderrama',
  vanegas: 'Vanegas',
  vargas: 'Vargas',
  vergara: 'Vergara',
  villareal: 'Villarreal',
  villarreal: 'Villarreal',
  zambrano: 'Zambrano',
  zapata: 'Zapata',
  zuluaga: 'Zuluaga',

  // --- Nombres de pila ---
  adrian: 'Adrián',
  alejandro: 'Alejandro',
  andres: 'Andrés',
  angela: 'Ángela',
  angelica: 'Angélica',
  anibal: 'Aníbal',
  belen: 'Belén',
  cesar: 'César',
  concepcionn: 'Concepción',
  cristian: 'Cristian',
  dario: 'Darío',
  debora: 'Débora',
  efrain: 'Efraín',
  elian: 'Elián',
  estefania: 'Estefanía',
  fabian: 'Fabián',
  fernan: 'Fernán',
  german: 'Germán',
  hector: 'Héctor',
  hernan: 'Hernán',
  ines: 'Inés',
  ivan: 'Iván',
  jeronimo: 'Jerónimo',
  jesus: 'Jesús',
  joaquin: 'Joaquín',
  jose: 'José',
  josue: 'Josué',
  julian: 'Julián',
  lucia: 'Lucía',
  maria: 'María',
  martina: 'Martina',
  matias: 'Matías',
  maximiliano: 'Maximiliano',
  monica: 'Mónica',
  nicolas: 'Nicolás',
  oscar: 'Óscar',
  ramon: 'Ramón',
  raul: 'Raúl',
  rocio: 'Rocío',
  ruben: 'Rubén',
  salome: 'Salomé',
  sebastian: 'Sebastián',
  simon: 'Simón',
  sofia: 'Sofía',
  tomas: 'Tomás',
  veronica: 'Verónica',
  victor: 'Víctor',
  yesica: 'Yésica',
  ximena: 'Ximena',
};

/**
 * Palabras que suelen aparecer con tilde pero cuya versión sin tilde también
 * es un nombre legítimo: nunca se autocorrigen, solo se advierten.
 */
export const AMBIGUOUS_ACCENTS = new Set<string>(['cristian', 'martin', 'cortes', 'ramos']);

/**
 * Nombres y apellidos que NUNCA llevan tilde —son monosílabos («Ruiz»,
 * «Luis», «Cruz»: el diptongo «ui» no se acentúa salvo que rompa el
 * diptongo, cosa que ninguno de estos hace)—, pero que se escriben mal con
 * frecuencia («Ruíz», «Luís», «Crúz»). `canonicalName` quita la tilde
 * cuando aparece en alguna de estas palabras; el resto del diccionario solo
 * restituye tildes que faltan, nunca retira una que sobra, así que estas
 * son la única excepción y deben mantenerse cortas y bien verificadas.
 */
export const NEVER_ACCENTED = new Set<string>(['ruiz', 'luis', 'cruz']);

/**
 * Siglas de dos letras que anteceden al nombre de un firmante civil (no
 * militar), como «DO» (Doctor/Doctora). Se protegen con la misma prioridad
 * que `MILITARY_RANKS` en `canonicalName`, ANTES de comprobar si la palabra
 * es un conector de apellidos (`NAME_CONNECTORS` incluye «do» como partícula
 * de apellido portugués), porque si no la sigla civil se confunde con ese
 * conector y pierde la mayúscula: «DO Olga Macías» quedaría «Do Olga Macías».
 */
export const CIVILIAN_TITLES = new Set<string>(['DO']);

/**
 * Códigos de grado del personal de la institución (no son grados militares
 * navales): PD, OD, AS, AA, TS, DO y DV. A diferencia de los grados
 * militares, estos siempre llevan pegado un número de uno o dos dígitos que
 * identifica a la persona dentro de ese grado — «PD02», «OD16» — así que se
 * reconocen con un patrón, no con una lista cerrada de palabras exactas.
 * Ejemplo: «PD02 Beyty P. Camargo M.».
 */
export const STAFF_GRADE_CODES = ['PD', 'OD', 'AS', 'AA', 'TS', 'DO', 'DV'] as const;

const STAFF_GRADE_PATTERN = new RegExp(`^(?:${STAFF_GRADE_CODES.join('|')})\\d{0,2}$`);

/** `true` si `upper` (ya en mayúscula, sin tildes) es uno de estos códigos, con o sin número pegado. */
export function isStaffGradeCode(upper: string): boolean {
  return STAFF_GRADE_PATTERN.test(upper);
}

/**
 * Apellidos donde `n` y `ñ` corresponden a DOS apellidos distintos y reales,
 * no a un descuido de digitación. En estos la app propone la grafía con ñ
 * pero nunca la aplica sola: el nombre de una persona en un certificado no se
 * cambia por criterio de máquina.
 *
 * Fuera de esta lista, «MUNOZ» o «LONDONO» sí se corrigen solos, porque
 * «Munoz» y «Londono» no son apellidos: son la ñ que se perdió al escribir.
 */
export const AMBIGUOUS_ENYE = new Set<string>([
  'NINO',
  'PINA',
  'PINAR',
  'MONTANA',
  'CANAS',
  'CANO',
  'CANON',
  'CANAR',
  'CAMPANA',
  'MARINO',
  'VIANA',
  'ROMANA',
  'PENA',
  'MINO',
  'LENA',
  'SENAS',
  'MIRANA',
  'CANATE',
  'CANAVERAL',
]);

/**
 * Grados militares que anteceden al nombre de un firmante. Siempre van en
 * MAYÚSCULA y siempre son dos letras: `CA Juan Pablo Pinilla Acosta`.
 *
 * La regla general que aplica la app es más amplia que esta lista —cualquier
 * sigla de dos letras escrita en mayúscula se respeta—, pero el catálogo sirve
 * para levantar a mayúscula un grado que vino en minúscula («ca» → «CA»).
 */
export const MILITARY_RANKS = new Set<string>([
  // Armada — oficial naval
  'AL', // Almirante
  'ALM', // Almirante
  'VA', // Vicealmirante
  'VALM', // Vicealmirante
  'CA', // Contralmirante
  'CN', // Capitán de Navío
  'CF', // Capitán de Fragata
  'CC', // Capitán de Corbeta
  'TN', // Teniente de Navío
  'TF', // Teniente de Fragata
  'TK', // Teniente de Corbeta
  // Infantería de Marina y equivalentes
  'BG', // Brigadier General
  'CR', // Coronel
  'TC', // Teniente Coronel / Teniente de Corbeta (según el cargo)
  'MY', // Mayor
  'CT', // Capitán
  'TE', // Teniente
  'ST', // Subteniente
  // Infantería de Marina — equivalencias con sufijo «CIM»
  'ALMCIM', // Almirante
  'VALMCIM', // Vicealmirante
  'CACIM', // Contralmirante
  'CRCIM', // Capitán de Navío
  'TCCIM', // Capitán de Fragata
  'MYCIM', // Capitán de Corbeta
  'CCIM', // Teniente de Navío
  'TCIM', // Teniente de Fragata
  'STCIM', // Teniente de Corbeta
  // Suboficiales
  'SM', // Suboficial Mayor
  'SJ', // Sargento Jefe
  'SP', // Sargento Primero
  'SV', // Sargento Viceprimero
  'SS', // Sargento Segundo
  'CS', // Cabo Segundo
  'CP', // Cabo Primero
  'CB', // Cabo
  'MP', // Marinero Primero
  'MR', // Marinero
]);

/**
 * Jerarquía de los firmantes del certificado: Oficial Naval e Infantería de
 * Marina, de mayor a menor antigüedad. El firmante 1 debe ser de menor
 * jerarquía (número más alto) que el firmante 2.
 */
export const RANK_SENIORITY: Record<string, number> = {
  ALM: 1,
  ALMCIM: 1,
  VALM: 2,
  VALMCIM: 2,
  CA: 3,
  CACIM: 3,
  CN: 4,
  CRCIM: 4,
  CF: 5,
  TCCIM: 5,
  CC: 6,
  MYCIM: 6,
  TN: 7,
  CCIM: 7,
  TF: 8,
  TCIM: 8,
  TC: 9,
  STCIM: 9,
};
