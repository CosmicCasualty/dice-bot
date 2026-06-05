const BetterSqlite = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const ABILITIES = ['physique', 'agility', 'reason', 'presence'];

const SKILL_TREE = {
  physique: ['athletics', 'melee', 'resilience'],
  agility: ['aiming', 'stealth', 'reflex', 'finesse'],
  reason: ['awareness', 'medicine', 'technology', 'academia'],
  presence: ['morale', 'intimidation', 'persuasion', 'deception'],
};

const ALL_SKILLS = Object.entries(SKILL_TREE).flatMap(([ability, skills]) =>
  skills.map(skill => ({ skill, ability }))
);

const DEFAULT_MAX_AP = 4;
const STARTING_ABILITY_LEVELUPS = 3;
const STARTING_SKILL_LEVELUPS = 5;
const CREATION_SKILL_CAP = 3;
const LEVELUP_CAP = 10;
const DEFAULT_CHARACTER_IMAGE_URL = 'https://media.discordapp.net/attachments/1476395797888110624/1476395798953459794/logo.png';
const DEFAULT_EMBED_COLOR = '#AAACA1';

const CONDITION_DEFINITIONS = {
  stunned: {
    name: 'Stunned',
    description: 'Disadvantage on all rolls. Cannot take Reactions.',
  },
  bleeding: {
    name: 'Bleeding',
    description: 'Take 1 damage at the end of your turn.',
  },
  prone: {
    name: 'Prone',
    description: '+2 to Aiming rolls. Gain the Slowed condition.',
    grants: ['slowed'],
  },
  blinded: {
    name: 'Blinded',
    description: 'Disadvantage on Melee, Aiming, and Awareness rolls. Cannot use Reactions. You have no vision and automatically fail any check that relies solely on sight.',
  },
  'blurred vision': {
    name: 'Blurred Vision',
    description: '-3 to Melee, Aiming, and Awareness rolls.',
  },
  weakened: {
    name: 'Weakened',
    description: 'Disadvantage on any Physique rolls.',
  },
  slowed: {
    name: 'Slowed',
    description: 'Movement halved.',
  },
  grappled: {
    name: 'Grappled',
    description: 'Cannot use movement. You are Stunned.',
    grants: ['stunned'],
  },
  grappling: {
    name: 'Grappling',
    description: 'You are Slowed. Grappled Target counts as an equipped item. Advantage on Physique-based rolls against the Grappled Target.',
    grants: ['slowed'],
  },
  hidden: {
    name: 'Hidden',
    description: 'Advantage on attack rolls. Detection is 10 + Agility + Stealth. Lost by using Movement or Attacking.',
  },
  horrified: {
    name: 'Horrified',
    description: 'You cannot willingly move closer to the source of the Condition. While you can see the source, you have the Stunned Condition.',
  },
  'aflame weak': {
    name: 'Aflame: Weak',
    description: 'Take 1 Fire Damage at the end of your turn. Extinguish DC: 12.',
    fireDamage: 1,
    extinguishDc: 12,
  },
  'aflame medium': {
    name: 'Aflame: Medium',
    description: 'Take 2 Fire Damage at the end of your turn. Extinguish DC: 15.',
    fireDamage: 2,
    extinguishDc: 15,
  },
  'aflame heavy': {
    name: 'Aflame: Heavy',
    description: 'Take 3 Fire Damage at the end of your turn. Extinguish DC: 18.',
    fireDamage: 3,
    extinguishDc: 18,
  },
};

const INJURY_DEFINITIONS = {
  concussion: {
    name: 'Concussion',
    treatment: '3 days of rest.',
    description: 'Your AP maximum is reduced by 1. You gain the Stunned condition.',
    apPenalty: 1,
    grants: ['stunned'],
  },
  'broken ribs': {
    name: 'Broken Ribs',
    treatment: '7 days of rest.',
    description: 'Your AP maximum is reduced by 1. You gain the Weakened condition.',
    apPenalty: 1,
    grants: ['weakened'],
  },
  'broken arm': {
    name: 'Broken Arm',
    treatment: 'Splint or cast for 7 days.',
    description: 'When the arm is used in an action, any rolls are at disadvantage. Roll Resilience. Result under 10: Take 1 damage.',
    grants: [],
  },
  'broken leg': {
    name: 'Broken Leg',
    treatment: 'Splint or cast for 7 days.',
    description: 'You gain the Slowed condition. When you take the Move Action, take 1 damage.',
    grants: ['slowed'],
  },
  'deep wound': {
    name: 'Deep Wound',
    treatment: 'Stitch up wound, DC 14 Medicine.',
    description: 'You gain the Bleeding condition.',
    grants: ['bleeding'],
  },
  'lost eye': {
    name: 'Lost Eye',
    treatment: 'None.',
    description: 'You gain the Blurred Vision condition.',
    grants: ['blurred vision'],
  },
  'lost eyes': {
    name: 'Lost Eyes',
    treatment: 'None.',
    description: 'You gain the Blinded condition.',
    grants: ['blinded'],
  },
  'punctured lung': {
    name: 'Punctured Lung',
    treatment: '3 days of rest.',
    description: 'Your AP maximum is reduced by 2. You gain the Slowed condition.',
    apPenalty: 2,
    grants: ['slowed'],
  },
};

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function apPenaltyFromInjuries(injuries = []) {
  return injuries.reduce((sum, injury) => sum + (INJURY_DEFINITIONS[injury.name]?.apPenalty || 0), 0);
}

function derivedMaxes(s, injuries = []) {
  const apPenalty = apPenaltyFromInjuries(injuries);
  return {
    health_max: 5 + s.physique + Math.floor(s.resilience / 2),
    movement_max: 3 + Math.floor((s.athletics + s.reflex) / 2),
    stress_max: 3 + s.presence,
    ap_max: Math.max(0, (s.ap_max ?? DEFAULT_MAX_AP) - apPenalty),
  };
}

function currentOrMax(current, max) {
  if (current === null || current === undefined) return max;
  return clamp(current, 0, max);
}

function currentOrZero(current, max) {
  if (current === null || current === undefined) return 0;
  return clamp(current, 0, max);
}

function calcTraits(s, injuries = []) {
  const maxes = derivedMaxes(s, injuries);
  return {
    health_current: currentOrMax(s.health_current, maxes.health_max),
    health_max: maxes.health_max,
    movement_current: currentOrMax(s.movement_current, maxes.movement_max),
    movement_max: maxes.movement_max,
    stress_current: currentOrZero(s.stress_current, maxes.stress_max),
    stress_max: maxes.stress_max,
    ap_current: currentOrMax(s.ap_current, maxes.ap_max),
    ap_max: maxes.ap_max,
    dodge_defense: 10 + s.agility + s.reflex,
    parry_defense: 10 + s.physique + s.melee,
    base_defense: 10 + s.resilience,
    detection: 10 + s.agility + s.stealth,
  };
}

class DB {
  constructor(filePath = './data/dice.db') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new BetterSqlite(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.SKILL_TREE = SKILL_TREE;
    this.ABILITIES = ABILITIES;
    this.ALL_SKILLS = ALL_SKILLS;
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        char_name TEXT NOT NULL,
        char_image_url TEXT DEFAULT '${DEFAULT_CHARACTER_IMAGE_URL}',
        embed_color TEXT DEFAULT '${DEFAULT_EMBED_COLOR}',
        active INTEGER DEFAULT 0,
        physique INTEGER DEFAULT 0,
        agility INTEGER DEFAULT 0,
        reason INTEGER DEFAULT 0,
        presence INTEGER DEFAULT 0,
        athletics INTEGER DEFAULT 0,
        melee INTEGER DEFAULT 0,
        resilience INTEGER DEFAULT 0,
        aiming INTEGER DEFAULT 0,
        stealth INTEGER DEFAULT 0,
        reflex INTEGER DEFAULT 0,
        finesse INTEGER DEFAULT 0,
        awareness INTEGER DEFAULT 0,
        medicine INTEGER DEFAULT 0,
        technology INTEGER DEFAULT 0,
        academia INTEGER DEFAULT 0,
        morale INTEGER DEFAULT 0,
        intimidation INTEGER DEFAULT 0,
        persuasion INTEGER DEFAULT 0,
        deception INTEGER DEFAULT 0,
        ap_current INTEGER DEFAULT 4,
        ap_max INTEGER DEFAULT 4,
        health_current INTEGER,
        movement_current INTEGER,
        stress_current INTEGER,
        pending_skill_levelups INTEGER DEFAULT 5,
        pending_ability_levelups INTEGER DEFAULT 3,
        creation_skill_levelups_remaining INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS roll_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        char_name TEXT NOT NULL,
        skill TEXT,
        ability TEXT,
        dice_result INTEGER NOT NULL,
        modifier INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        rolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS character_conditions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        rounds INTEGER,
        source TEXT DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE,
        UNIQUE(char_id, name, source)
      );

      CREATE TABLE IF NOT EXISTS character_injuries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE,
        UNIQUE(char_id, name)
      );

      CREATE TABLE IF NOT EXISTS sheet_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id INTEGER NOT NULL,
        guild_id TEXT,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `);

    this._addColumnIfMissing('characters', 'ap_current', 'INTEGER DEFAULT 4');
    this._addColumnIfMissing('characters', 'ap_max', 'INTEGER DEFAULT 4');
    this._addColumnIfMissing('characters', 'health_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'movement_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'stress_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'pending_skill_levelups', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'pending_ability_levelups', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'creation_skill_levelups_remaining', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'char_image_url', `TEXT DEFAULT '${DEFAULT_CHARACTER_IMAGE_URL}'`);
    this._addColumnIfMissing('characters', 'embed_color', `TEXT DEFAULT '${DEFAULT_EMBED_COLOR}'`);

    this.db.prepare('UPDATE characters SET ap_max = ? WHERE ap_max IS NULL').run(DEFAULT_MAX_AP);
    this.db.prepare('UPDATE characters SET ap_current = ap_max WHERE ap_current IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_skill_levelups = 0 WHERE pending_skill_levelups IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_ability_levelups = 0 WHERE pending_ability_levelups IS NULL').run();
    this.db.prepare('UPDATE characters SET creation_skill_levelups_remaining = 0 WHERE creation_skill_levelups_remaining IS NULL').run();
    this.db.prepare("UPDATE characters SET char_image_url = ? WHERE char_image_url IS NULL OR TRIM(char_image_url) = ''").run(DEFAULT_CHARACTER_IMAGE_URL);
    this.db.prepare("UPDATE characters SET embed_color = ? WHERE embed_color IS NULL OR TRIM(embed_color) = ''").run(DEFAULT_EMBED_COLOR);
  }

  _addColumnIfMissing(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!columns.includes(column)) {
      this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }

  _conditionsForChar(charId) {
    return this.db.prepare('SELECT * FROM character_conditions WHERE char_id = ? ORDER BY name ASC, source ASC').all(charId).map(c => ({
      ...c,
      displayName: CONDITION_DEFINITIONS[c.name]?.name || capitalize(c.name),
      definition: CONDITION_DEFINITIONS[c.name] || null,
      persistent: c.rounds === null || c.rounds === undefined,
    }));
  }

  _injuriesForChar(charId) {
    return this.db.prepare('SELECT * FROM character_injuries WHERE char_id = ? ORDER BY name ASC').all(charId).map(i => ({
      ...i,
      displayName: INJURY_DEFINITIONS[i.name]?.name || capitalize(i.name),
      definition: INJURY_DEFINITIONS[i.name] || null,
    }));
  }

  _withTraits(row) {
    if (!row) return null;
    const injuries = this._injuriesForChar(row.id);
    const conditions = this._conditionsForChar(row.id);
    const traits = calcTraits(row, injuries);
    if (conditions.some(c => c.name === 'slowed')) {
      traits.movement_max = Math.floor(traits.movement_max / 2);
      traits.movement_current = clamp(traits.movement_current, 0, traits.movement_max);
    }
    return { ...row, injuries, conditions, traits };
  }

  createCharacter(userId, username, charName) {
    const existing = this.listCharacters(userId);
    const isFirst = existing.length === 0;
    const result = this.db.prepare(`
      INSERT INTO characters (
        user_id, username, char_name, char_image_url, embed_color, active, ap_current, ap_max, stress_current,
        pending_skill_levelups, pending_ability_levelups, creation_skill_levelups_remaining
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username,
      charName,
      DEFAULT_CHARACTER_IMAGE_URL,
      DEFAULT_EMBED_COLOR,
      isFirst ? 1 : 0,
      DEFAULT_MAX_AP,
      DEFAULT_MAX_AP,
      0,
      STARTING_SKILL_LEVELUPS,
      STARTING_ABILITY_LEVELUPS,
      STARTING_SKILL_LEVELUPS,
    );
    return result.lastInsertRowid;
  }

  copyCharacterToUser(sourceCharId, targetUserId, targetUsername) {
    const source = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(sourceCharId);
    if (!source) return { success: false, error: `No character with ID ${sourceCharId}.` };
    if (!targetUserId) return { success: false, error: 'A target player is required.' };

    const copyTransaction = this.db.transaction(() => {
      const hasCharacters = this.db.prepare('SELECT 1 FROM characters WHERE user_id = ? LIMIT 1').get(targetUserId);
      const columnsToCopy = this.db.prepare('PRAGMA table_info(characters)')
        .all()
        .map(c => c.name)
        .filter(name => !['id', 'user_id', 'username', 'active', 'created_at'].includes(name));
      const insertColumns = ['user_id', 'username', 'active', ...columnsToCopy];
      const quotedColumns = insertColumns.map(name => `"${name}"`).join(', ');
      const placeholders = insertColumns.map(() => '?').join(', ');
      const values = [targetUserId, targetUsername || targetUserId, hasCharacters ? 0 : 1, ...columnsToCopy.map(name => source[name])];
      const result = this.db.prepare(`INSERT INTO characters (${quotedColumns}) VALUES (${placeholders})`).run(...values);
      const newCharId = result.lastInsertRowid;

      const conditions = this.db.prepare('SELECT name, rounds, source FROM character_conditions WHERE char_id = ?').all(sourceCharId);
      const insertCondition = this.db.prepare('INSERT INTO character_conditions (char_id, name, rounds, source) VALUES (?, ?, ?, ?)');
      for (const condition of conditions) {
        insertCondition.run(newCharId, condition.name, condition.rounds, condition.source);
      }

      const injuries = this.db.prepare('SELECT name FROM character_injuries WHERE char_id = ?').all(sourceCharId);
      const insertInjury = this.db.prepare('INSERT INTO character_injuries (char_id, name) VALUES (?, ?)');
      for (const injury of injuries) {
        insertInjury.run(newCharId, injury.name);
      }

      return newCharId;
    });

    const newCharId = copyTransaction();
    return { success: true, source: this.getCharacterById(sourceCharId), copy: this.getCharacterById(newCharId) };
  }

  getCharacterById(charId, userId = null) {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
    if (!row) return null;
    if (userId && row.user_id !== userId) return null;
    return this._withTraits(row);
  }

  getActiveCharacter(userId) {
    const row = this.db.prepare('SELECT * FROM characters WHERE user_id = ? AND active = 1 LIMIT 1').get(userId);
    return this._withTraits(row);
  }

  listCharacters(userId) {
    return this.db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC').all(userId).map(row => this._withTraits(row));
  }

  listAllCharacters() {
    return this.db.prepare('SELECT * FROM characters ORDER BY username COLLATE NOCASE ASC, char_name COLLATE NOCASE ASC, id ASC').all().map(row => this._withTraits(row));
  }

  setActiveCharacter(userId, charId) {
    const char = this.getCharacterById(charId, userId);
    if (!char) return false;
    this.db.prepare('UPDATE characters SET active = 0 WHERE user_id = ?').run(userId);
    this.db.prepare('UPDATE characters SET active = 1 WHERE id = ?').run(charId);
    return true;
  }

  deleteCharacter(userId, charId) {
    const char = this.getCharacterById(charId, userId);
    if (!char) return false;
    this.db.prepare('DELETE FROM roll_history WHERE char_id = ?').run(charId);
    this.db.prepare('DELETE FROM character_conditions WHERE char_id = ?').run(charId);
    this.db.prepare('DELETE FROM character_injuries WHERE char_id = ?').run(charId);
    this.db.prepare('DELETE FROM sheet_posts WHERE char_id = ?').run(charId);
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(charId);
    if (char.active) {
      const next = this.db.prepare('SELECT id FROM characters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
      if (next) this.db.prepare('UPDATE characters SET active = 1 WHERE id = ?').run(next.id);
    }
    return true;
  }

  renameCharacter(userId, charId, newName) {
    const name = String(newName || '').trim();
    if (!name || name.length > 50) return { success: false, error: 'Character name must be 1 to 50 characters.' };
    const char = this.getCharacterById(charId, userId);
    if (!char) return { success: false, error: `No character with ID ${charId} found for you.` };
    this.db.prepare('UPDATE characters SET char_name = ? WHERE id = ?').run(name, charId);
    return { success: true, oldName: char.char_name, newName: name, char: this.getCharacterById(charId, userId) };
  }

  setCharacterImage(userId, charId, imageUrl) {
    const url = String(imageUrl || '').trim() || DEFAULT_CHARACTER_IMAGE_URL;
    const char = this.getCharacterById(charId, userId);
    if (!char) return { success: false, error: `No character with ID ${charId} found for you.` };
    this.db.prepare('UPDATE characters SET char_image_url = ? WHERE id = ?').run(url, charId);
    return { success: true, imageUrl: url, char: this.getCharacterById(charId, userId) };
  }

  setCharacterColor(userId, charId, embedColor) {
    const color = String(embedColor || '').trim().toUpperCase();
    const char = this.getCharacterById(charId, userId);
    if (!char) return { success: false, error: `No character with ID ${charId} found for you.` };
    this.db.prepare('UPDATE characters SET embed_color = ? WHERE id = ?').run(color, charId);
    return { success: true, embedColor: color, char: this.getCharacterById(charId, userId) };
  }


  upsertSheetPost(charId, guildId, channelId, messageId) {
    const char = this.getCharacterById(charId);
    if (!char || !channelId || !messageId) return false;
    this.db.prepare(`
      INSERT INTO sheet_posts (char_id, guild_id, channel_id, message_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        char_id = excluded.char_id,
        guild_id = excluded.guild_id,
        channel_id = excluded.channel_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(charId, guildId || null, channelId, messageId);
    return true;
  }

  listSheetPosts(charId) {
    return this.db.prepare('SELECT * FROM sheet_posts WHERE char_id = ? ORDER BY updated_at DESC').all(charId);
  }

  deleteSheetPost(messageId) {
    this.db.prepare('DELETE FROM sheet_posts WHERE message_id = ?').run(messageId);
  }

  deleteSheetPostsForCharacter(charId) {
    this.db.prepare('DELETE FROM sheet_posts WHERE char_id = ?').run(charId);
  }

  grantLevelUp(charId, type, amount = 1) {
    if (!['skill', 'ability'].includes(type)) return { success: false, error: 'Level-up type must be skill or ability.' };
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) return { success: false, error: 'Amount must be an integer between 1 and 99.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const column = type === 'skill' ? 'pending_skill_levelups' : 'pending_ability_levelups';
    this.db.prepare(`UPDATE characters SET ${column} = ${column} + ? WHERE id = ?`).run(amount, charId);
    const updated = this.getCharacterById(charId);
    return { success: true, type, amount, charName: updated.char_name, pendingSkill: updated.pending_skill_levelups, pendingAbility: updated.pending_ability_levelups };
  }

  spendLevelUp(charId, type, statName) {
    const stat = statName.toLowerCase();
    const isAbilityType = type === 'ability';
    const isSkillType = type === 'skill';
    if (!isAbilityType && !isSkillType) return { success: false, error: 'Level-up type must be skill or ability.' };
    if (isAbilityType && !this.isAbility(stat)) return { success: false, error: `Unknown ability \`${stat}\`.` };
    if (isSkillType && !this.isSkill(stat)) return { success: false, error: `Unknown skill \`${stat}\`.` };

    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };

    const pendingColumn = isAbilityType ? 'pending_ability_levelups' : 'pending_skill_levelups';
    if (char[pendingColumn] <= 0) return { success: false, error: `No pending ${type} level-ups for this character.` };

    const isCreationSkillLevel = isSkillType && char.creation_skill_levelups_remaining > 0;
    const maxValue = isCreationSkillLevel ? CREATION_SKILL_CAP : LEVELUP_CAP;
    if (char[stat] >= maxValue) {
      const reason = isCreationSkillLevel
        ? `Starting skill level-ups cannot raise a skill above ${CREATION_SKILL_CAP}.`
        : `${capitalize(stat)} is already at the level-up cap of ${LEVELUP_CAP}.`;
      return { success: false, error: reason };
    }

    const creationSkillPart = isCreationSkillLevel ? ', creation_skill_levelups_remaining = creation_skill_levelups_remaining - 1' : '';
    this.db.prepare(`
      UPDATE characters
      SET "${stat}" = "${stat}" + 1,
          ${pendingColumn} = ${pendingColumn} - 1
          ${creationSkillPart}
      WHERE id = ?
    `).run(charId);

    const updated = this.getCharacterById(charId);
    return {
      success: true,
      type,
      stat,
      old: char[stat],
      new: updated[stat],
      charName: updated.char_name,
      traits: updated.traits,
      pendingSkill: updated.pending_skill_levelups,
      pendingAbility: updated.pending_ability_levelups,
      creationSkillRemaining: updated.creation_skill_levelups_remaining,
    };
  }

  setStat(charId, statName, value) {
    const stat = statName.toLowerCase();
    if (!this.isAbility(stat) && !this.isSkill(stat)) return { success: false, error: `Unknown stat \`${stat}\`.` };
    if (!Number.isInteger(value) || value < 0 || value > 99) return { success: false, error: 'Value must be an integer between 0 and 99.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare(`UPDATE characters SET "${stat}" = ? WHERE id = ?`).run(value, charId);
    const updated = this.getCharacterById(charId);
    this._syncCurrentResources(charId);
    return { success: true, stat, old: char[stat], new: updated[stat], charName: char.char_name, traits: this.getCharacterById(charId).traits };
  }

  adjustResource(charId, resource, amount) {
    if (!['ap', 'health', 'movement', 'stress'].includes(resource)) return { success: false, error: 'Unknown resource.' };
    if (!Number.isInteger(amount) || amount < -99 || amount > 99 || amount === 0) return { success: false, error: 'Amount must be a non-zero integer from -99 to 99.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    if (resource === 'movement' && this.hasCondition(char, 'grappled') && amount < 0) return { success: false, error: 'This character is Grappled and cannot use movement.' };

    const currentKey = `${resource}_current`;
    const maxKey = `${resource}_max`;
    const oldValue = char.traits[currentKey];
    const maxValue = char.traits[maxKey];
    const newValue = clamp(oldValue + amount, 0, maxValue);
    this.db.prepare(`UPDATE characters SET ${currentKey} = ? WHERE id = ?`).run(newValue, charId);

    let removedHidden = false;
    if (resource === 'movement' && amount < 0 && this.hasCondition(char, 'hidden')) {
      this.removeCondition(charId, 'hidden');
      removedHidden = true;
    }

    const updated = this.getCharacterById(charId);
    return {
      success: true,
      char: updated,
      resource,
      amount,
      oldValue,
      newValue,
      maxValue,
      hitZero: oldValue > 0 && newValue === 0,
      hitFull: resource === 'stress' && oldValue < maxValue && newValue === maxValue,
      removedHidden,
    };
  }

  resetTurnResources(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const endEffects = this.applyEndTurnEffects(charId);
    const conditionTick = this.tickConditions(charId);
    const afterConditions = this.getCharacterById(charId);
    this.db.prepare('UPDATE characters SET ap_current = ?, movement_current = ? WHERE id = ?')
      .run(afterConditions.traits.ap_max, afterConditions.traits.movement_max, charId);
    return { success: true, char: this.getCharacterById(charId), endEffects, conditionTick };
  }

  applyEndTurnEffects(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { damage: 0, lines: [] };
    let damage = 0;
    const lines = [];
    if (this.hasCondition(char, 'bleeding')) {
      damage += 1;
      lines.push('Bleeding deals 1 damage.');
    }
    for (const condition of char.conditions) {
      const def = CONDITION_DEFINITIONS[condition.name];
      if (def?.fireDamage) {
        damage += def.fireDamage;
        lines.push(`${def.name} deals ${def.fireDamage} Fire Damage. Extinguish DC: ${def.extinguishDc}.`);
      }
    }
    if (damage > 0) {
      const current = char.traits.health_current;
      const next = clamp(current - damage, 0, char.traits.health_max);
      this.db.prepare('UPDATE characters SET health_current = ? WHERE id = ?').run(next, charId);
      lines.push(`HP changes from ${current}/${char.traits.health_max} to ${next}/${char.traits.health_max}.`);
    }
    return { damage, lines };
  }

  tickConditions(charId) {
    const expiring = this.db.prepare('SELECT id, name, rounds FROM character_conditions WHERE char_id = ? AND source = ? AND rounds IS NOT NULL AND rounds <= 1')
      .all(charId, 'manual');
    const ticking = this.db.prepare('SELECT id, name, rounds FROM character_conditions WHERE char_id = ? AND source = ? AND rounds IS NOT NULL AND rounds > 1')
      .all(charId, 'manual');
    this.db.prepare('DELETE FROM character_conditions WHERE char_id = ? AND source = ? AND rounds IS NOT NULL AND rounds <= 1').run(charId, 'manual');
    this.db.prepare('UPDATE character_conditions SET rounds = rounds - 1 WHERE char_id = ? AND source = ? AND rounds IS NOT NULL AND rounds > 1').run(charId, 'manual');
    return { expired: expiring, reduced: ticking };
  }

  setTurnResourcesToZero(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('UPDATE characters SET ap_current = 0, movement_current = 0 WHERE id = ?').run(charId);
    return { success: true, char: this.getCharacterById(charId) };
  }

  resetStressToZero(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('UPDATE characters SET stress_current = 0 WHERE id = ?').run(charId);
    return { success: true, char: this.getCharacterById(charId) };
  }

  addCondition(charId, name, rounds = 1, source = 'manual') {
    const key = normalizeName(name);
    if (!CONDITION_DEFINITIONS[key]) return { success: false, error: `Unknown condition: ${name}.` };
    if (source === 'manual' && (!Number.isInteger(rounds) || rounds < 1 || rounds > 99)) return { success: false, error: 'Time must be from 1 to 99 rounds.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const storedRounds = source === 'manual' ? rounds : null;
    this.db.prepare(`
      INSERT INTO character_conditions (char_id, name, rounds, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(char_id, name, source) DO UPDATE SET rounds = excluded.rounds
    `).run(charId, key, storedRounds, source);
    const grants = [];
    for (const granted of (CONDITION_DEFINITIONS[key].grants || [])) {
      this.addCondition(charId, granted, storedRounds || 1, source);
      grants.push(CONDITION_DEFINITIONS[granted].name);
    }
    return { success: true, condition: CONDITION_DEFINITIONS[key], rounds: storedRounds, grants, char: this.getCharacterById(charId) };
  }

  removeCondition(charId, name, source = null) {
    const key = normalizeName(name);
    if (!CONDITION_DEFINITIONS[key]) return { success: false, error: `Unknown condition: ${name}.` };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const info = this.db.prepare('SELECT * FROM character_conditions WHERE char_id = ? AND name = ?').all(charId, key);
    if (!info.length) return { success: false, error: `${char.char_name} does not have ${CONDITION_DEFINITIONS[key].name}.` };
    if (source) this.db.prepare('DELETE FROM character_conditions WHERE char_id = ? AND name = ? AND source = ?').run(charId, key, source);
    else this.db.prepare('DELETE FROM character_conditions WHERE char_id = ? AND name = ?').run(charId, key);
    return { success: true, condition: CONDITION_DEFINITIONS[key], char: this.getCharacterById(charId) };
  }

  addInjury(charId, name) {
    const key = normalizeName(name);
    const injury = INJURY_DEFINITIONS[key];
    if (!injury) return { success: false, error: `Unknown injury: ${name}.` };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('INSERT OR IGNORE INTO character_injuries (char_id, name) VALUES (?, ?)').run(charId, key);
    for (const condition of (injury.grants || [])) this.addCondition(charId, condition, 1, `injury:${key}`);
    this._syncCurrentResources(charId);
    return { success: true, injury, char: this.getCharacterById(charId) };
  }

  removeInjury(charId, name) {
    const key = normalizeName(name);
    const injury = INJURY_DEFINITIONS[key];
    if (!injury) return { success: false, error: `Unknown injury: ${name}.` };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const existing = this.db.prepare('SELECT * FROM character_injuries WHERE char_id = ? AND name = ?').get(charId, key);
    if (!existing) return { success: false, error: `${char.char_name} does not have ${injury.name}.` };
    this.db.prepare('DELETE FROM character_injuries WHERE char_id = ? AND name = ?').run(charId, key);
    this.db.prepare('DELETE FROM character_conditions WHERE char_id = ? AND source = ?').run(charId, `injury:${key}`);
    this._syncCurrentResources(charId);
    return { success: true, injury, char: this.getCharacterById(charId) };
  }

  _syncCurrentResources(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return;
    this.db.prepare('UPDATE characters SET ap_current = ?, health_current = ?, movement_current = ?, stress_current = ? WHERE id = ?')
      .run(char.traits.ap_current, char.traits.health_current, char.traits.movement_current, char.traits.stress_current, charId);
  }

  hasCondition(charOrId, name) {
    const key = normalizeName(name);
    const char = typeof charOrId === 'object' ? charOrId : this.getCharacterById(charOrId);
    if (!char) return false;
    return char.conditions.some(c => c.name === key);
  }

  rollModifiers(char, type, stat, parentAbility = null, requestedMode = 'normal') {
    let mode = requestedMode;
    let flat = 0;
    const notes = [];
    const has = name => this.hasCondition(char, name);
    const forceDis = reason => {
      if (mode === 'adv') notes.push(`${reason} changes advantage to normal.`);
      else if (mode !== 'dis') notes.push(`${reason} applies disadvantage.`);
      mode = mode === 'adv' ? 'normal' : 'dis';
    };
    const forceAdv = reason => {
      if (mode === 'dis') notes.push(`${reason} changes disadvantage to normal.`);
      else if (mode !== 'adv') notes.push(`${reason} applies advantage.`);
      mode = mode === 'dis' ? 'normal' : 'adv';
    };

    if (has('stunned')) forceDis('Stunned');
    if (has('blinded') && type === 'skill' && ['melee', 'aiming', 'awareness'].includes(stat)) forceDis('Blinded');
    if (has('weakened') && (stat === 'physique' || parentAbility === 'physique')) forceDis('Weakened');
    if (has('grappling') && (stat === 'physique' || parentAbility === 'physique')) forceAdv('Grappling');
    if (has('hidden') && type === 'skill' && ['melee', 'aiming'].includes(stat)) forceAdv('Hidden');
    if (has('prone') && stat === 'aiming') {
      flat += 2;
      notes.push('Prone grants +2 to Aiming.');
    }
    if (has('blurred vision') && type === 'skill' && ['melee', 'aiming', 'awareness'].includes(stat)) {
      flat -= 3;
      notes.push('Blurred Vision applies -3.');
    }

    return { mode, flat, notes };
  }

  recordRoll(charId, stat, ability, diceResult, modifier, total) {
    const char = this.getCharacterById(charId);
    if (!char) return;
    this.db.prepare(`
      INSERT INTO roll_history (char_id, user_id, username, char_name, skill, ability, dice_result, modifier, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(charId, char.user_id, char.username, char.char_name, stat, ability, diceResult, modifier, total);
  }

  getRollHistory(charId, limit = 10) {
    return this.db.prepare('SELECT * FROM roll_history WHERE char_id = ? ORDER BY rolled_at DESC LIMIT ?').all(charId, limit);
  }

  getParentAbility(skillName) {
    const entry = ALL_SKILLS.find(s => s.skill === skillName.toLowerCase());
    return entry ? entry.ability : null;
  }

  isSkill(name) {
    return ALL_SKILLS.some(s => s.skill === name.toLowerCase());
  }

  isAbility(name) {
    return ABILITIES.includes(name.toLowerCase());
  }
}

function capitalize(s) {
  return String(s).split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

module.exports = DB;
module.exports.calcTraits = calcTraits;
module.exports.SKILL_TREE = SKILL_TREE;
module.exports.ABILITIES = ABILITIES;
module.exports.ALL_SKILLS = ALL_SKILLS;
module.exports.DEFAULT_MAX_AP = DEFAULT_MAX_AP;
module.exports.STARTING_ABILITY_LEVELUPS = STARTING_ABILITY_LEVELUPS;
module.exports.STARTING_SKILL_LEVELUPS = STARTING_SKILL_LEVELUPS;
module.exports.CREATION_SKILL_CAP = CREATION_SKILL_CAP;
module.exports.LEVELUP_CAP = LEVELUP_CAP;
module.exports.DEFAULT_CHARACTER_IMAGE_URL = DEFAULT_CHARACTER_IMAGE_URL;
module.exports.DEFAULT_EMBED_COLOR = DEFAULT_EMBED_COLOR;
module.exports.CONDITION_DEFINITIONS = CONDITION_DEFINITIONS;
module.exports.INJURY_DEFINITIONS = INJURY_DEFINITIONS;
module.exports.normalizeName = normalizeName;
