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
  // Armada
  'AL', // Almirante
  'VA', // Vicealmirante
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
  'TC', // Teniente Coronel
  'MY', // Mayor
  'CT', // Capitán
  'TE', // Teniente
  'ST', // Subteniente
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
