require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} = require('discord.js');

const Database = require('./database');
const DiceEngine = require('./diceEngine');
const {
  SKILL_TREE,
  ABILITIES,
  ALL_SKILLS,
  STARTING_ABILITY_LEVELUPS,
  STARTING_SKILL_LEVELUPS,
  CREATION_SKILL_CAP,
  LEVELUP_CAP,
  CONDITION_DEFINITIONS,
  INJURY_DEFINITIONS,
} = require('./database');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const db = new Database();
const dice = new DiceEngine();
const BOT_VERSION = '0.32.1';
const BOT_FOOTER = `Undead Archive Dice Bot, V${BOT_VERSION}`;

const ALL_SKILL_NAMES = ALL_SKILLS.map(s => s.skill);
const ALL_STAT_NAMES = [...ABILITIES, ...ALL_SKILL_NAMES];
const abilityChoices = ABILITIES.map(a => ({ name: capitalize(a), value: a }));
const skillChoices = ALL_SKILL_NAMES.map(s => ({ name: capitalize(s), value: s }));
const conditionChoices = Object.entries(CONDITION_DEFINITIONS).map(([value, def]) => ({ name: def.name, value }));
const injuryChoices = Object.entries(INJURY_DEFINITIONS).map(([value, def]) => ({ name: def.name, value }));
const rollModeChoices = [
  { name: 'Normal', value: 'normal' },
  { name: 'Advantage', value: 'adv' },
  { name: 'Disadvantage', value: 'dis' },
];

const commands = [
  new SlashCommandBuilder()
    .setName('character')
    .setDescription('Manage your characters')
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new character')
      .addStringOption(o => o.setName('name').setDescription('Your character name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all your characters'))
    .addSubcommand(s => s
      .setName('switch')
      .setDescription('Switch your active character')
      .addIntegerOption(o => o.setName('id').setDescription('Character ID from /character list').setRequired(true)))
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete one of your characters')
      .addIntegerOption(o => o.setName('id').setDescription('Character ID to delete').setRequired(true))),

  new SlashCommandBuilder()
    .setName('select')
    .setDescription('Select which of your characters is currently active')
    .addIntegerOption(o => o.setName('id').setDescription('Character ID from /character list').setRequired(true)),

  new SlashCommandBuilder()
    .setName('sheet')
    .setDescription('Show your currently selected character sheet'),

  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll d20 checks')
    .addSubcommand(s => s
      .setName('skill')
      .setDescription('Roll d20 + parent ability + skill')
      .addStringOption(o => o.setName('skill').setDescription('Skill to roll').setRequired(true).addChoices(...skillChoices))
      .addStringOption(o => o.setName('mode').setDescription('Normal, advantage, or disadvantage').setRequired(false).addChoices(...rollModeChoices))
      .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false)))
    .addSubcommand(s => s
      .setName('ability')
      .setDescription('Roll d20 + ability')
      .addStringOption(o => o.setName('ability').setDescription('Ability to roll').setRequired(true).addChoices(...abilityChoices))
      .addStringOption(o => o.setName('mode').setDescription('Normal, advantage, or disadvantage').setRequired(false).addChoices(...rollModeChoices))
      .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false))),

  new SlashCommandBuilder()
    .setName('rollraw')
    .setDescription('Roll free-form dice notation, for example 2d6+3 or d20')
    .addStringOption(o => o.setName('dice').setDescription('Dice notation').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false)),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your selected character last 10 rolls'),

  resourceCommand('ap', 'Adjust your selected character AP. Use a negative amount to spend AP.'),
  resourceCommand('hp', 'Adjust your selected character health. Use a negative amount to take damage.'),
  resourceCommand('movement', 'Adjust your selected character movement. Use a negative amount to spend movement.'),
  resourceCommand('stress', 'Adjust your selected character stress. Use a negative amount to lose stress.'),

  new SlashCommandBuilder()
    .setName('condition')
    .setDescription('Add, remove, or list conditions for your selected character')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a condition')
      .addStringOption(o => o.setName('name').setDescription('Condition name').setRequired(true).addChoices(...conditionChoices))
      .addIntegerOption(o => o.setName('time').setDescription('Rounds. Defaults to 1.').setMinValue(1).setMaxValue(99).setRequired(false)))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a condition')
      .addStringOption(o => o.setName('name').setDescription('Condition name').setRequired(true).addChoices(...conditionChoices)))
    .addSubcommand(s => s.setName('list').setDescription('List active conditions')),

  new SlashCommandBuilder()
    .setName('injury')
    .setDescription('Add, remove, or list injuries for your selected character')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add an injury')
      .addStringOption(o => o.setName('name').setDescription('Injury name').setRequired(true).addChoices(...injuryChoices)))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove an injury')
      .addStringOption(o => o.setName('name').setDescription('Injury name').setRequired(true).addChoices(...injuryChoices)))
    .addSubcommand(s => s.setName('list').setDescription('List active injuries')),

  new SlashCommandBuilder()
    .setName('end')
    .setDescription('End your turn: apply end-turn effects, reset AP/movement, tick manual conditions'),

  new SlashCommandBuilder()
    .setName('advance')
    .setDescription('Spend a pending level-up granted by an admin or character creation')
    .addSubcommand(s => s
      .setName('skill')
      .setDescription('Spend one pending skill level-up')
      .addStringOption(o => o.setName('skill').setDescription('Skill to increase').setRequired(true).addChoices(...skillChoices)))
    .addSubcommand(s => s
      .setName('ability')
      .setDescription('Spend one pending ability level-up')
      .addStringOption(o => o.setName('ability').setDescription('Ability to increase').setRequired(true).addChoices(...abilityChoices))),

  new SlashCommandBuilder()
    .setName('levelup')
    .setDescription('[ADMIN] Grant a pending skill or ability level-up')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The player').setRequired(true))
    .addIntegerOption(o => o.setName('character_id').setDescription('Character ID').setRequired(true))
    .addStringOption(o => o
      .setName('type')
      .setDescription('Type of level-up to grant')
      .setRequired(true)
      .addChoices({ name: 'Skill level-up', value: 'skill' }, { name: 'Ability level-up', value: 'ability' }))
    .addIntegerOption(o => o.setName('amount').setDescription('How many to grant').setMinValue(1).setMaxValue(99).setRequired(false)),

  new SlashCommandBuilder()
    .setName('setstat')
    .setDescription('[ADMIN] Set an ability or skill to a specific value')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The player').setRequired(true))
    .addIntegerOption(o => o.setName('character_id').setDescription('Character ID').setRequired(true))
    .addStringOption(o => o.setName('stat').setDescription('Ability or skill to set').setRequired(true).addChoices(...ALL_STAT_NAMES.map(s => ({ name: capitalize(s), value: s }))))
    .addIntegerOption(o => o.setName('value').setDescription('New value from 0 to 99').setMinValue(0).setMaxValue(99).setRequired(true)),
].map(c => c.toJSON());

function resourceCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addIntegerOption(o => o.setName('amount').setDescription('Positive restores, negative spends/reduces. Leave empty to check status.').setMinValue(-99).setMaxValue(99).setRequired(false));
}

function patchInteractionFooter(interaction) {
  if (interaction.__undeadFooterPatched) return;
  interaction.__undeadFooterPatched = true;

  if (typeof interaction.editReply === 'function') {
    const originalEditReply = interaction.editReply.bind(interaction);
    interaction.editReply = payload => originalEditReply(withBotFooter(payload));
  }

  if (typeof interaction.reply === 'function') {
    const originalReply = interaction.reply.bind(interaction);
    interaction.reply = payload => originalReply(withBotFooter(payload));
  }
}

function withBotFooter(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.ephemeral) payload.ephemeral = false;
  if (Array.isArray(payload.embeds)) {
    payload.embeds = payload.embeds.map(embed => {
      if (embed && typeof embed.setFooter === 'function') embed.setFooter({ text: BOT_FOOTER });
      return embed;
    });
  }
  return payload;
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  patchInteractionFooter(interaction);
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: false });

  try {
    if (interaction.commandName === 'character') return handleCharacter(interaction);
    if (interaction.commandName === 'select') return handleSelect(interaction);
    if (interaction.commandName === 'sheet') return handleSheet(interaction);
    if (interaction.commandName === 'roll') return handleRoll(interaction);
    if (interaction.commandName === 'rollraw') return handleRollRaw(interaction);
    if (interaction.commandName === 'history') return handleHistory(interaction);
    if (['ap', 'hp', 'movement', 'stress'].includes(interaction.commandName)) return handleResource(interaction, interaction.commandName);
    if (interaction.commandName === 'condition') return handleCondition(interaction);
    if (interaction.commandName === 'injury') return handleInjury(interaction);
    if (interaction.commandName === 'end') return handleEnd(interaction);
    if (interaction.commandName === 'advance') return handleAdvance(interaction);
    if (interaction.commandName === 'levelup') return handleLevelUp(interaction);
    if (interaction.commandName === 'setstat') return handleSetStat(interaction);
  } catch (err) {
    console.error(err);
    return interaction.editReply('Something went wrong while handling that command.');
  }
});

async function handleCharacter(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const name = interaction.options.getString('name').trim();
    if (!name || name.length > 50) return interaction.editReply('Character name must be 1 to 50 characters.');
    const wasFirstCharacter = db.listCharacters(interaction.user.id).length === 0;
    const id = db.createCharacter(interaction.user.id, interaction.user.username, name);
    return interaction.editReply(
      `Character **${name}** created and saved. ID: \`${id}\`. ` +
      (wasFirstCharacter ? 'This is your first character, so it has been automatically selected as active. ' : `Use \`/select id:${id}\` to make this your active character. `) +
      `New characters start with **${STARTING_ABILITY_LEVELUPS} ability level-ups** and **${STARTING_SKILL_LEVELUPS} skill level-ups**. ` +
      `Starting skill level-ups cannot raise a skill above **${CREATION_SKILL_CAP}**.`
    );
  }

  if (sub === 'list') {
    const chars = db.listCharacters(interaction.user.id);
    if (!chars.length) return interaction.editReply('You have no characters yet. Use `/character create` to make one.');
    const lines = chars.map(c => {
      const active = c.active ? 'Selected' : 'Not selected';
      const parts = [`${active} | **[${c.id}]** ${c.char_name}`, `AP ${fmt(c.traits.ap_current, c.traits.ap_max)}`, `HP ${fmt(c.traits.health_current, c.traits.health_max)}`];
      const pending = pendingLevelupsString(c);
      if (pending) parts.push(pending.replace(/\n/g, ' | '));
      return parts.join(' | ');
    }).join('\n');
    const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle(`${interaction.user.username}'s Characters`).setDescription(lines);
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'switch') {
    const id = interaction.options.getInteger('id');
    const ok = db.setActiveCharacter(interaction.user.id, id);
    if (!ok) return interaction.editReply(`No character with ID \`${id}\` found for you.`);
    const char = db.getCharacterById(id);
    return interaction.editReply(`Selected **${char.char_name}** as your active character.`);
  }

  if (sub === 'delete') {
    const id = interaction.options.getInteger('id');
    const char = db.getCharacterById(id, interaction.user.id);
    if (!char) return interaction.editReply(`No character with ID \`${id}\` found for you.`);
    db.deleteCharacter(interaction.user.id, id);
    return interaction.editReply(`Character **${char.char_name}** deleted.`);
  }
}

async function handleSelect(interaction) {
  const id = interaction.options.getInteger('id');
  const ok = db.setActiveCharacter(interaction.user.id, id);
  if (!ok) return interaction.editReply(`No character with ID \`${id}\` found for you. Use \`/character list\` to see your characters.`);
  const char = db.getCharacterById(id);
  return interaction.editReply(`Selected **${char.char_name}** as your active character. Use \`/sheet\` to view them.`);
}

async function handleSheet(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) {
    const chars = db.listCharacters(interaction.user.id);
    if (!chars.length) return interaction.editReply('You do not have any characters yet. Use `/character create` first.');
    return interaction.editReply('You do not have a selected character. Use `/select id:<character id>` first. You can find character IDs with `/character list`.');
  }
  return interaction.editReply({ embeds: [characterSheetEmbed(char, interaction.user.displayAvatarURL())] });
}

async function handleRoll(interaction) {
  const sub = interaction.options.getSubcommand();
  const label = interaction.options.getString('label');
  const requestedMode = interaction.options.getString('mode') || 'normal';
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first. If you do not have a character yet, use `/character create`.');

  if (sub === 'skill') {
    const skill = interaction.options.getString('skill');
    const ability = db.getParentAbility(skill);
    const modifiers = db.rollModifiers(char, 'skill', skill, ability, requestedMode);
    const rollData = dice.rollSkill(skill, char[skill], ability, char[ability], modifiers.mode, modifiers.flat, modifiers.notes);
    db.recordRoll(char.id, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);
    if (db.hasCondition(char, 'hidden') && ['melee', 'aiming'].includes(skill)) db.removeCondition(char.id, 'hidden');
    return interaction.editReply({ embeds: [skillRollEmbed(char, skill, ability, rollData, label)], components: [rerollSkillRow(char.id, skill, requestedMode)] });
  }

  if (sub === 'ability') {
    const ability = interaction.options.getString('ability');
    const modifiers = db.rollModifiers(char, 'ability', ability, null, requestedMode);
    const rollData = dice.rollAbility(ability, char[ability], modifiers.mode, modifiers.flat, modifiers.notes);
    db.recordRoll(char.id, null, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.editReply({ embeds: [abilityRollEmbed(char, ability, rollData, label)], components: [rerollAbilityRow(char.id, ability, requestedMode)] });
  }
}

async function handleRollRaw(interaction) {
  const notation = interaction.options.getString('dice');
  const label = interaction.options.getString('label');
  const result = dice.roll(notation);
  if (!result.success) return interaction.editReply(result.error);
  const embed = rawRollEmbed(interaction.user.username, notation, result, label || 'Free Roll');
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rerollraw_${notation}`).setLabel('Roll Again').setStyle(ButtonStyle.Secondary));
  return interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleHistory(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');
  const history = db.getRollHistory(char.id);
  if (!history.length) return interaction.editReply('No rolls yet for this character.');
  const lines = history.map((r, i) => {
    const label = r.skill ? `${capitalize(r.skill)} (${capitalize(r.ability)})` : `${capitalize(r.ability)} ability`;
    return `**${i + 1}.** ${label} -> **${r.total}**`;
  }).join('\n');
  const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle(`${char.char_name}'s Recent Rolls`).setDescription(lines);
  return interaction.editReply({ embeds: [embed] });
}

async function handleResource(interaction, commandName) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');

  const resource = commandName === 'hp' ? 'health' : commandName;
  const amount = interaction.options.getInteger('amount');
  if (amount === null) return interaction.editReply(`**${char.char_name}** has **${formatResource(char, resource)} ${resourceLabel(resource)}**.`);
  if (amount === 0) return interaction.editReply('Use a non-zero amount. Positive restores, negative spends or reduces.');

  const result = db.adjustResource(char.id, resource, amount);
  if (!result.success) return interaction.editReply(result.error);

  const verb = amount < 0 ? 'loses/spends' : 'recovers';
  let message = `**${result.char.char_name}** ${verb} **${Math.abs(amount)} ${resourceLabel(resource)}** and now has **${formatResource(result.char, resource)} ${resourceLabel(resource)}**.`;
  if (result.removedHidden) message += '\nHidden was removed because they used Movement.';

  if (resource === 'stress' && result.hitZero) {
    const moraleRoll = dice.rollSkill('morale', result.char.morale, 'presence', result.char.presence);
    db.recordRoll(result.char.id, 'morale', 'presence', moraleRoll.diceResult, moraleRoll.modifier, moraleRoll.total);
    if (moraleOutcome(moraleRoll.total) === 'Freeze') db.setTurnResourcesToZero(result.char.id);
    const moraleChar = db.getCharacterById(result.char.id);
    message += `\n\n${moraleMessage(moraleChar, moraleRoll)}`;
  }

  return interaction.editReply(message);
}

async function handleCondition(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return interaction.editReply({ embeds: [conditionsEmbed(char)] });
  const name = interaction.options.getString('name');
  if (sub === 'add') {
    const time = interaction.options.getInteger('time') || 1;
    const result = db.addCondition(char.id, name, time);
    if (!result.success) return interaction.editReply(result.error);
    let msg = `**${result.char.char_name}** gains **${result.condition.name}** for **${time} round${time === 1 ? '' : 's'}**.`;
    if (result.grants.length) msg += `\nAlso gained: ${result.grants.map(x => `**${x}**`).join(', ')}.`;
    msg += `\n${result.condition.description}`;
    return interaction.editReply(msg);
  }
  if (sub === 'remove') {
    const result = db.removeCondition(char.id, name);
    if (!result.success) return interaction.editReply(result.error);
    return interaction.editReply(`**${result.char.char_name}** no longer has **${result.condition.name}**.`);
  }
}

async function handleInjury(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') return interaction.editReply({ embeds: [injuriesEmbed(char)] });
  const name = interaction.options.getString('name');
  if (sub === 'add') {
    const result = db.addInjury(char.id, name);
    if (!result.success) return interaction.editReply(result.error);
    let msg = `**${result.char.char_name}** gains injury: **${result.injury.name}**.\nTreatment: ${result.injury.treatment}\n${result.injury.description}`;
    if (result.injury.grants?.length) msg += `\nGranted conditions are persistent and do not tick down with \`/end\`.`;
    return interaction.editReply(msg);
  }
  if (sub === 'remove') {
    const result = db.removeInjury(char.id, name);
    if (!result.success) return interaction.editReply(result.error);
    return interaction.editReply(`**${result.char.char_name}** removed injury: **${result.injury.name}**. Any conditions granted by that injury were removed.`);
  }
}

async function handleEnd(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');
  const result = db.resetTurnResources(char.id);
  if (!result.success) return interaction.editReply(result.error);
  const lines = [`**${result.char.char_name}** ends their turn.`];
  if (result.endEffects.lines.length) lines.push('', '**End-turn effects**', ...result.endEffects.lines);
  lines.push('', `AP reset to **${fmt(result.char.traits.ap_current, result.char.traits.ap_max)}**.`);
  lines.push(`Movement reset to **${fmt(result.char.traits.movement_current, result.char.traits.movement_max)}**.`);
  if (result.conditionTick.reduced.length) lines.push('', `Manual conditions reduced by 1 round: ${result.conditionTick.reduced.map(c => CONDITION_DEFINITIONS[c.name]?.name || c.name).join(', ')}.`);
  if (result.conditionTick.expired.length) lines.push(`Expired manual conditions: ${result.conditionTick.expired.map(c => CONDITION_DEFINITIONS[c.name]?.name || c.name).join(', ')}.`);
  return interaction.editReply(lines.join('\n'));
}

async function handleAdvance(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no selected character. Use `/select id:<character id>` first.');
  const sub = interaction.options.getSubcommand();
  const stat = sub === 'skill' ? interaction.options.getString('skill') : interaction.options.getString('ability');
  const result = db.spendLevelUp(char.id, sub, stat);
  if (!result.success) return interaction.editReply(result.error);
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('Level Up Chosen')
    .setDescription(`**${result.charName}** increased **${capitalize(result.stat)}**.`)
    .addFields(
      { name: 'Old Value', value: `${result.old}`, inline: true },
      { name: 'New Value', value: `${result.new}`, inline: true },
      { name: 'Updated Traits', value: traitsString(result.traits), inline: false },
    );
  const pending = pendingLevelupsString(result);
  if (pending) embed.addFields({ name: 'Pending Level-Ups', value: pending, inline: false });
  return interaction.editReply({ embeds: [embed] });
}

async function handleLevelUp(interaction) {
  if (!isModerator(interaction.member)) return interaction.editReply('Only admins or moderators can grant level-ups.');
  const targetUser = interaction.options.getUser('user');
  const charId = interaction.options.getInteger('character_id');
  const type = interaction.options.getString('type');
  const amount = interaction.options.getInteger('amount') || 1;
  const char = db.getCharacterById(charId);
  if (!char || char.user_id !== targetUser.id) return interaction.editReply(`Character ID \`${charId}\` does not belong to ${targetUser.username}.`);
  const result = db.grantLevelUp(charId, type, amount);
  if (!result.success) return interaction.editReply(result.error);
  return interaction.editReply(`<@${targetUser.id}> received **${amount} ${type} level-up${amount === 1 ? '' : 's'}** for **${result.charName}**. They can spend it with \`/advance ${type}\`. Level-ups can raise stats up to **${LEVELUP_CAP}**.`);
}

async function handleSetStat(interaction) {
  if (!isModerator(interaction.member)) return interaction.editReply('Only admins or moderators can set stats.');
  const targetUser = interaction.options.getUser('user');
  const charId = interaction.options.getInteger('character_id');
  const stat = interaction.options.getString('stat');
  const value = interaction.options.getInteger('value');
  const char = db.getCharacterById(charId);
  if (!char || char.user_id !== targetUser.id) return interaction.editReply(`Character ID \`${charId}\` does not belong to ${targetUser.username}.`);
  const result = db.setStat(charId, stat, value);
  if (!result.success) return interaction.editReply(result.error);
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('Stat Updated')
    .setDescription(`<@${targetUser.id}>'s character **${result.charName}**`)
    .addFields(
      { name: 'Stat', value: capitalize(stat), inline: true },
      { name: 'Old', value: `${result.old}`, inline: true },
      { name: 'New', value: `${result.new}`, inline: true },
      { name: 'Updated Traits', value: traitsString(result.traits), inline: false },
    );
  return interaction.editReply({ embeds: [embed] });
}

async function handleButton(interaction) {
  if (interaction.customId.startsWith('reroll_skill_')) {
    const [charIdRaw, skill, requestedModeRaw] = interaction.customId.replace('reroll_skill_', '').split('|');
    const requestedMode = requestedModeRaw || 'normal';
    const char = db.getCharacterById(parseInt(charIdRaw, 10), interaction.user.id);
    if (!char) return interaction.reply({ content: 'Character not found or not yours.', ephemeral: false });
    const ability = db.getParentAbility(skill);
    const modifiers = db.rollModifiers(char, 'skill', skill, ability, requestedMode);
    const rollData = dice.rollSkill(skill, char[skill], ability, char[ability], modifiers.mode, modifiers.flat, modifiers.notes);
    db.recordRoll(char.id, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);
    if (db.hasCondition(char, 'hidden') && ['melee', 'aiming'].includes(skill)) db.removeCondition(char.id, 'hidden');
    return interaction.reply({ embeds: [skillRollEmbed(char, skill, ability, rollData)], components: [rerollSkillRow(char.id, skill, requestedMode)] });
  }

  if (interaction.customId.startsWith('reroll_ability_')) {
    const [charIdRaw, ability, requestedModeRaw] = interaction.customId.replace('reroll_ability_', '').split('|');
    const requestedMode = requestedModeRaw || 'normal';
    const char = db.getCharacterById(parseInt(charIdRaw, 10), interaction.user.id);
    if (!char) return interaction.reply({ content: 'Character not found or not yours.', ephemeral: false });
    const modifiers = db.rollModifiers(char, 'ability', ability, null, requestedMode);
    const rollData = dice.rollAbility(ability, char[ability], modifiers.mode, modifiers.flat, modifiers.notes);
    db.recordRoll(char.id, null, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.reply({ embeds: [abilityRollEmbed(char, ability, rollData)], components: [rerollAbilityRow(char.id, ability, requestedMode)] });
  }

  if (interaction.customId.startsWith('rerollraw_')) {
    const notation = interaction.customId.replace('rerollraw_', '');
    const result = dice.roll(notation);
    if (!result.success) return interaction.reply({ content: result.error, ephemeral: false });
    const embed = rawRollEmbed(interaction.user.username, notation, result, 'Re-Roll');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rerollraw_${notation}`).setLabel('Roll Again').setStyle(ButtonStyle.Secondary));
    return interaction.reply({ embeds: [embed], components: [row] });
  }
}

function characterSheetEmbed(char, avatarUrl = null) {
  const abilityLines = ABILITIES.map(ability => {
    const skills = SKILL_TREE[ability].map(sk => `  ${capitalize(sk)}: **${char[sk]}**`).join('\n');
    return `**${capitalize(ability)}: ${char[ability]}**\n${skills}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xE3311D)
    .setTitle(char.char_name)
    .setDescription(`Character of <@${char.user_id}> | ID: \`${char.id}\``)
    .addFields(
      { name: 'Resources', value: resourcesString(char), inline: true },
      { name: 'Derived Traits', value: traitsString(char.traits), inline: false },
      { name: 'Conditions', value: conditionsString(char), inline: false },
      { name: 'Injuries', value: injuriesString(char), inline: false },
      { name: 'Abilities and Skill Levels', value: abilityLines, inline: false },
    );
  const pending = pendingLevelupsString(char);
  if (pending) embed.addFields({ name: 'Pending Level-Ups', value: pending, inline: false });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function skillRollEmbed(char, skill, ability, rollData, label = null) {
  const embed = baseRollEmbed(rollData)
    .setTitle(label || `${capitalize(skill)} Check${modeSuffix(rollData.mode)}`)
    .setDescription(`**${char.char_name}** rolls **d20 + ${capitalize(ability)} + ${capitalize(skill)}**`)
    .addFields(
      { name: 'Total', value: `# ${rollData.total}`, inline: true },
      { name: 'Breakdown', value: rollData.breakdown, inline: false },
    );
  if (rollData.notes?.length) embed.addFields({ name: 'Condition Effects', value: rollData.notes.join('\n'), inline: false });
  addCritText(embed, rollData);
  return embed;
}

function abilityRollEmbed(char, ability, rollData, label = null) {
  const embed = baseRollEmbed(rollData)
    .setTitle(label || `${capitalize(ability)} Check${modeSuffix(rollData.mode)}`)
    .setDescription(`**${char.char_name}** rolls **d20 + ${capitalize(ability)}**`)
    .addFields(
      { name: 'Total', value: `# ${rollData.total}`, inline: true },
      { name: 'Breakdown', value: rollData.breakdown, inline: false },
    );
  if (rollData.notes?.length) embed.addFields({ name: 'Condition Effects', value: rollData.notes.join('\n'), inline: false });
  addCritText(embed, rollData);
  return embed;
}

function rawRollEmbed(username, notation, result, title) {
  const embed = baseRollEmbed(result)
    .setTitle(title)
    .setDescription(`**${username}** rolled \`${notation}\``)
    .addFields(
      { name: 'Result', value: `# ${result.total}`, inline: true },
      { name: 'Breakdown', value: result.breakdown, inline: false },
      { name: 'Range', value: `${result.min} to ${result.max}`, inline: true },
    );
  addCritText(embed, result);
  return embed;
}

function conditionsEmbed(char) {
  return new EmbedBuilder()
    .setColor(0xE3311D)
    .setTitle(`${char.char_name}'s Conditions`)
    .setDescription(conditionsString(char, true));
}

function injuriesEmbed(char) {
  return new EmbedBuilder()
    .setColor(0xE3311D)
    .setTitle(`${char.char_name}'s Injuries`)
    .setDescription(injuriesString(char, true));
}

function baseRollEmbed(result) {
  return new EmbedBuilder()
    .setColor(result.isCrit ? 0x22c55e : result.isFumble ? 0xef4444 : 0x7c3aed)
    .setTimestamp();
}

function addCritText(embed, result) {
  if (result.isCrit) embed.addFields({ name: 'Critical', value: 'Natural 20.' });
  if (result.isFumble) embed.addFields({ name: 'Fumble', value: 'Natural 1.' });
}

function rerollSkillRow(charId, skill, mode = 'normal') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_skill_${charId}|${skill}|${mode}`).setLabel(`Roll ${capitalize(skill)} Again`).setStyle(ButtonStyle.Secondary)
  );
}

function rerollAbilityRow(charId, ability, mode = 'normal') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_ability_${charId}|${ability}|${mode}`).setLabel(`Roll ${capitalize(ability)} Again`).setStyle(ButtonStyle.Secondary)
  );
}

function resourcesString(char) {
  return [
    `AP: **${fmt(char.traits.ap_current, char.traits.ap_max)}**`,
    `HP: **${fmt(char.traits.health_current, char.traits.health_max)}**`,
    `Movement: **${fmt(char.traits.movement_current, char.traits.movement_max)}**`,
    `Stress: **${fmt(char.traits.stress_current, char.traits.stress_max)}**`,
  ].join('\n');
}

function traitsString(t) {
  return [
    `Health: **${fmt(t.health_current, t.health_max)}**`,
    `Movement: **${fmt(t.movement_current, t.movement_max)}**`,
    `Stress: **${fmt(t.stress_current, t.stress_max)}**`,
    `AP: **${fmt(t.ap_current, t.ap_max)}**`,
    `Base Defense: **${t.base_defense}**`,
    `Dodge Defense: **${t.dodge_defense}**`,
    `Parry Defense: **${t.parry_defense}**`,
    `Detection: **${t.detection}**`,
  ].join('\n');
}

function conditionsString(char, full = false) {
  if (!char.conditions.length) return 'None';
  return char.conditions.map(c => {
    const duration = c.persistent ? 'persistent' : `${c.rounds} round${c.rounds === 1 ? '' : 's'}`;
    const source = c.source?.startsWith('injury:') ? ' from injury' : '';
    const base = `**${c.displayName}** (${duration}${source})`;
    return full && c.definition ? `${base}\n${c.definition.description}` : base;
  }).join('\n');
}

function injuriesString(char, full = false) {
  if (!char.injuries.length) return 'None';
  return char.injuries.map(i => {
    const base = `**${i.displayName}**`;
    if (!full || !i.definition) return base;
    return `${base}\nTreatment: ${i.definition.treatment}\n${i.definition.description}`;
  }).join('\n');
}

function pendingLevelupsString(x) {
  const skill = x.pendingSkill ?? x.pending_skill_levelups ?? 0;
  const ability = x.pendingAbility ?? x.pending_ability_levelups ?? 0;
  const creation = x.creationSkillRemaining ?? x.creation_skill_levelups_remaining ?? 0;
  const lines = [];
  if (skill > 0) lines.push(`Skill: **${skill}**`);
  if (ability > 0) lines.push(`Ability: **${ability}**`);
  if (creation > 0) lines.push(`Starting skill cap left: **${creation}**`);
  return lines.join('\n');
}

function moraleMessage(char, rollData) {
  const outcome = moraleOutcome(rollData.total);
  return [
    `**${char.char_name}'s Stress hit 0. They make a Morale roll.**`,
    `Total: **${rollData.total}**`,
    `Breakdown: ${rollData.breakdown}`,
    '',
    '**Morale Results**',
    '1-5 Surrender: You surrender to your opponents.',
    '6-10 Freeze: Your movement and AP reduced to 0 until the end of your next turn.',
    '11-15 Flee: On your next turn you must get as far away as you can.',
    '16+ Dazed: You are stunned until the end of your next round.',
    '',
    `Outcome: **${outcome}**`,
  ].join('\n');
}

function moraleOutcome(total) {
  if (total <= 5) return 'Surrender';
  if (total <= 10) return 'Freeze';
  if (total <= 15) return 'Flee';
  return 'Dazed';
}

function formatResource(char, resource) {
  const key = resource === 'hp' ? 'health' : resource;
  return fmt(char.traits[`${key}_current`], char.traits[`${key}_max`]);
}

function resourceLabel(resource) {
  if (resource === 'health') return 'HP';
  if (resource === 'ap') return 'AP';
  return capitalize(resource);
}

function fmt(current, max) {
  return `${current}/${max}`;
}

function modeSuffix(mode) {
  if (mode === 'adv') return ' with Advantage';
  if (mode === 'dis') return ' with Disadvantage';
  return '';
}

function isModerator(member) {
  return Boolean(member && member.permissions.has(PermissionFlagsBits.ManageRoles));
}

function capitalize(s) {
  return String(s).split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

client.login(process.env.DISCORD_TOKEN);
