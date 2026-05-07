const BetterSqlite = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── Schema constants ─────────────────────────────────────────────────────────

const ABILITIES = ['physique', 'agility', 'reason', 'presence'];

const SKILL_TREE = {
  physique: ['athletics', 'melee', 'resilience'],
  agility:  ['aiming', 'stealth', 'reflex', 'finesse'],
  reason:   ['awareness', 'medicine', 'technology', 'academia'],
  presence: ['morale', 'intimidation', 'persuasion', 'deception'],
};

const ALL_SKILLS = Object.entries(SKILL_TREE).flatMap(([ability, skills]) =>
  skills.map(skill => ({ skill, ability }))
);

// ─── Trait calculations ───────────────────────────────────────────────────────

function calcTraits(s) {
  return {
    health:        5 + s.physique + Math.floor(s.resilience / 2),
    movement:      3 + Math.floor((s.athletics + s.reflex) / 2),
    stress:        3 + s.presence,
    dodge_defense: 10 + s.agility + s.reflex,
    parry_defense: 10 + s.physique + s.melee,
  };
}

// ─── Database class ───────────────────────────────────────────────────────────

class DB {
  constructor(filePath = './data/dice.db') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new BetterSqlite(filePath);
    this.db.pragma('journal_mode = WAL');
    this.SKILL_TREE = SKILL_TREE;
    this.ABILITIES = ABILITIES;
    this.ALL_SKILLS = ALL_SKILLS;
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT    NOT NULL,
        username      TEXT    NOT NULL,
        char_name     TEXT    NOT NULL,
        active        INTEGER DEFAULT 0,

        physique      INTEGER DEFAULT 0,
        agility       INTEGER DEFAULT 0,
        reason        INTEGER DEFAULT 0,
        presence      INTEGER DEFAULT 0,

        athletics     INTEGER DEFAULT 0,
        melee         INTEGER DEFAULT 0,
        resilience    INTEGER DEFAULT 0,

        aiming        INTEGER DEFAULT 0,
        stealth       INTEGER DEFAULT 0,
        reflex        INTEGER DEFAULT 0,
        finesse       INTEGER DEFAULT 0,

        awareness     INTEGER DEFAULT 0,
        medicine      INTEGER DEFAULT 0,
        technology    INTEGER DEFAULT 0,
        academia      INTEGER DEFAULT 0,

        morale        INTEGER DEFAULT 0,
        intimidation  INTEGER DEFAULT 0,
        persuasion    INTEGER DEFAULT 0,
        deception     INTEGER DEFAULT 0,

        total_rolls   INTEGER DEFAULT 0,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS roll_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id      INTEGER NOT NULL,
        user_id      TEXT    NOT NULL,
        username     TEXT    NOT NULL,
        char_name    TEXT    NOT NULL,
        skill        TEXT,
        ability      TEXT,
        dice_result  INTEGER NOT NULL,
        modifier     INTEGER NOT NULL DEFAULT 0,
        total        INTEGER NOT NULL,
        rolled_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (char_id) REFERENCES characters(id)
      );
    `);
  }

  // ─── Character CRUD ──────────────────────────────────────────────────────────

  createCharacter(userId, username, charName) {
    const existing = this.listCharacters(userId);
    const isFirst = existing.length === 0;
    const result = this.db.prepare(`
      INSERT INTO characters (user_id, username, char_name, active)
      VALUES (?, ?, ?, ?)
    `).run(userId, username, charName, isFirst ? 1 : 0);
    return result.lastInsertRowid;
  }

  getCharacterById(charId, userId = null) {
    const row = this.db.prepare(`SELECT * FROM characters WHERE id = ?`).get(charId);
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
    this.db.prepare(`UPDATE characters SET active = 0 WHERE user_id = ?`).run(userId);
    this.db.prepare(`UPDATE characters SET active = 1 WHERE id = ?`).run(charId);
    return true;
  }

  deleteCharacter(userId, charId) {
    const char = this.getCharacterById(charId, userId);
    if (!char) return false;
    this.db.prepare(`DELETE FROM characters WHERE id = ?`).run(charId);
    if (char.active) {
      const next = this.db.prepare(`
        SELECT id FROM characters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(userId);
      if (next) this.db.prepare(`UPDATE characters SET active = 1 WHERE id = ?`).run(next.id);
    }
    return true;
  }

  // ─── Mod-only stat editing ───────────────────────────────────────────────────

  levelUp(charId, statName) {
    const stat = statName.toLowerCase();
    if (!this.isAbility(stat) && !this.isSkill(stat)) {
      return { success: false, error: `Unknown stat \`${stat}\`. Use an ability or skill name.` };
    }
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const oldVal = char[stat];
    this.db.prepare(`UPDATE characters SET "${stat}" = "${stat}" + 1 WHERE id = ?`).run(charId);
    const updated = this.getCharacterById(charId);
    return { success: true, stat, old: oldVal, new: updated[stat], charName: char.char_name, traits: updated.traits };
  }

  setStat(charId, statName, value) {
    const stat = statName.toLowerCase();
    if (!this.isAbility(stat) && !this.isSkill(stat)) {
      return { success: false, error: `Unknown stat \`${stat}\`.` };
    }
    if (!Number.isInteger(value) || value < 0 || value > 99) {
      return { success: false, error: 'Value must be an integer between 0 and 99.' };
    }
    const char = this.getCharacterById(charId);
    if (!char) return { success: false, error: `No character with ID ${charId}.` };
    const oldVal = char[stat];
    this.db.prepare(`UPDATE characters SET "${stat}" = ? WHERE id = ?`).run(value, charId);
    const updated = this.getCharacterById(charId);
    return { success: true, stat, old: oldVal, new: updated[stat], charName: char.char_name, traits: updated.traits };
  }

  // ─── Roll recording ──────────────────────────────────────────────────────────

  recordSkillRoll(charId, skill, ability, diceResult, modifier, total) {
    const char = this.getCharacterById(charId);
    if (!char) return;
    this.db.prepare(`
      INSERT INTO roll_history (char_id, user_id, username, char_name, skill, ability, dice_result, modifier, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(charId, char.user_id, char.username, char.char_name, skill, ability, diceResult, modifier, total);
    this.db.prepare(`
      UPDATE characters SET
        total_rolls = total_rolls + 1,
      WHERE id = ?
    `).run(charId);
  }

  getRollHistory(charId, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM roll_history WHERE char_id = ? ORDER BY rolled_at DESC LIMIT ?
    `).all(charId, limit);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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