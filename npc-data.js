const DEFAULT_NPC_EMBED_COLOR = '#E3311D';
const DEFAULT_NPC_IMAGE_URL = 'https://media.discordapp.net/attachments/1476395797888110624/1476395798953459794/logo.png';
const DEFAULT_MAX_AP = 4;

const NPCS = {
  /*
    examplenpc: {
    key: 'examplenpc',
    name: 'examplenpc',

    // Optional resource/trait overrides. If omitted, they are calculated from abilities and skills.
    hp: 1,       
    ap: 1,
    movement: 1,
    stress: 1,
    base_defense: 12, 
    dodge_defense: 12,
    parry_defense: 12,    
    detection: 12,         

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
    stress:1,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Chicken',
    image: 'https://media.discordapp.net/attachments/1381481140249952276/1510914242315026492/standing-rooster-with-colorful-plumage-against-whi-2026-03-16-04-46-55-utc.JPG',
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
    stress:0,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Infected',
    image: 'https://static.wikia.nocookie.net/monster/images/8/8c/InfectedScan.jpg',
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
  gaseous: {
    key: 'gaseous',
    name: 'Gaseous Infected',
    hp: 2,
    ap: 2,
    movement: 2,
    stress:0,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Gaseous_Infected',
    image: 'https://static.wikia.nocookie.net/left4dead/images/3/38/Boomer_2.png',
    abilities: {
      physique: 2,
    },
    skills: {
      resilience: 4,
      intimidation: 3,
    },
  },
  frenzied: {
    key: 'frenzied',
    name: 'Frenzied Infected',
    hp: 2,
    ap: 3,
    movement: 5,
    stress:0,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Tackler_Infected',
    image: 'https://static.wikia.nocookie.net/worldwarzgame/images/e/e0/Lurker_close_up.jpg',
    abilities: {
      physique: 1,
      agility: 3,
    },
    skills: {
      athletics: 3,
      melee: 1,
      resilience: 2,
      reflex: 3,
    },
  },
  inciting: {
    key: 'inciting',
    name: 'Inciting Infected',
    hp: 2,
    ap: 3,
    movement: 5,
    stress:0,
    wikiUrl: 'https://www.staff.theundeadarchive.com/Inciting_Infected',
    image: 'https://static.wikia.nocookie.net/7daystodie_gamepedia/images/0/0d/Businessman_Zombie_2_.png',
    abilities: {
      reason: 2,
      presence: 3,
    },
    skills: {
      awareness: 2,
      morale: 2,
      intimidation: 3,
      persuasion: 3,
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

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function calculatedNpcTraits(npc) {
  const physique = getNpcAbility(npc, 'physique');
  const agility = getNpcAbility(npc, 'agility');
  const presence = getNpcAbility(npc, 'presence');
  const athletics = getNpcSkill(npc, 'athletics');
  const reflex = getNpcSkill(npc, 'reflex');
  const resilience = getNpcSkill(npc, 'resilience');
  const melee = getNpcSkill(npc, 'melee');
  const stealth = getNpcSkill(npc, 'stealth');

  return {
    health: 5 + physique + Math.floor(resilience / 2),
    movement: 3 + Math.floor((athletics + reflex) / 2),
    stress: 3 + presence,
    ap: DEFAULT_MAX_AP,
    base_defense: 10 + resilience,
    dodge_defense: 10 + agility + reflex,
    parry_defense: 10 + physique + melee,
    detection: 10 + agility + stealth,
  };
}

function getNpcTraits(npc) {
  const calculated = calculatedNpcTraits(npc);

  const health = firstNumber(npc?.health, npc?.hp, npc?.health_max) ?? calculated.health;
  const movement = firstNumber(npc?.movement, npc?.movement_max) ?? calculated.movement;
  const stress = firstNumber(npc?.stress, npc?.stress_max) ?? calculated.stress;
  const ap = firstNumber(npc?.ap, npc?.ap_max) ?? calculated.ap;

  return {
    health,
    hp: health,
    movement,
    stress,
    ap,
    base_defense: firstNumber(npc?.base_defense, npc?.base_defense_dc, npc?.defense, npc?.defense_dc) ?? calculated.base_defense,
    dodge_defense: firstNumber(npc?.dodge_defense, npc?.dodge_defense_dc, npc?.dodge, npc?.dodge_dc) ?? calculated.dodge_defense,
    parry_defense: firstNumber(npc?.parry_defense, npc?.parry_defense_dc, npc?.parry, npc?.parry_dc) ?? calculated.parry_defense,
    detection: firstNumber(npc?.detection, npc?.detection_dc) ?? calculated.detection,
  };
}

module.exports = {
  getNpc,
  listNpcs,
  getNpcAbility,
  getNpcSkill,
  getNpcTraits,
};
