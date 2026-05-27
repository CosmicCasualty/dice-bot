class DiceEngine {
  rollSkill(skill, skillMod, ability, abilityMod) {
    const diceResult = this._d20();
    const modifier = skillMod + abilityMod;
    const total = diceResult + modifier;
    const breakdown = `[d20: **${diceResult}**] + ${this._cap(ability)} ${abilityMod} + ${this._cap(skill)} ${skillMod}`;
    return { diceResult, modifier, total, isCrit: diceResult === 20, isFumble: diceResult === 1, breakdown };
  }

  rollAbility(ability, abilityMod) {
    const diceResult = this._d20();
    const modifier = abilityMod;
    const total = diceResult + modifier;
    const breakdown = `[d20: **${diceResult}**] + ${this._cap(ability)} ${abilityMod}`;
    return { diceResult, modifier, total, isCrit: diceResult === 20, isFumble: diceResult === 1, breakdown };
  }

  roll(notation) {
    try {
      const parsed = this._parse(notation.trim().toLowerCase().replace('d%', 'd100'));
      if (!parsed) return { success: false, error: `Cannot parse "${notation}". Try something like 2d6+3 or d20.` };

      const rolls = [];
      for (let i = 0; i < parsed.count; i++) rolls.push(Math.floor(Math.random() * parsed.sides) + 1);

      let kept = [...rolls];
      if (parsed.keepHighest !== null) kept = [...rolls].sort((a, b) => b - a).slice(0, parsed.keepHighest);
      if (parsed.keepLowest !== null) kept = [...rolls].sort((a, b) => a - b).slice(0, parsed.keepLowest);

      const diceSum = kept.reduce((a, b) => a + b, 0);
      const total = diceSum + parsed.modifier;
      const min = parsed.count + parsed.modifier;
      const max = parsed.count * parsed.sides + parsed.modifier;
      const modText = parsed.modifier === 0 ? '' : parsed.modifier > 0 ? ` + ${parsed.modifier}` : ` - ${Math.abs(parsed.modifier)}`;
      const breakdown = `[${rolls.join(', ')}]${modText}`;

      return {
        success: true,
        total,
        rolls,
        kept,
        breakdown,
        min,
        max,
        modifier: parsed.modifier,
        isCrit: diceSum === parsed.count * parsed.sides,
        isFumble: diceSum === parsed.count,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  validate(notation) {
    return this._parse(notation.trim().toLowerCase().replace('d%', 'd100')) ? { success: true } : { success: false };
  }

  _d20() {
    return Math.floor(Math.random() * 20) + 1;
  }

  _parse(notation) {
    const pattern = /^(\d+)?d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/;
    const m = notation.match(pattern);
    if (!m) return null;
    const count = parseInt(m[1] || '1', 10);
    const sides = parseInt(m[2], 10);
    const keepType = m[3] || null;
    const keepNum = m[4] ? parseInt(m[4], 10) : null;
    const modifier = m[5] ? parseInt(m[5], 10) : 0;
    if (count < 1 || count > 100) return null;
    if (sides < 2 || sides > 1000) return null;
    if (keepNum !== null && keepNum >= count) return null;
    return { count, sides, modifier, keepHighest: keepType === 'kh' ? keepNum : null, keepLowest: keepType === 'kl' ? keepNum : null };
  }

  _cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = DiceEngine;
