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

function calcTraits(s) {
  return {
    health: 5 + s.physique + Math.floor(s.resilience / 2),
    movement: 3 + Math.floor((s.athletics + s.reflex) / 2),
    stress: 3 + s.presence,
    dodge_defense: 10 + s.agility + s.reflex,
    parry_defense: 10 + s.physique + s.melee,
    ap_current: s.ap_current ?? DEFAULT_MAX_AP,
    ap_max: s.ap_max ?? DEFAULT_MAX_AP,
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
        pending_skill_levelups INTEGER DEFAULT 0,
        pending_ability_levelups INTEGER DEFAULT 0,
        total_rolls INTEGER DEFAULT 0,
        crits INTEGER DEFAULT 0,
        fumbles INTEGER DEFAULT 0,
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
    this._addColumnIfMissing('characters', 'pending_skill_levelups', 'INTEGER DEFAULT 0');
    this._addColumnIfMissing('characters', 'pending_ability_levelups', 'INTEGER DEFAULT 0');
    this.db.prepare('UPDATE characters SET ap_max = ? WHERE ap_max IS NULL').run(DEFAULT_MAX_AP);
    this.db.prepare('UPDATE characters SET ap_current = ap_max WHERE ap_current IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_skill_levelups = 0 WHERE pending_skill_levelups IS NULL').run();
    this.db.prepare('UPDATE characters SET pending_ability_levelups = 0 WHERE pending_ability_levelups IS NULL').run();
  }

  _addColumnIfMissing(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!columns.includes(column)) {
      this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }

  createCharacter(userId, username, charName) {
    const existing = this.listCharacters(userId);
    const isFirst = existing.length === 0;
    const result = this.db.prepare(`
      INSERT INTO characters (user_id, username, char_name, active, ap_current, ap_max)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, charName, isFirst ? 1 : 0, DEFAULT_MAX_AP, DEFAULT_MAX_AP);
    return result.lastInsertRowid;
  }

  getCharacterById(charId, userId = null) {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
    if (!row) return null;
    if (userId && row.user_id !== userId) return null;
    return { ...row, traits: calcTraits(row) };
  }

  getActiveCharacter(userId) {
    const row = this.db.prepare(`
      SELECT * FROM characters WHERE user_id = ? AND active = 1 LIMIT 1
    `).get(userId);
    if (!row) return null;
    return { ...row, traits: calcTraits(row) };
  }

  listCharacters(userId) {
    return this.db.prepare(`
      SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC
    `).all(userId).map(row => ({ ...row, traits: calcTraits(row) }));
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
      const next = this.db.prepare(`
        SELECT id FROM characters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(userId);
      if (next) this.db.prepare('UPDATE characters SET active = 1 WHERE id = ?').run(next.id);
    }
    return true;
  }

  grantLevelUp(charId, type, amount = 1) {
    if (!['skill', 'ability'].includes(type)) {
      return { success: false, error: 'Level-up type must be skill or ability.' };
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) {
      return { success: false, error: 'Amount must be an integer between 1 and 99.' };
    }
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

    const oldVal = char[stat];
    this.db.prepare(`UPDATE characters SET "${stat}" = "${stat}" + 1, ${pendingColumn} = ${pendingColumn} - 1 WHERE id = ?`).run(charId);
    const updated = this.getCharacterById(charId);
    return { success: true, type, stat, old: oldVal, new: updated[stat], charName: updated.char_name, traits: updated.traits, pendingSkill: updated.pending_skill_levelups, pendingAbility: updated.pending_ability_levelups };
  }

  setStat(charId, statName, value) {
    const stat = statName.toLowerCase();
    if (!this.isAbility(stat) && !this.isSkill(stat)) return { success: false, error: `Unknown stat \`${stat}\`.` };
    if (!Number.isInteger(value) || value < 0 || value > 99) return { success: false, error: 'Value must be an integer between 0 and 99.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const oldVal = char[stat];
    this.db.prepare(`UPDATE characters SET "${stat}" = ? WHERE id = ?`).run(value, charId);
    const updated = this.getCharacterById(charId);
    return { success: true, stat, old: oldVal, new: updated[stat], charName: char.char_name, traits: updated.traits };
  }

  spendAP(charId, amount = 1) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) return { success: false, error: 'Amount must be a positive integer.' };
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    if (char.ap_current < amount) return { success: false, error: `${char.char_name} only has ${char.ap_current} AP available.` };
    this.db.prepare('UPDATE characters SET ap_current = ap_current - ? WHERE id = ?').run(amount, charId);
    return { success: true, char: this.getCharacterById(charId) };
  }

  resetAP(charId) {
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    this.db.prepare('UPDATE characters SET ap_current = ap_max WHERE id = ?').run(charId);
    return { success: true, char: this.getCharacterById(charId) };
  }

  recordRoll(charId, stat, ability, diceResult, modifier, total) {
    const char = this.getCharacterById(charId);
    if (!char) return;
    const isCrit = diceResult === 20;
    const isFumble = diceResult === 1;
    this.db.prepare(`
      INSERT INTO roll_history (char_id, user_id, username, char_name, skill, ability, dice_result, modifier, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(charId, char.user_id, char.username, char.char_name, stat, ability, diceResult, modifier, total);
    this.db.prepare(`
      UPDATE characters SET total_rolls = total_rolls + 1, crits = crits + ?, fumbles = fumbles + ? WHERE id = ?
    `).run(isCrit ? 1 : 0, isFumble ? 1 : 0, charId);
  }

  getRollHistory(charId, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM roll_history WHERE char_id = ? ORDER BY rolled_at DESC LIMIT ?
    `).all(charId, limit);
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

module.exports = DB;
module.exports.calcTraits = calcTraits;
module.exports.SKILL_TREE = SKILL_TREE;
module.exports.ABILITIES = ABILITIES;
module.exports.ALL_SKILLS = ALL_SKILLS;
module.exports.DEFAULT_MAX_AP = DEFAULT_MAX_AP;
