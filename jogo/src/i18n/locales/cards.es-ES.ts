import type { CardTexts } from '../keys.ts';

/**
 * Nome e texto de regras das 78 cartas em espanhol.
 *
 * Mesmas convenções da tradução em inglês (decisão nº 18): nome próprio cunhado fica
 * como impresso, o descritivo é traduzido e o grupo que o motor filtra por nome se
 * mantém legível — "Lobo" → "Lobo", "Tridente" → "Tridente", "Contos" → "Cuentos",
 * "Moeda da Floresta" → "Moneda del Bosque", "Nortenho" → "Norteño",
 * "Harpia" → "Arpía". ATQ e VIDA seguem com o mesmo nome do pt-BR.
 */
export const cards: CardTexts = {
  1: {
    name: 'Azzure, Sacerdotisa de Atlantis',
    text: 'Mientras esta criatura esté en el campo, las demás criaturas aliadas de tipo "Acquarium" reciben +1 ATQ y +1 VIDA.',
  },
  2: {
    name: 'Dheron, Aprendiz de Sapomago',
    text: 'Siempre que una criatura aliada de tipo Anfibio cambie de elemento, recibe +1 de vida permanentemente.',
  },
  3: {
    name: 'Mysticus, Archimago de Atlantis',
    text: 'Una vez por turno, puedes destruir un anexo de nombre "Tridente" de esta criatura. Si lo haces, anula la activación de una carta de habilidad del oponente. Si activas este efecto, esta criatura no puede atacar durante tu próximo turno.',
  },
  4: {
    name: 'Leviatán de Esdras',
    text: 'Esta criatura no puede ser invocada normalmente. Puedes descartar esta carta de tu mano; si lo haces, elige una criatura que controles e invoca desde tu mano una criatura de tipo Mutante de nombre Esdras sobre la criatura elegida.',
  },
  5: {
    name: 'Atlas, Príncipe de Atlantis',
    text: 'Al entrar en campo, puedes descartar una carta de nombre Tridente. Si lo haces, busca en tu mazo una carta de nombre Atlantis y añádela a tu mano.',
  },
  6: {
    name: 'Pirata Ahogado',
    text: 'Cuando esta criatura sea destruida, causa 1 de daño a la criatura que la destruyó.',
  },
  7: {
    name: 'Sapomerlim, Mago de los Cuentos',
    text: 'Siempre que el elemento de esta criatura cambie, puedes elegir una criatura de tipo Anfibio que controles y cambiar su elemento al que tú quieras hasta el final del turno.',
  },
  8: {
    name: 'El Mímico del Cofre',
    text: 'Cuando esta criatura sea enviada a tu descarte, puedes elegir una criatura que controles y colocar un marcador +1/+1 en ella.',
  },
  9: {
    name: 'Tridente Poderoso de Atlas',
    text: 'La criatura anexada recibe +1/+1. Si hay dos "Tridente Poderoso de Atlas" anexados a una misma criatura, tu oponente descarta una carta al azar.',
  },
  10: {
    name: 'Tridente del Asesino',
    text: 'La criatura anexada recibe +2 de ATQ.',
  },
  11: {
    name: 'Defensa Absoluta del Tridente',
    text: 'La criatura anexada recibe +2 de vida. Si esta carta es exiliada, devuélvela a la mano de su dueño.',
  },
  12: {
    name: 'Tridente Mágico de Corales',
    text: 'La criatura anexada recibe +1/+1. Siempre que la criatura anexada ataque, elige una criatura enemiga. En el próximo turno, la criatura elegida no puede atacar.',
  },
  13: {
    name: 'Reflejos de Muerte',
    text: 'La criatura anexada recibe +1 de vida. Siempre que sea atacada, causa 1 de daño directo a una criatura enemiga.',
  },
  14: {
    name: 'Ahogamiento',
    text: 'Con la criatura anexada, elige una criatura enemiga. La criatura elegida recibe -1 de vida por cada carta anexada a ella. Si la criatura elegida muere, destruye esta carta.',
  },
  15: {
    name: 'Verdadero Tridente de Atlantis',
    text: 'La criatura equipada recibe +1/+1. Recibe +1 de ATQ adicional por cada otra carta de nombre Tridente que controles.',
  },
  16: {
    name: 'Sapocalibur, la Espada Legendaria',
    text: 'Recibe +2 de ATQ. Una vez por turno, si está anexada a un Anfibio, puedes cambiar el elemento de esa criatura.',
  },
  17: {
    name: 'Esfera del Aura Espectral',
    text: 'La criatura equipada recibe +1 de ATQ por cada otro Espectro que controles. Cuando esta carta sea anexada, crea una ficha de criatura Espectro 1/1 del elemento Vacío.',
  },
  18: {
    name: 'Mapa del Tesoro',
    text: 'Cuando la criatura anexada cause daño al jugador oponente, puedes robar una carta y después descartar una carta.',
  },
  19: {
    name: 'Manopla del Poder',
    text: 'La criatura anexada recibe +3 de ATQ. Al final del próximo turno, recibe 1 de daño directo.',
  },
  20: {
    name: 'Vasija de la Sirena',
    text: 'Al ser anexada, elige un elemento. La criatura anexada pasa a ser de ese elemento mientras esta carta siga anexada. Si hay tres o más criaturas del mismo elemento en tu lado del campo, la criatura anexada recibe +2 de vida.',
  },
  21: {
    name: 'Risa Histérica de Tashaa O',
    text: 'La criatura enemiga objetivo no puede atacar este turno.',
  },
  22: {
    name: 'Elección a Ciegas',
    text: 'Descarta todas las cartas de tu mano y después roba la misma cantidad descartada por este efecto.',
  },
  23: {
    name: 'Marioneta de Guerra',
    text: 'Elige una criatura enemiga objetivo: hasta su próximo turno debe atacar a una criatura que tú elijas.',
  },
  24: {
    name: 'Ojo del Antiguo Oráculo',
    text: 'Tu oponente revela dos cartas al azar de su mano; tú eliges una para barajarla de vuelta en su mazo.',
  },
  25: {
    name: 'Ritual de la Esfera Espectral',
    text: 'Sacrifica una criatura que controles: invoca desde tu mazo hasta dos criaturas de tipo Espectro con 2 de ATQ o menos. Las criaturas invocadas por este efecto no pueden atacar en el turno en que son invocadas.',
  },
  26: {
    name: 'Luna Sangrienta de Esdras',
    text: 'Elige una criatura que controles: recibe +1/+1 hasta el final de tu turno por cada criatura de nombre Esdras en tu descarte.',
  },
  27: {
    name: 'Cambiando el Rumbo',
    text: 'Elige una criatura que controles: no puede ser objetivo de ataques este turno.',
  },
  28: {
    name: 'Lobo del Aullido Sombrío',
    text: 'Siempre que otra criatura con Lobo en su nombre entre en campo bajo tu control, coloca un marcador +1/+1 en esta criatura.',
  },
  29: {
    name: 'Lobo de los Colmillos Plateados',
    text: 'Cuando esta criatura sea enviada del campo a tu descarte, puedes invocar desde tu mazo otra criatura de nombre "Lobo de los Colmillos Plateados".',
  },
  30: {
    name: 'Badur, el Osezno',
    text: 'Sacrifica esta criatura: puedes invocar desde tu descarte una criatura de nombre "Badur, el Oso Guardián".',
  },
  31: {
    name: 'Badur, el Oso Guardián',
    text: 'Mientras esta criatura esté en el campo, las demás criaturas de tipo Bestia de elemento Tierra que controles reciben -1 de daño de combate. Siempre que otra criatura de tipo Bestia que controles sea enviada del campo a tu descarte, coloca un marcador de +1 ATQ y VIDA en esta criatura.',
  },
  32: {
    name: 'Hechicero Tribal Badur',
    text: 'Una vez por turno del oponente, puedes elegir una criatura enemiga y una criatura de tipo Bestia que controles. Este turno, la criatura enemiga elegida debe atacar a la criatura elegida si es posible.',
  },
  33: {
    name: 'Sapotristan, el Escudero de los Cuentos',
    text: 'Siempre que el elemento de esta criatura cambie, puedes elegir una criatura con "Cuentos" en su nombre. Intercambia su ATQ y su VIDA mientras su elemento siga alterado. Si esa criatura es destruida mientras su elemento está alterado, roba una carta.',
  },
  34: {
    name: 'Poltergeist, Voz del Vacío',
    text: 'Cuando esta criatura sea enviada a tu descarte, puedes elegir una criatura enemiga. No puede atacar en el próximo turno de su controlador.',
  },
  35: {
    name: 'Segador del Castillo Maldito',
    text: 'Al entrar en campo, puedes elegir una criatura de tipo Espectro de tu descarte y barajarla de vuelta en tu mazo. Si lo haces, elige una criatura enemiga: recibe -ATQ igual al ATQ de la criatura barajada hasta el final del turno. Cuando esta criatura sea enviada del campo a tu descarte, crea una ficha de criatura Espectro 1/1 (Elemento: Vacío).',
  },
  36: {
    name: 'Mamuthe Ancestral',
    text: 'Una vez por turno, puedes enviar las 2 cartas superiores de tu mazo a tu descarte. Esta criatura recibe +1 de VIDA por cada elemento distinto entre las cartas de tu descarte.',
  },
  37: {
    name: 'Tótem del Guardián Ancestral',
    text: 'La criatura anexada recibe +0/+2. Si es de tipo Bestia, recibe +3 de vida en lugar de +0/+2.',
  },
  38: {
    name: 'Estampida de la Manada',
    text: 'La criatura anexada recibe +1/+1. La criatura anexada gana la palabra clave ARROLLAR.',
  },
  39: {
    name: 'Guardián Enloquecido',
    text: 'La criatura anexada recibe +2 de ATQ y +2 de VIDA. Cuando ataque, las demás criaturas de tipo Bestia que controles reciben +1 de ATQ hasta el final del turno. Si no ataca este turno, destruye esta carta.',
  },
  40: {
    name: 'Corazón del Sapoescudero',
    text: 'Cuando el elemento de la criatura anexada cambie, puedes elegir una criatura con Cuentos en su nombre e intercambiar su ATQ y su VIDA hasta el final del turno. Si el elemento de la criatura cambia, devuelve esta carta a tu mano de inmediato en lugar de enviarla al descarte.',
  },
  41: {
    name: 'Posesión de Objetos Inanimados',
    text: 'La criatura anexada recibe +1/+1. Cuando esta carta pase del campo al descarte, salvo durante la fase de batalla, puedes robar una carta.',
  },
  42: {
    name: 'Cuerpo Translúcido',
    text: 'La criatura anexada no puede ser atacada por criaturas con 3 o más de VIDA.',
  },
  43: {
    name: 'Protección del Escudero',
    text: 'La criatura anexada recibe +1/+2. Una vez por turno, cuando una criatura que controles con Cuentos en su nombre sea objetivo de un ataque, puedes enviar esta carta al descarte y anular el ataque.',
  },
  44: {
    name: 'Resistencia',
    text: 'La criatura anexada recibe +2 de VIDA. La primera vez que reciba daño en cada turno, reduce ese daño en 1.',
  },
  45: {
    name: 'Caverna del Guardián Badur',
    text: 'Cuando una criatura de tipo Bestia que controles sea enviada del campo a tu descarte, puedes elegir una criatura llamada "Badur, el Oso Guardián". Si lo haces, recibe +1 de ATQ hasta el final del turno. La primera vez en cada turno que una criatura enemiga sea destruida en combate, puedes robar 1 carta.',
  },
  46: {
    name: 'Devoradora de Vírgenes',
    text: 'MARCIAL\n\nDurante la fase de batalla de tu oponente: devuelve a tu mano una carta de Habilidad de elemento Viento de tu descarte y después reduce -1/0 a una criatura enemiga hasta el final del turno.',
  },
  47: {
    name: 'Éria, Reina Arpía',
    text: 'VORPAL\n\nAl entrar en campo: añade a tu mano una carta de nombre "Arpía" de tu mazo.',
  },
  48: {
    name: 'Hera, Bruja Arborium',
    text: 'Una vez por turno, durante tu turno, puedes elegir dos criaturas aliadas e intercambiar sus columnas. Si hay una carta "Moneda del Bosque" anexada a esta criatura, puedes usar este efecto como efecto rápido en el turno de cualquier jugador.',
  },
  49: {
    name: 'Relvus, General Arborium',
    text: 'Las criaturas aliadas anexadas con "Moneda del Bosque" reciben +1/+1.\n\nExilia una carta "Moneda del Bosque" de tu mano\ny después roba 2 cartas.\n(activa este efecto solo una vez por turno)',
  },
  50: {
    name: 'Wargh, Guardián Arborium',
    text: 'REGENERAR\n\nCuando esté anexada con una carta "Moneda del Bosque", revela las 4 cartas superiores de tu mazo;\ncausa a la criatura enemiga de la misma columna tanto daño como cartas de nombre "Arborium" hayan sido reveladas por este efecto.',
  },
  51: {
    name: 'Yen, Yanturai de la Tormenta',
    text: 'MARCIAL\n\nDurante la fase de batalla de tu oponente: devuelve a tu mano una carta de Habilidad de elemento Viento de tu descarte y después reduce -1/0 a una criatura enemiga hasta el final del turno.',
  },
  52: {
    name: 'Espada Ancestral Yanturai',
    text: 'La criatura anexada recibe +1/0.\nSiempre que una carta de habilidad vuelva a la mano de su dueño, la criatura anexada recibe +2/+1 hasta el final del turno.',
  },
  53: {
    name: 'Moneda del Bosque',
    text: 'La criatura anexada recibe +1/+1.\nCuando esta carta sea enviada al descarte, ambos jugadores descartan una carta de la mano; quien no tenga cartas en la mano exilia la carta superior de su mazo.',
  },
  54: {
    name: 'Semilla de Bulbo de Vida',
    text: 'La criatura anexada recibe 0/+1. Si es de tipo Planta, cura 1 de vida automáticamente al inicio de tu turno.',
  },
  55: {
    name: 'Abrazo del Bosque',
    text: 'Esta carta se considera "Moneda del Bosque" en el campo o en el mazo.\nLa criatura anexada recibe +1/0 y la criatura enemiga de la misma columna recibe -1/0.',
  },
  56: {
    name: 'Ataque Aéreo de la Arpía',
    text: 'La criatura anexada recibe +2/+1. Al atacar a una criatura que no sea del elemento "Viento", recibe +1 por cada carta de Habilidad de Viento con nombre distinto en tu descarte.',
  },
  57: {
    name: 'Brote Devorador de Vírgenes',
    text: 'Durante el turno enemigo, la criatura anexada recibe +0/+3 hasta el final del turno. Cuando esté anexada a "Devoradora de Vírgenes" y esta sea destruida, añade a tu mano una criatura de tipo Planta de tu mazo.',
  },
  58: {
    name: 'Brotes de Arborium',
    text: 'Esta carta se considera "Moneda del Bosque" en el campo o en el mazo.\nLa criatura anexada recibe +1/+1 por cada criatura Arborium aliada en el campo.',
  },
  59: {
    name: 'Espíritu de la Tormenta',
    text: 'Cuando anexes esta carta a tu criatura, la criatura enemiga de la misma columna recibe -1/0 permanentemente. Si hay dos cartas con el mismo nombre anexadas a esta criatura, recibe un contador\n+2/+1.',
  },
  60: {
    name: 'Seguro que no es un Norteño',
    text: 'Esta carta recibe el nombre de "Artilugio Kabum Norteño" en el campo o en tu mazo.\n\nDevuelve tres cartas exiliadas a tu mazo, barájalo y después roba una carta.',
  },
  61: {
    name: 'Petición de Emergencia',
    text: 'Elige una criatura aliada: recluta desde tu mazo, en una zona libre, una criatura de la misma raza que la criatura elegida y con ataque igual o menor.',
  },
  62: {
    name: 'Troncos Retorcidos',
    text: 'Esta carta se considera "Moneda del Bosque" en el mazo.\nInvierte los efectos de las cartas anexadas en una columna elegida hasta el final del turno. (los buffs se vuelven debuffs y los debuffs se vuelven buffs)',
  },
  63: {
    name: 'Aikãn, Yanturai de la Ira',
    text: 'MARCIAL\n\nDurante la fase de batalla de tu oponente: devuelve a tu mano una carta de Habilidad de elemento Viento de tu descarte y después reduce -1/0 a una criatura enemiga hasta el final del turno.',
  },
  64: {
    name: 'Grouz, Bárbaro Norteño',
    text: 'Siempre que una criatura enemiga vea sus estadísticas reducidas por efectos, esta criatura recibe +1/+1.\nCuando esta criatura ataque o sea atacada, reduce en 1 el ATQ de una criatura enemiga.',
  },
  65: {
    name: 'Kraven, Tirador Norteño',
    text: 'Una vez por turno, puedes enviar las dos cartas superiores de tu mazo al descarte y después reducir en 1 el ATQ de la criatura enemiga de la misma columna que esta criatura.',
  },
  66: {
    name: 'Sapoceloth, Héroe de los Cuentos',
    text: 'Al inicio de tu turno, revela una carta "de los Cuentos" de tu mano y cambia el elemento de la criatura enemiga de la misma columna que esta. Esta criatura no recibe daño de batalla de criaturas enemigas del elemento "Agua".',
  },
  67: {
    name: 'Stiven, Científico Norteño',
    text: 'Cuando esté anexada con la carta "Artilugio Kabum Norteño", recibe +2/+0.\n\nUna vez por turno, puedes enviar al descarte una carta "Artilugio Kabum Norteño" de tu mano. Busca dos cartas "Norteño" en tu mazo y revélalas. Tu oponente elige una de ellas. Añade la carta elegida a tu mano y coloca la otra en el fondo de tu mazo.',
  },
  68: {
    name: 'Vulkron, Dragonata de las Llamas',
    text: 'Siempre que esta criatura destruya a una criatura enemiga, las criaturas enemigas de las columnas a la izquierda y a la derecha reciben 1 de daño extra.',
  },
  69: {
    name: 'Catapulta Norteña',
    text: 'La criatura aliada recibe +1/0 por cada criatura aliada de tipo Goblin.\n\nAl inicio de tu turno, puedes enviar al descarte una criatura de nombre "Norteño" de tu mazo; la criatura enemiga de esta columna recibe -X/0, donde X es la vida de la criatura enviada al descarte por este efecto.',
  },
  70: {
    name: 'Artilugio de Guerra Norteño',
    text: 'La criatura anexada recibe +1/0 y la criatura enemiga de la misma columna recibe -1/0.\n\nSi está anexada a una criatura de tipo Goblin, esa criatura recibe 0/+2.\nSi está anexada a una criatura de tipo Bestia, esa criatura recibe -1/-1.',
  },
  71: {
    name: 'Bocanada del Ifreet',
    text: 'La criatura anexada recibe +2/+1.',
  },
  72: {
    name: 'Cacería del Norteño',
    text: 'Al ser anexada, la criatura enemiga de la misma columna recibe -2/0.',
  },
  73: {
    name: 'Artilugio Kabum Norteño',
    text: 'La criatura enemiga de la misma columna recibe -1/0 permanentemente.\n\nExilia esta carta junto con otras dos cartas "Norteño" de tu descarte. Elige una criatura enemiga: recibe -1/0.',
  },
  74: {
    name: 'Runas de Hefesto',
    text: 'La criatura anexada recibe +3/+0. Si una criatura enemiga es destruida en batalla mientras esta carta esté anexada, la criatura anexada recibe un punto de daño en su VIDA.',
  },
  75: {
    name: 'Aliento Flamígero',
    text: 'La criatura anexada recibe +4/0; después de atacar, destruye esta carta. La criatura anexada no ataca en tu próximo turno cuando esta carta es destruida.',
  },
  76: {
    name: 'Lluvia de Meteoros',
    text: 'Todas las criaturas en el campo reciben 1 de daño directo en su vida.',
  },
  77: {
    name: 'Cacheralossauro',
    text: 'MARCIAL\n\nDurante la fase de batalla de tu oponente: devuelve a tu mano una carta de Habilidad de elemento Viento de tu descarte y después reduce -1/0 a una criatura enemiga hasta el final del turno.',
  },
  78: {
    name: 'Llamado de los Muertos',
    text: 'Recluta del descarte enemigo una criatura que haya sido abatida este turno.\nEsa criatura pasa a ser de tipo Zombi mientras esté en el campo.',
  },
  79: {
    name: 'asf',
    text: 'asf',
  },
};
