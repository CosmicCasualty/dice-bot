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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function derivedMaxes(s) {
  return {
    health_max: 5 + s.physique + Math.floor(s.resilience / 2),
    movement_max: 3 + Math.floor((s.athletics + s.reflex) / 2),
    stress_max: 3 + s.presence,
    ap_max: s.ap_max ?? DEFAULT_MAX_AP,
  };
}

function currentOrMax(current, max) {
  if (current === null || current === undefined) return max;
  return clamp(current, 0, max);
}

function calcTraits(s) {
  const maxes = derivedMaxes(s);
  return {
    health_current: currentOrMax(s.health_current, maxes.health_max),
    health_max: maxes.health_max,
    movement_current: currentOrMax(s.movement_current, maxes.movement_max),
    movement_max: maxes.movement_max,
    stress_current: currentOrMax(s.stress_current, maxes.stress_max),
    stress_max: maxes.stress_max,
    ap_current: currentOrMax(s.ap_current, maxes.ap_max),
    ap_max: maxes.ap_max,
    dodge_defense: 10 + s.agility + s.reflex,
    parry_defense: 10 + s.physique + s.melee,
    base_defense: 10 + s.resilience,
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
    `);

    this._addColumnIfMissing('characters', 'ap_current', 'INTEGER DEFAULT 4');
    this._addColumnIfMissing('characters', 'ap_max', 'INTEGER DEFAULT 4');
    this._addColumnIfMissing('characters', 'health_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'movement_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'stress_current', 'INTEGER');
    this._addColumnIfMissing('characters', 'pending_skill_levelups', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'pending_ability_levelups', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'creation_skill_levelups_remaining', 'INTEGER DEFAULT 0');

    this.db.prepare('UPDATE characters SET ap_max = ? WHERE ap_max IS NULL').run(DEFAULT_MAX_AP);
    this.db.prepare('UPDATE characters SET ap_current = ap_max WHERE ap_current IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_skill_levelups = 0 WHERE pending_skill_levelups IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_ability_levelups = 0 WHERE pending_ability_levelups IS NULL').run();
    this.db.prepare('UPDATE characters SET creation_skill_levelups_remaining = 0 WHERE creation_skill_levelups_remaining IS NULL').run();
  }

  _addColumnIfMissing(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!columns.includes(column)) {
      this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }

  _withTraits(row) {
    if (!row) return null;
    return { ...row, traits: calcTraits(row) };
  }

  createCharacter(userId, username, charName) {
    const existing = this.listCharacters(userId);
    const isFirst = existing.length === 0;
    const result = this.db.prepare(`
      INSERT INTO characters (
        user_id, username, char_name, active, ap_current, ap_max,
        pending_skill_levelups, pending_ability_levelups, creation_skill_levelups_remaining
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username,
      charName,
      isFirst ? 1 : 0,
      DEFAULT_MAX_AP,
      DEFAULT_MAX_AP,
      STARTING_SKILL_LEVELUPS,
      STARTING_ABILITY_LEVELUPS,
      STARTING_SKILL_LEVELUPS,
    );
    return result.lastInsertRowid;
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
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(charId);
    if (char.active) {
      const next = this.db.prepare('SELECT id FROM characters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
      if (next) this.db.prepare('UPDATE characters SET active = 1 WHERE id = ?').run(next.id);
    }
    return true;
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
    return { success: true, stat, old: char[stat], new: updated[stat], charName: char.char_name, traits: updated.traits };
  }

  adjustResource(charId, resource, amount) {
    if (!['ap', 'health', 'movement', 'stress'].includes(resource)) return { success: false, error: 'Unknown resource.' };
    if (!Number.isInteger(amount) || amount < -99 || amount > 99 || amount === 0) return { success: false, error: 'Amount must be a non-zero integer from -99 to 99.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };

    const currentKey = `${resource}_current`;
    const maxKey = `${resource}_max`;
    const oldValue = char.traits[currentKey];
    const maxValue = char.traits[maxKey];
    const newValue = clamp(oldValue + amount, 0, maxValue);
    this.db.prepare(`UPDATE characters SET ${currentKey} = ? WHERE id = ?`).run(newValue, charId);

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
    };
  }

  resetTurnResources(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('UPDATE characters SET ap_current = ?, movement_current = ? WHERE id = ?')
      .run(char.traits.ap_max, char.traits.movement_max, charId);
    return { success: true, char: this.getCharacterById(charId) };
  }


  setTurnResourcesToZero(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('UPDATE characters SET ap_current = 0, movement_current = 0 WHERE id = ?').run(charId);
    return { success: true, char: this.getCharacterById(charId) };
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
  return s.charAt(0).toUpperCase() + s.slice(1);
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
