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
const { SKILL_TREE, ABILITIES, ALL_SKILLS } = require('./database');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const db = new Database();
const dice = new DiceEngine();

const ALL_SKILL_NAMES = ALL_SKILLS.map(s => s.skill);
const ALL_STAT_NAMES = [...ABILITIES, ...ALL_SKILL_NAMES];
const abilityChoices = ABILITIES.map(a => ({ name: capitalize(a), value: a }));
const skillChoices = ALL_SKILL_NAMES.map(s => ({ name: capitalize(s), value: s }));

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
    .setName('profile')
    .setDescription('View an active character sheet')
    .addUserOption(o => o.setName('user').setDescription('View another user active character').setRequired(false)),

  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll d20 checks')
    .addSubcommand(s => s
      .setName('skill')
      .setDescription('Roll d20 + parent ability + skill')
      .addStringOption(o => o.setName('skill').setDescription('Skill to roll').setRequired(true).addChoices(...skillChoices))
      .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false)))
    .addSubcommand(s => s
      .setName('ability')
      .setDescription('Roll d20 + ability')
      .addStringOption(o => o.setName('ability').setDescription('Ability to roll').setRequired(true).addChoices(...abilityChoices))
      .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false))),

  new SlashCommandBuilder()
    .setName('rollraw')
    .setDescription('Roll free-form dice notation, for example 2d6+3 or d20')
    .addStringOption(o => o.setName('dice').setDescription('Dice notation').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false)),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your active character last 10 rolls'),

  new SlashCommandBuilder()
    .setName('ap')
    .setDescription('Manage your active character AP')
    .addSubcommand(s => s
      .setName('spend')
      .setDescription('Retract current AP from your active character')
      .addIntegerOption(o => o.setName('amount').setDescription('AP to spend').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('Show your current AP')),

  new SlashCommandBuilder()
    .setName('end')
    .setDescription('End your turn or scene and reset your active character AP to full'),

  new SlashCommandBuilder()
    .setName('advance')
    .setDescription('Spend a pending level-up granted by an admin')
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
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: shouldBeEphemeral(interaction.commandName) });

  try {
    if (interaction.commandName === 'character') return handleCharacter(interaction);
    if (interaction.commandName === 'profile') return handleProfile(interaction);
    if (interaction.commandName === 'roll') return handleRoll(interaction);
    if (interaction.commandName === 'rollraw') return handleRollRaw(interaction);
    if (interaction.commandName === 'history') return handleHistory(interaction);
    if (interaction.commandName === 'ap') return handleAP(interaction);
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
    const id = db.createCharacter(interaction.user.id, interaction.user.username, name);
    return interaction.editReply(`Character **${name}** created and saved. ID: \`${id}\`. New characters start with **4/4 AP**.`);
  }

  if (sub === 'list') {
    const chars = db.listCharacters(interaction.user.id);
    if (!chars.length) return interaction.editReply('You have no characters yet. Use `/character create` to make one.');
    const lines = chars.map(c => `${c.active ? 'Active' : 'Inactive'} | **[${c.id}]** ${c.char_name} | AP ${c.ap_current}/${c.ap_max} | HP ${c.traits.health} | Rolls ${c.total_rolls}`).join('\n');
    const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle(`${interaction.user.username}'s Characters`).setDescription(lines);
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'switch') {
    const id = interaction.options.getInteger('id');
    const ok = db.setActiveCharacter(interaction.user.id, id);
    if (!ok) return interaction.editReply(`No character with ID \`${id}\` found for you.`);
    const char = db.getCharacterById(id);
    return interaction.editReply(`Switched active character to **${char.char_name}**.`);
  }

  if (sub === 'delete') {
    const id = interaction.options.getInteger('id');
    const char = db.getCharacterById(id, interaction.user.id);
    if (!char) return interaction.editReply(`No character with ID \`${id}\` found for you.`);
    db.deleteCharacter(interaction.user.id, id);
    return interaction.editReply(`Character **${char.char_name}** deleted.`);
  }
}

async function handleProfile(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const char = db.getActiveCharacter(targetUser.id);
  if (!char) {
    return interaction.editReply(targetUser.id === interaction.user.id ? 'You have no active character. Use `/character create` first.' : `${targetUser.username} has no active character.`);
  }
  return interaction.editReply({ embeds: [characterSheetEmbed(char, targetUser.displayAvatarURL())] });
}

async function handleRoll(interaction) {
  const sub = interaction.options.getSubcommand();
  const label = interaction.options.getString('label');
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no active character. Use `/character create` first.');

  if (sub === 'skill') {
    const skill = interaction.options.getString('skill');
    const ability = db.getParentAbility(skill);
    const rollData = dice.rollSkill(skill, char[skill], ability, char[ability]);
    db.recordRoll(char.id, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.editReply({ embeds: [skillRollEmbed(char, skill, ability, rollData, label)], components: [rerollSkillRow(char.id, skill)] });
  }

  if (sub === 'ability') {
    const ability = interaction.options.getString('ability');
    const rollData = dice.rollAbility(ability, char[ability]);
    db.recordRoll(char.id, null, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.editReply({ embeds: [abilityRollEmbed(char, ability, rollData, label)], components: [rerollAbilityRow(char.id, ability)] });
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
  if (!char) return interaction.editReply('You have no active character.');
  const history = db.getRollHistory(char.id);
  if (!history.length) return interaction.editReply('No rolls yet for this character.');
  const lines = history.map((r, i) => {
    const label = r.skill ? `${capitalize(r.skill)} (${capitalize(r.ability)})` : `${capitalize(r.ability)} ability`;
    return `**${i + 1}.** ${label} -> **${r.total}** (d20: ${r.dice_result}, mod: ${r.modifier})`;
  }).join('\n');
  const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle(`${char.char_name}'s Recent Rolls`).setDescription(lines).setFooter({ text: 'Last 10 rolls' });
  return interaction.editReply({ embeds: [embed] });
}

async function handleAP(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no active character.');
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') return interaction.editReply(`**${char.char_name}** has **${char.ap_current}/${char.ap_max} AP**.`);

  if (sub === 'spend') {
    const amount = interaction.options.getInteger('amount');
    const result = db.spendAP(char.id, amount);
    if (!result.success) return interaction.editReply(result.error);
    return interaction.editReply(`**${result.char.char_name}** spends **${amount} AP** and now has **${result.char.ap_current}/${result.char.ap_max} AP**.`);
  }
}

async function handleEnd(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no active character.');
  const result = db.resetAP(char.id);
  if (!result.success) return interaction.editReply(result.error);
  return interaction.editReply(`**${result.char.char_name}** resets to full AP: **${result.char.ap_current}/${result.char.ap_max}**.`);
}

async function handleAdvance(interaction) {
  const char = db.getActiveCharacter(interaction.user.id);
  if (!char) return interaction.editReply('You have no active character.');
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
      { name: 'Pending Level-Ups', value: `Skill: **${result.pendingSkill}** | Ability: **${result.pendingAbility}**`, inline: false },
      { name: 'Updated Traits', value: traitsString(result.traits), inline: false },
    );
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
  return interaction.editReply(`<@${targetUser.id}> received **${amount} ${type} level-up${amount === 1 ? '' : 's'}** for **${result.charName}**. They can spend it with \`/advance ${type}\`.`);
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
    const [charIdRaw, skill] = interaction.customId.replace('reroll_skill_', '').split('|');
    const char = db.getCharacterById(parseInt(charIdRaw, 10), interaction.user.id);
    if (!char) return interaction.reply({ content: 'Character not found or not yours.', ephemeral: true });
    const ability = db.getParentAbility(skill);
    const rollData = dice.rollSkill(skill, char[skill], ability, char[ability]);
    db.recordRoll(char.id, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.reply({ embeds: [skillRollEmbed(char, skill, ability, rollData)], components: [rerollSkillRow(char.id, skill)] });
  }

  if (interaction.customId.startsWith('reroll_ability_')) {
    const [charIdRaw, ability] = interaction.customId.replace('reroll_ability_', '').split('|');
    const char = db.getCharacterById(parseInt(charIdRaw, 10), interaction.user.id);
    if (!char) return interaction.reply({ content: 'Character not found or not yours.', ephemeral: true });
    const rollData = dice.rollAbility(ability, char[ability]);
    db.recordRoll(char.id, null, ability, rollData.diceResult, rollData.modifier, rollData.total);
    return interaction.reply({ embeds: [abilityRollEmbed(char, ability, rollData)], components: [rerollAbilityRow(char.id, ability)] });
  }

  if (interaction.customId.startsWith('rerollraw_')) {
    const notation = interaction.customId.replace('rerollraw_', '');
    const result = dice.roll(notation);
    if (!result.success) return interaction.reply({ content: result.error, ephemeral: true });
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
      { name: 'AP', value: `**${char.ap_current}/${char.ap_max}**`, inline: true },
      { name: 'Pending Level-Ups', value: `Skill: **${char.pending_skill_levelups}** | Ability: **${char.pending_ability_levelups}**`, inline: true },
      { name: 'Derived Traits', value: traitsString(char.traits), inline: false },
      { name: 'Abilities and Skill Levels', value: abilityLines, inline: false },
      { name: 'Roll Stats', value: `Rolls: **${char.total_rolls}** | Crits: **${char.crits}** | Fumbles: **${char.fumbles}**`, inline: false },
    )
    .setFooter({ text: `Created ${new Date(char.created_at).toLocaleDateString()}` });

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function skillRollEmbed(char, skill, ability, rollData, label = null) {
  const embed = baseRollEmbed(rollData)
    .setTitle(label || `${capitalize(skill)} Check`)
    .setDescription(`**${char.char_name}** rolls **d20 + ${capitalize(ability)} + ${capitalize(skill)}**`)
    .addFields(
      { name: 'Total', value: `# ${rollData.total}`, inline: true },
      { name: 'Breakdown', value: rollData.breakdown, inline: true },
      { name: 'Die Roll', value: `${rollData.diceResult} / 20`, inline: true },
      { name: `${capitalize(ability)} Bonus`, value: `+${char[ability]}`, inline: true },
      { name: `${capitalize(skill)} Bonus`, value: `+${char[skill]}`, inline: true },
    )
    .setFooter({ text: `Character: ${char.char_name}` });
  addCritText(embed, rollData);
  return embed;
}

function abilityRollEmbed(char, ability, rollData, label = null) {
  const embed = baseRollEmbed(rollData)
    .setTitle(label || `${capitalize(ability)} Check`)
    .setDescription(`**${char.char_name}** rolls **d20 + ${capitalize(ability)}**`)
    .addFields(
      { name: 'Total', value: `# ${rollData.total}`, inline: true },
      { name: 'Breakdown', value: rollData.breakdown, inline: true },
      { name: 'Die Roll', value: `${rollData.diceResult} / 20`, inline: true },
      { name: `${capitalize(ability)} Bonus`, value: `+${char[ability]}`, inline: true },
    )
    .setFooter({ text: `Character: ${char.char_name}` });
  addCritText(embed, rollData);
  return embed;
}

function rawRollEmbed(username, notation, result, title) {
  const embed = baseRollEmbed(result)
    .setTitle(title)
    .setDescription(`**${username}** rolled \`${notation}\``)
    .addFields(
      { name: 'Result', value: `# ${result.total}`, inline: true },
      { name: 'Breakdown', value: result.breakdown, inline: true },
      { name: 'Range', value: `${result.min} to ${result.max}`, inline: true },
    );
  addCritText(embed, result);
  return embed;
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

function rerollSkillRow(charId, skill) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_skill_${charId}|${skill}`).setLabel(`Roll ${capitalize(skill)} Again`).setStyle(ButtonStyle.Secondary)
  );
}

function rerollAbilityRow(charId, ability) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_ability_${charId}|${ability}`).setLabel(`Roll ${capitalize(ability)} Again`).setStyle(ButtonStyle.Secondary)
  );
}

function traitsString(t) {
  return [
    `Health: **${t.health}**`,
    `Movement: **${t.movement}**`,
    `Stress: **${t.stress}**`,
    `Dodge Defense: **${t.dodge_defense}**`,
    `Parry Defense: **${t.parry_defense}**`,
    `AP: **${t.ap_current}/${t.ap_max}**`,
  ].join('\n');
}

function shouldBeEphemeral(cmd) {
  return ['character', 'history', 'ap', 'advance'].includes(cmd);
}

function isModerator(member) {
  return Boolean(member && member.permissions.has(PermissionFlagsBits.ManageRoles));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

client.login(process.env.DISCORD_TOKEN);
