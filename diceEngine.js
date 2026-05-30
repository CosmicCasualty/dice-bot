class DiceEngine {
  rollSkill(skill, skillMod, ability, abilityMod, mode = 'normal', flatModifier = 0, notes = []) {
    const d20 = this._rollD20(mode);
    const modifier = skillMod + abilityMod + flatModifier;
    const total = d20.result + modifier;
    const extra = flatModifier === 0 ? '' : ` + Conditions ${this._signed(flatModifier)}`;
    const breakdown = `${this._d20Text(d20)} + ${this._cap(ability)} ${this._signed(abilityMod)} + ${this._cap(skill)} ${this._signed(skillMod)}${extra} = ${total}`;
    return { diceResult: d20.result, modifier, total, breakdown, mode, notes };
  }

  rollAbility(ability, abilityMod, mode = 'normal', flatModifier = 0, notes = []) {
    const d20 = this._rollD20(mode);
    const modifier = abilityMod + flatModifier;
    const total = d20.result + modifier;
    const extra = flatModifier === 0 ? '' : ` + Conditions ${this._signed(flatModifier)}`;
    const breakdown = `${this._d20Text(d20)} + ${this._cap(ability)} ${this._signed(abilityMod)}${extra} = ${total}`;
    return { diceResult: d20.result, modifier, total, breakdown, mode, notes };
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
      const breakdown = `[${rolls.join(', ')}]${modText} = ${total}`;

      return { success: true, total, rolls, kept, breakdown, min, max, modifier: parsed.modifier};
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  validate(notation) {
    return this._parse(notation.trim().toLowerCase().replace('d%', 'd100')) ? { success: true } : { success: false };
  }

  _rollD20(mode) {
    if (mode === 'adv' || mode === 'dis') {
      const rolls = [this._d20(), this._d20()];
      const result = mode === 'adv' ? Math.max(...rolls) : Math.min(...rolls);
      return { mode, rolls, result };
    }
    const roll = this._d20();
    return { mode: 'normal', rolls: [roll], result: roll };
  }

  _d20Text(d20) {
    if (d20.result === null) d20.result = d20.rolls[0];
    if (d20.mode === 'adv') return `d20 adv [${d20.rolls.join(', ')}] -> ${d20.result}`;
    if (d20.mode === 'dis') return `d20 dis [${d20.rolls.join(', ')}] -> ${d20.result}`;
    return `d20 ${d20.result}`;
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

  _signed(n) {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  _cap(str) {
    return String(str).split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }
}

module.exports = DiceEngine;
