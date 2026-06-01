const { ABILITIES, ALL_SKILLS } = require('./database');

function oneEach(items) {
  return Object.fromEntries(items.map(item => [item, 1]));
}

const NPCS = {
  /*
    examplenpc: {
    key: 'examplenpc',
    name: 'examplenpc',
    hp: 1,
    ap: 1,
    movement: 1,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Test',
    abilities: {
      physique: 1,
      agility: 1,
      reason: 1,
      presence: 1,
    },
    skills: {
      athletics: 1,
      melee: 1,
      resilience: 1,
      aiming: 1,
      stealth: 1,
      reflex: 1,
      finesse: 1,
      awareness: 1,
      medicine: 1,
      technology: 1,
      academia: 1,
      morale: 1,
      intimidation: 1,
      persuasion: 1,
      deception: 1,
    },
  },
  */    
 chicken: {
    key: 'chicken',
    name: 'Chicken',
    hp: 1,
    ap: 2,
    movement: 5,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Chicken',
    abilities: {
      agility: 2,
    },
    skills: {
      reflex: 2,
    },
  },
  infected: {
    key: 'infected',
    name: 'Infected',
    hp: 3,
    ap: 2,
    movement: 3,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Infected',
    abilities: {
      physique: 2,
      agility: 1,
    },
    skills: {
      melee: 2,
      resilience: 2,
      awareness: 2,
      intimidation: 2,
    },
  },


};

function normalizeNpcKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getNpc(name) {
  const key = normalizeNpcKey(name);
  const npc = NPCS[key];
  if (!npc) return null;
  return { ...npc, key };
}

function listNpcs() {
  return Object.values(NPCS);
}

function getNpcAbility(npc, ability) {
  return Number(npc?.abilities?.[ability] ?? 0);
}

function getNpcSkill(npc, skill) {
  return Number(npc?.skills?.[skill] ?? 0);
}

module.exports = {
  getNpc,
  listNpcs,
  getNpcAbility,
  getNpcSkill,
};
