const DEFAULT_NPC_EMBED_COLOR = '#E3311D';
const DEFAULT_NPC_IMAGE_URL = 'https://media.discordapp.net/attachments/1476395797888110624/1476395798953459794/logo.png';

const NPCS = {
  /*
    examplenpc: {
    key: 'examplenpc',
    name: 'examplenpc',
    hp: 1,
    ap: 1,
    movement: 1,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Test',
    color: '#FFC0CB',
    image: 'https://media.discordapp.net/attachments/1476395797888110624/1476395798953459794/logo.png',
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
    image: 'https://png.pngtree.com/png-clipart/20240428/original/pngtree-chicken-hen-png-image_14965893.png',
    color: '#e7eae5',
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

function withNpcDefaults(npc) {
  if (!npc) return null;
  return {
    color: DEFAULT_NPC_EMBED_COLOR,
    image: DEFAULT_NPC_IMAGE_URL,
    ...npc,
  };
}

function normalizeNpcKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getNpc(name) {
  const key = normalizeNpcKey(name);
  const npc = NPCS[key];
  if (!npc) return null;
  return withNpcDefaults({ ...npc, key });
}

function listNpcs() {
  return Object.values(NPCS).map(withNpcDefaults);
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
