/**
 * DiceEngine — handles all dice rolling for the Archive Dice system.
 *
 * Primary roll: d20 + skill modifier + parent ability modifier
 * Also retains free-form notation rolling for /roll raw.
 */

class DiceEngine {

  /**
   * Roll a skill check given the stat values from a character.
   * @param {string} skill     - e.g. 'athletics'
   * @param {number} skillMod  - the character's skill value
   * @param {string} ability   - e.g. 'physique'
   * @param {number} abilityMod - the character's ability value
   * @returns {{ diceResult, modifier, total, breakdown }}
   */
  rollSkill(skill, skillMod, ability, abilityMod) {
    const diceResult = Math.floor(Math.random() * 20) + 1;
    const modifier = skillMod + abilityMod;
    const total = diceResult + modifier;

    const modStr = modifier === 0 ? '' :
      modifier > 0 ? ` + ${modifier} (${this._cap(skill)} ${skillMod} + ${this._cap(ability)} ${abilityMod})` :
                     ` − ${Math.abs(modifier)} (${this._cap(skill)} ${skillMod} + ${this._cap(ability)} ${abilityMod})`;

    const breakdown = `[d20: **${diceResult}**]${modStr}`;

    return { diceResult, modifier, total, breakdown };
  }

  /**
   * Free-form dice roll (for /roll raw).
   * Supports: d20, 2d6, 4d8+3, 3d6-2, d100, 2d20kh1, 2d20kl1
   */
  roll(notation) {
    try {
      const parsed = this._parse(notation.trim().toLowerCase().replace('d%', 'd100'));
      if (!parsed) return { success: false, error: `Cannot parse "${notation}". Try something like 2d6+3 or d20.` };

      const rolls = [];
      for (let i = 0; i < parsed.count; i++) {
        rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
      }

      let kept = [...rolls];
      if (parsed.keepHighest !== null) {
        kept = [...rolls].sort((a, b) => b - a).slice(0, parsed.keepHighest);
      } else if (parsed.keepLowest !== null) {
        kept = [...rolls].sort((a, b) => a - b).slice(0, parsed.keepLowest);
      }

      const diceSum = kept.reduce((a, b) => a + b, 0);
      const total = Math.max(0, diceSum + parsed.modifier);
      const min = parsed.count + parsed.modifier;
      const max = parsed.count * parsed.sides + parsed.modifier;

      let breakdown;
      if (rolls.length === 1) {
        const m = parsed.modifier;
        breakdown = `[${rolls[0]}]${m !== 0 ? (m > 0 ? ` + ${m}` : ` - ${Math.abs(m)}`) : ''}`;
      } else {
        const m = parsed.modifier;
        breakdown = `[${rolls.join(', ')}]${m !== 0 ? (m > 0 ? ` + ${m}` : ` - ${Math.abs(m)}`) : ''}`;
      }

      return {
        success: true, total, rolls, kept, breakdown, min, max,
        modifier: parsed.modifier,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  validate(notation) {
    return this._parse(notation.trim().toLowerCase().replace('d%', 'd100')) ? { success: true } : { success: false };
  }

  _parse(notation) {
    const pattern = /^(\d+)?d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/;
    const m = notation.match(pattern);
    if (!m) return null;
    const count  = parseInt(m[1] || '1');
    const sides  = parseInt(m[2]);
    const keepType = m[3] || null;
    const keepNum  = m[4] ? parseInt(m[4]) : null;
    const modifier = m[5] ? parseInt(m[5]) : 0;
    if (count < 1 || count > 100) return null;
    if (sides < 2 || sides > 1000) return null;
    if (keepNum !== null && keepNum >= count) return null;
    return {
      count, sides, modifier,
      keepHighest: keepType === 'kh' ? keepNum : null,
      keepLowest:  keepType === 'kl' ? keepNum : null,
    };
  }

  _cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = DiceEngine;
