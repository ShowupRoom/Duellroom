// Deutsche Fassung kurzer englischer Effekt-Beschriftungen („Special Summon“, „Add to hand“ …).
// Die deutsche Kartendatenbank liefert diese Kurztexte nur für einen Teil der Karten; für den Rest übersetzt diese kleine Regel-Übersetzung.
// Sie antwortet nur, wenn jedes Wort verstanden wurde – sonst '' (dann greift der deutsche Kartentext oder der englische Rest).
const SUMMON = { special: 'Spezialbeschwörung', normal: 'Normalbeschwörung', tribute: 'Tributbeschwörung', flip: 'Flipbeschwörung', fusion: 'Fusionsbeschwörung', synchro: 'Synchrobeschwörung', xyz: 'Xyz-Beschwörung', link: 'Linkbeschwörung', ritual: 'Ritualbeschwörung', pendulum: 'Pendelbeschwörung' };
// Ortsangaben und Zusätze (werden hinten angehängt bzw. vor das Verb gestellt)
const PLACE = [
  [/\bfrom (?:your |the )?hand\b|\bfrom hand\b/g, 'aus der Hand'], [/\bfrom (?:your |the )?(?:gy|graveyard)\b/g, 'aus dem Friedhof'], [/\bfrom (?:your |the )?extra deck\b/g, 'aus dem Extradeck'], [/\bfrom (?:your |the )?deck\b/g, 'aus dem Deck'], [/\bfrom (?:your |the )?(?:banished zone|banished)\b/g, 'aus den Verbannten'],
  [/\bin defense position\b/g, 'in Verteidigungsposition'], [/\bin attack position\b/g, 'in Angriffsposition'], [/\b(?:to|into) (?:your |the )?(?:gy|graveyard)\b/g, 'auf den Friedhof'], [/\b(?:to|into) (?:your |the )?deck\b/g, 'ins Deck'], [/\bface-up\b/g, 'offen'], [/\bface-down\b/g, 'verdeckt'],
  [/\bon the field\b/g, 'auf dem Spielfeld'], [/\bon your (?:side of the )?field\b/g, 'auf dein Spielfeld'], [/\bon your opponent's (?:side of the )?field\b/g, 'auf das gegnerische Spielfeld'], [/\bin your spell & trap zone\b/g, 'in deine Zauber- und Fallenzone'], [/\bin your pendulum zone\b/g, 'in deine Pendelzone'], [/\bin your field zone\b/g, 'in deine Spielfeldzone'], [/\byour opponent controls\b/g, 'die dein Gegner kontrolliert'], [/\byou control\b/g, 'die du kontrollierst'],
];
const EXACT = {
  'special summon this card': 'Diese Karte spezialbeschwören', 'special summon itself': 'Diese Karte spezialbeschwören', 'special summon it': 'Spezialbeschwörung', 'special summon them': 'Spezialbeschwörung',
  'add to hand': 'Auf die Hand nehmen', 'add this card to your hand': 'Diese Karte auf die Hand nehmen', 'add to your hand': 'Auf die Hand nehmen', 'back to hand': 'Zurück auf die Hand', 'return to hand': 'Zurück auf die Hand', 'return to the hand': 'Zurück auf die Hand', 'return this card to the hand': 'Diese Karte zurück auf die Hand',
  'return to deck': 'Zurück ins Deck', 'shuffle to deck': 'Ins Deck mischen', 'send to gy': 'Auf den Friedhof schicken', 'send to graveyard': 'Auf den Friedhof schicken', 'send to the gy': 'Auf den Friedhof schicken',
  'draw': 'Ziehen', 'draw 1 card': '1 Karte ziehen', 'draw 2 cards': '2 Karten ziehen', 'draw 3 cards': '3 Karten ziehen', 'search': 'Suchen', 'excavate': 'Karten aufdecken', 'token': 'Spielmarke erzeugen', 'attach': 'Als Material anlegen',
  'damage': 'Schaden', 'inflict damage': 'Schaden zufügen', 'inflict damage to your opponent': 'Deinem Gegner Schaden zufügen', 'gain lp': 'LP gewinnen', 'recover lp': 'LP gewinnen',
  'increase atk': 'ATK erhöhen', 'gain atk': 'ATK erhöhen', 'reduce atk': 'ATK verringern', 'decrease atk': 'ATK verringern', 'change atk': 'ATK ändern', 'change level': 'Stufe ändern', 'change position': 'Position ändern', 'take control': 'Kontrolle übernehmen',
  'negate': 'Annullieren', 'negate effect': 'Effekt annullieren', 'negate the effect': 'Effekt annullieren', 'negate the activation': 'Aktivierung annullieren', 'negate activation': 'Aktivierung annullieren', 'negate attack': 'Angriff annullieren', 'negate the attack': 'Angriff annullieren',
  'negate the activation and destroy that card': 'Aktivierung annullieren und die Karte zerstören', 'destroy': 'Zerstören', 'destroy this card': 'Diese Karte zerstören', 'destroy 1 card on the field': '1 Karte auf dem Spielfeld zerstören', 'destroy 1 card your opponent controls': '1 Karte zerstören, die dein Gegner kontrolliert',
  'banish': 'Verbannen', 'equip': 'Ausrüsten', 'set': 'Setzen', 'set this card': 'Diese Karte setzen', 'activate': 'Aktivieren', 'activate 1 of these effects': '1 dieser Effekte aktivieren', 'apply 1 of these effects': '1 dieser Effekte anwenden',
  'target 1 card to destroy': '1 Karte zum Zerstören wählen', 'place this card in your pendulum zone': 'Diese Karte in deinen Pendelbereich legen', 'select the card to add to your hand or special summon': 'Wähle die Karte, die du auf die Hand nimmst oder spezialbeschwörst',
  'select the card to add to your hand or send to the gy': 'Wähle die Karte, die du auf die Hand nimmst oder auf den Friedhof schickst', 'select the card to add to your hand or set': 'Wähle die Karte, die du auf die Hand nimmst oder setzt',
};
const VERB = { destroy: 'zerstören', banish: 'verbannen', negate: 'annullieren', equip: 'ausrüsten', draw: 'ziehen', set: 'setzen', discard: 'abwerfen', send: 'schicken', return: 'zurückgeben', add: 'auf die Hand nehmen', activate: 'aktivieren' };

const VSUM = { special: 'spezialbeschwören', normal: 'normal beschwören', tribute: 'als Tribut beschwören', flip: 'flipbeschwören', fusion: 'fusionsbeschwören', synchro: 'synchrobeschwören', xyz: 'xyz-beschwören', link: 'linkbeschwören', ritual: 'ritualbeschwören', pendulum: 'pendelbeschwören' };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function part(s) {
  let t = s.trim().replace(/"[^"]*"|[^"]+/g, (x) => (x[0] === '"' ? x : x.toLowerCase())).replace(/\s+/g, ' ').replace(/[.!?]+$/, ''); if (!t) return ''; // Kartennamen in Anführungszeichen behalten ihre Schreibweise
  if (EXACT[t]) return EXACT[t];
  // „Special Summon …“ + Ort
  const m = t.match(/^(special|normal|tribute|flip|fusion|synchro|xyz|link|ritual|pendulum) summon( this card| it| itself)?(.*)$/);
  if (m) {
    let rest = m[3].trim(); for (const [re, de] of PLACE) rest = rest.replace(re, '\u2039' + de + '\u203a');
    if (!/[a-z]{2,}/i.test(rest.replace(/\u2039[^\u203a]*\u203a/g, ''))) { // sonst unbekannte Wörter → unten allgemeine Regel
      rest = rest.replace(/[\u2039\u203a]/g, '').replace(/\s+/g, ' ').trim();
      const self = m[2] && m[2].trim() !== 'it';
      if (self) return 'Diese Karte ' + (rest ? rest + ' ' : '') + VSUM[m[1]];
      return cap(SUMMON[m[1]] + (rest ? ' ' + rest : ''));
    }
  }
  // Verb + Objekt (+ Ort): „Destroy all cards your opponent controls“, „Special Summon 1 monster from your hand“
  const v = t.match(/^(special summon|normal summon|fusion summon|synchro summon|xyz summon|link summon|ritual summon|destroy|banish|negate|equip|draw|set|discard|send|return|add|search|shuffle|reveal|place|take|select|target)\b(.*)$/);
  if (v) {
    let rest = v[2].trim(); if (!rest) return '';
    for (const [re, de] of PLACE) rest = rest.replace(re, '\u2039' + de + '\u203a');
    const places = []; rest = rest.replace(/\u2039([^\u203a]*)\u203a/g, (_, x) => { places.push(x); return ' '; }).replace(/\s+/g, ' ').trim();
    if (/ (?:to|into) (?:your )?(?:the )?hand$/.test(' ' + rest)) { rest = rest.replace(/ ?(?:to|into) (?:your )?(?:the )?hand$/, ''); places.push('auf die Hand'); }
    let obj = objDe(rest); if (obj === null) return ''; if (v[1] === 'draw' && /^\d+$/.test(obj)) obj = obj + (obj === '1' ? ' Karte' : ' Karten');
    const VB = { destroy: 'zerstören', banish: 'verbannen', negate: 'annullieren', equip: 'ausrüsten', draw: 'ziehen', set: 'setzen', discard: 'abwerfen', send: 'schicken', return: 'zurückgeben', add: 'hinzufügen', search: 'suchen', shuffle: 'mischen', reveal: 'vorzeigen', place: 'platzieren', take: 'nehmen', select: 'wählen', target: 'wählen' };
    if (/summon$/.test(v[1])) return cap([...(obj ? [obj] : []), ...places, VSUM[v[1].split(' ')[0]]].join(' '));
    if (v[1] === 'add') return cap([obj || 'Karte', ...places.filter((x) => x !== 'auf die Hand'), 'auf die Hand nehmen'].join(' '));
    return cap([obj, ...places, VB[v[1]]].filter(Boolean).join(' '));
  }
  return '';
}

/** „1 Level 4 monster“ → „1 Monster der Stufe 4“; null, wenn Wörter unbekannt sind */
function objDe(t) {
  t = t.replace(/^(?:the|a|an)\b/, '1').trim(); if (!t) return ''; const out = []; let plural = false;
  const toks = t.match(/"[^"]+"|[^\s]+/g) || [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (/^\d+$/.test(w)) { out.push(w); plural = w !== '1'; }
    else if (w === 'all') { out.push('alle'); plural = true; }
    else if (w === 'level' && /^\d+$/.test(toks[i + 1] || '')) { out.push('Stufe ' + toks[i + 1]); i++; }
    else if (w[0] === '"') out.push('\u201e' + w.slice(1, -1) + '\u201c');
    else if (w === 'monster' || w === 'monsters') out.push(plural ? 'Monster' : 'Monster');
    else if (w === 'card' || w === 'cards') out.push(plural ? 'Karten' : 'Karte');
    else if (w === 'spell' || w === 'spells') out.push('Zauber'); else if (w === 'trap' || w === 'traps') out.push('Falle');
    else if (w === 'spell/trap' || w === 'spell/traps') out.push('Zauber/Falle'); else if (w === 'it') continue; else if (w === 'this') out.push('diese');
    else if (w === 'itself') out.push('diese Karte'); else if (w === 'target') out.push('Ziel'); else if (w === 'or') out.push('oder'); else if (w === 'and') out.push('und');
    else if (w === 'tuner') out.push('Empfänger'); else if (w === 'fusion') out.push('Fusions-'); else if (w === 'from') return null;
    else return null;
  }
  return out.join(' ').replace('Fusions- Monster', 'Fusionsmonster').replace(/\s+/g, ' ');
}

/** Englische Beschriftung → deutsch, sonst '' */
export function labelDe(en) {
  if (!en) return ''; const s = en.trim();
  if (/^[A-Z0-9]{2,6}-[A-Z0-9]{1,4}$|^[A-Z]{1,4}\d{1,3}$/.test(s)) return null; // Set-Kürzel wie „RIRA-JP“ – keine Beschriftung
  const parts = s.split(/\s+and\s+|\s*[,/]\s+/i); const out = [];
  const whole = part(s); if (whole) return whole;
  if (parts.length > 1) { for (const p of parts) { let x = part(p); if (!x) return ''; if (out.length && /en$/.test(x) && !/ung$/.test(x)) x = x.charAt(0).toLowerCase() + x.slice(1); out.push(x); } return out.join(' und '); }
  return '';
}
