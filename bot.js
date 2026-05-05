require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits,
} = require('discord.js');

const Database = require('./database');
const DiceEngine = require('./diceEngine');
const { SKILL_TREE, ABILITIES, ALL_SKILLS } = require('./database');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const db = new Database();
const dice = new DiceEngine();

// ─── All valid skill names for autocomplete ───────────────────────────────────
const ALL_SKILL_NAMES = ALL_SKILLS.map(s => s.skill);
const ALL_STAT_NAMES  = [...ABILITIES, ...ALL_SKILL_NAMES];

// ─── Slash Command Definitions ────────────────────────────────────────────────

const commands = [

  // /character — manage your characters
  new SlashCommandBuilder()
    .setName('character')
    .setDescription('Manage your characters')
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new character')
      .addStringOption(o => o.setName('name').setDescription('Your character\'s name').setRequired(true)))
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all your characters'))
    .addSubcommand(s => s
      .setName('switch')
      .setDescription('Switch your active character')
      .addIntegerOption(o => o.setName('id').setDescription('Character ID (from /character list)').setRequired(true)))
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete one of your characters')
      .addIntegerOption(o => o.setName('id').setDescription('Character ID to delete').setRequired(true))),

  // /profile — view full character sheet
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your active character sheet')
    .addUserOption(o => o.setName('user').setDescription('View another user\'s active character').setRequired(false)),

  // /roll — roll a skill (d20 + skill + ability)
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll a skill check (d20 + skill + parent ability)')
    .addStringOption(o => d20
      .setName('skill')
      .setDescription('Skill to roll')
      .setRequired(true)
      .addChoices(...ALL_SKILL_NAMES.map(s => ({ name: capitalize(s), value: s }))))
    .addStringOption(o => o
      .setName('label')
      .setDescription('Optional label for this roll')
      .setRequired(false)),

  // /roll raw — free-form dice notation
  new SlashCommandBuilder()
    .setName('rollraw')
    .setDescription('Roll free-form dice notation (e.g. 2d6+3, d20)')
    .addStringOption(o => o.setName('dice').setDescription('Dice notation').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Optional label').setRequired(false)),

  // /history — roll history for active character
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your active character\'s last 10 rolls'),

  // /levelup — MOD ONLY: level up an ability or skill on a character
  new SlashCommandBuilder()
    .setName('levelup')
    .setDescription('[MOD] Level up an ability or skill on a character')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The player').setRequired(true))
    .addIntegerOption(o => o.setName('character_id').setDescription('Character ID (from /character list or /profile)').setRequired(true))
    .addStringOption(o => o
      .setName('stat')
      .setDescription('Ability or skill to level up')
      .setRequired(true)
      .addChoices(...ALL_STAT_NAMES.map(s => ({ name: capitalize(s), value: s })))),

  // /setstat — MOD ONLY: set a stat to a specific value
  new SlashCommandBuilder()
    .setName('setstat')
    .setDescription('[MOD] Set an ability or skill to a specific value')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The player').setRequired(true))
    .addIntegerOption(o => o.setName('character_id').setDescription('Character ID').setRequired(true))
    .addStringOption(o => o
      .setName('stat')
      .setDescription('Ability or skill to set')
      .setRequired(true)
      .addChoices(...ALL_STAT_NAMES.map(s => ({ name: capitalize(s), value: s }))))
    .addIntegerOption(o => o.setName('value').setDescription('New value (0–99)').setRequired(true)),

].map(c => c.toJSON());

// ─── Register commands ────────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── Embed helpers ────────────────────────────────────────────────────────────

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statBar(value, max = 10) {
  const filled = Math.min(value, max);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, max - filled)) + ` **${value}**`;
}

/** Build a full character sheet embed */
function characterSheetEmbed(char, avatarUrl = null) {
  const t = char.traits;

  // Ability + children lines
  const abilityLines = ABILITIES.map(ability => {
    const skills = SKILL_TREE[ability];
    const skillLines = skills.map(sk =>
      `  ↳ ${capitalize(sk)}: **${char[sk]}**`
    ).join('\n');
    return `**${capitalize(ability)}: ${char[ability]}**\n${skillLines}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`📜 ${char.char_name}`)
    .setDescription(`*Character of <@${char.user_id}>*  •  ID: \`${char.id}\``)
    .addFields(
      {
        name: '⚔️ Traits',
        value: [
          `❤️ **Health:** ${t.health}`,
          `🏃 **Movement:** ${t.movement}`,
          `🧠 **Stress:** ${t.stress}`,
          `🛡️ **Dodge Defense:** ${t.dodge_defense}`,
          `⚔️ **Parry Defense:** ${t.parry_defense}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎯 Abilities & Skills',
        value: abilityLines,
        inline: false,
      },
      {
        name: '📊 Roll Stats',
        value: `Rolls: **${char.total_rolls}**`,
        inline: false,
      }
    )
    .setFooter({ text: `Created ${new Date(char.created_at).toLocaleDateString()}` });

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

/** Build a roll result embed */
function skillRollEmbed(char, skill, ability, rollData, label) {

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎲 ${label || capitalize(skill) + ' Check'}`)
    .setDescription(
      `**${char.char_name}** rolls \`${capitalize(skill)}\` *(${capitalize(ability)} → ${capitalize(skill)})*`
    )
    .addFields(
      { name: 'Total', value: `# ${rollData.total}`, inline: true },
      { name: 'Breakdown', value: rollData.breakdown, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: `${capitalize(ability)} Bonus`, value: `+${char[ability]}`, inline: true },
      { name: `${capitalize(skill)} Bonus`, value: `+${char[skill]}`, inline: true },
      { name: 'Die Roll', value: `${rollData.diceResult} / 30`, inline: true },
    )
    .setFooter({ text: `Character: ${char.char_name}` })
    .setTimestamp();

  return embed;
}

// ─── Event: Ready ─────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ─── Event: Interaction ───────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

  // ── Button: reroll skill ────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('reroll_skill_')) {
    const parts = interaction.customId.replace('reroll_skill_', '').split('|');
    const charId = parseInt(parts[0]);
    const skill  = parts[1];

    const char = db.getCharacterById(charId, interaction.user.id);
    if (!char) return interaction.reply({ content: '❌ Character not found or not yours.', ephemeral: true });

    const ability   = db.getParentAbility(skill);
    const rollData  = dice.rollSkill(skill, char[skill], ability, char[ability]);
    db.recordSkillRoll(charId, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);

    const embed = skillRollEmbed(char, skill, ability, rollData, null);
    const row = rerollRow(charId, skill);
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  await interaction.deferReply({ ephemeral: shouldBeEphemeral(commandName) });

  // ── /character ──────────────────────────────────────────────────────────────
  if (commandName === 'character') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name').trim();
      if (!name || name.length > 50) {
        return interaction.editReply('❌ Character name must be 1–50 characters.');
      }
      const id = db.createCharacter(interaction.user.id, interaction.user.username, name);
      const char = db.getCharacterById(id);
      return interaction.editReply({
        content: `✅ Character **${name}** created! (ID: \`${id}\`)\nAsk a moderator to set your stats with \`/levelup\` or \`/setstat\`.`,
      });
    }

    if (sub === 'list') {
      const chars = db.listCharacters(interaction.user.id);
      if (!chars.length) {
        return interaction.editReply('📭 You have no characters yet. Use `/character create` to make one!');
      }
      const lines = chars.map(c =>
        `${c.active ? '▶️' : '　'} **[${c.id}]** ${c.char_name} — HP: ${c.traits.health} | ${c.total_rolls} rolls`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle(`${interaction.user.username}'s Characters`)
        .setDescription(lines)
        .setFooter({ text: '▶️ = active character' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'switch') {
      const id = interaction.options.getInteger('id');
      const ok = db.setActiveCharacter(interaction.user.id, id);
      if (!ok) return interaction.editReply(`❌ No character with ID \`${id}\` found, or it doesn't belong to you.`);
      const char = db.getCharacterById(id);
      return interaction.editReply(`✅ Switched active character to **${char.char_name}**.`);
    }

    if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const char = db.getCharacterById(id, interaction.user.id);
      if (!char) return interaction.editReply(`❌ No character with ID \`${id}\` found, or it doesn't belong to you.`);
      db.deleteCharacter(interaction.user.id, id);
      return interaction.editReply(`🗑️ Character **${char.char_name}** deleted.`);
    }
  }

  // ── /profile ─────────────────────────────────────────────────────────────────
  if (commandName === 'profile') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const char = db.getActiveCharacter(targetUser.id);
    if (!char) {
      return interaction.editReply(
        targetUser.id === interaction.user.id
          ? '📭 You have no active character. Use `/character create` to make one!'
          : `📭 ${targetUser.username} has no active character.`
      );
    }
    const embed = characterSheetEmbed(char, targetUser.displayAvatarURL());
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /roll ────────────────────────────────────────────────────────────────────
  if (commandName === 'roll') {
    const skill = interaction.options.getString('skill');
    const label = interaction.options.getString('label');

    const char = db.getActiveCharacter(interaction.user.id);
    if (!char) {
      return interaction.editReply('❌ You have no active character. Use `/character create` first!');
    }

    const ability  = db.getParentAbility(skill);
    const rollData = dice.rollSkill(skill, char[skill], ability, char[ability]);
    db.recordSkillRoll(char.id, skill, ability, rollData.diceResult, rollData.modifier, rollData.total);

    const embed = skillRollEmbed(char, skill, ability, rollData, label);
    const row = rerollRow(char.id, skill);
    return interaction.editReply({ embeds: [embed], components: [row] });
  }

  // ── /rollraw ─────────────────────────────────────────────────────────────────
  if (commandName === 'rollraw') {
    const notation = interaction.options.getString('dice');
    const label    = interaction.options.getString('label');

    const result = dice.roll(notation);
    if (!result.success) {
      return interaction.editReply(`❌ ${result.error}`);
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🎲 ${label || 'Free Roll'}`)
      .setDescription(`**${interaction.user.username}** rolled \`${notation}\``)
      .addFields(
        { name: 'Result', value: `# ${result.total}`, inline: true },
        { name: 'Breakdown', value: result.breakdown, inline: true },
        { name: 'Range', value: `${result.min} – ${result.max}`, inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rerollraw_${notation}`)
        .setLabel('Roll Again')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🎲')
    );
    return interaction.editReply({ embeds: [embed], components: [row] });
  }

  // ── /history ─────────────────────────────────────────────────────────────────
  if (commandName === 'history') {
    const char = db.getActiveCharacter(interaction.user.id);
    if (!char) return interaction.editReply('❌ You have no active character.');

    const history = db.getRollHistory(char.id);
    if (!history.length) return interaction.editReply('📜 No rolls yet for this character!');

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(`📜 ${char.char_name}'s Recent Rolls`)
      .setDescription(history.map((r, i) =>
        `**${i + 1}.** ${r.skill ? `${capitalize(r.skill)} (${capitalize(r.ability)})` : 'Free roll'} → **${r.total}** *(d20: ${r.dice_result})* <t:${Math.floor(new Date(r.rolled_at).getTime() / 1000)}:R>`
      ).join('\n'))
      .setFooter({ text: 'Last 10 rolls' });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /levelup (MOD ONLY) ───────────────────────────────────────────────────────
  if (commandName === 'levelup') {
    if (!isModerator(interaction.member)) {
      return interaction.editReply({ content: '❌ Only moderators can level up characters.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const charId     = interaction.options.getInteger('character_id');
    const stat       = interaction.options.getString('stat');

    // Verify ownership
    const char = db.getCharacterById(charId);
    if (!char || char.user_id !== targetUser.id) {
      return interaction.editReply(`❌ Character ID \`${charId}\` doesn't belong to ${targetUser.username}.`);
    }

    const result = db.levelUp(charId, stat);
    if (!result.success) return interaction.editReply(`❌ ${result.error}`);

    const isAbility = db.isAbility(stat);
    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('⬆️ Level Up!')
      .setDescription(`<@${targetUser.id}>'s character **${result.charName}** leveled up!`)
      .addFields(
        { name: isAbility ? '🔷 Ability' : '🔹 Skill', value: capitalize(stat), inline: true },
        { name: 'Old Value', value: `${result.old}`, inline: true },
        { name: 'New Value', value: `**${result.new}**`, inline: true },
        {
          name: '📊 Updated Traits',
          value: traitsString(result.traits),
          inline: false,
        }
      );

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /setstat (MOD ONLY) ───────────────────────────────────────────────────────
  if (commandName === 'setstat') {
    if (!isModerator(interaction.member)) {
      return interaction.editReply({ content: '❌ Only moderators can set stats.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const charId     = interaction.options.getInteger('character_id');
    const stat       = interaction.options.getString('stat');
    const value      = interaction.options.getInteger('value');

    const char = db.getCharacterById(charId);
    if (!char || char.user_id !== targetUser.id) {
      return interaction.editReply(`❌ Character ID \`${charId}\` doesn't belong to ${targetUser.username}.`);
    }

    const result = db.setStat(charId, stat, value);
    if (!result.success) return interaction.editReply(`❌ ${result.error}`);

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('✏️ Stat Updated')
      .setDescription(`<@${targetUser.id}>'s character **${result.charName}**`)
      .addFields(
        { name: 'Stat', value: capitalize(stat), inline: true },
        { name: 'Old', value: `${result.old}`, inline: true },
        { name: 'New', value: `**${result.new}**`, inline: true },
        { name: '📊 Updated Traits', value: traitsString(result.traits), inline: false },
      );

    return interaction.editReply({ embeds: [embed] });
  }

});

// ─── Handle raw reroll button ─────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('rerollraw_')) return;

  const notation = interaction.customId.replace('rerollraw_', '');
  const result = dice.roll(notation);
  if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🎲 Re-Roll')
    .setDescription(`**${interaction.user.username}** rolled \`${notation}\``)
    .addFields(
      { name: 'Result', value: `# ${result.total}`, inline: true },
      { name: 'Breakdown', value: result.breakdown, inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rerollraw_${notation}`).setLabel('Roll Again').setStyle(ButtonStyle.Secondary).setEmoji('🎲')
  );
  return interaction.reply({ embeds: [embed], components: [row] });
});

// ─── Utility functions ────────────────────────────────────────────────────────

function shouldBeEphemeral(cmd) {
  return ['character', 'history'].includes(cmd);
}

function isModerator(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function rerollRow(charId, skill) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reroll_skill_${charId}|${skill}`)
      .setLabel(`Roll ${capitalize(skill)} Again`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎲')
  );
}

function traitsString(t) {
  return [
    `❤️ Health: **${t.health}**`,
    `🏃 Movement: **${t.movement}**`,
    `🧠 Stress: **${t.stress}**`,
    `🛡️ Dodge: **${t.dodge_defense}**`,
    `⚔️ Parry: **${t.parry_defense}**`,
  ].join('  |  ');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
