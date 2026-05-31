# Undead Archive Dice Bot User Guide

Version: **0.6.2**

## Getting started

1. Create your character with `/character create name:<name>`.
2. Use `/character sheet` or `/sheet` to view your character sheet.
3. Spend your starting level-ups with `/advance stat:<ability-or-skill>`.
4. Roll checks with `/roll`.

New characters start with:

- **3 ability level-ups**
- **5 skill level-ups**

Starting skill level-ups cannot raise a skill above **3**. Later level-ups can raise skills and abilities up to **10**.

## Character commands

### `/character create name:<name>`

Creates a new character for you.

If you create more than one character, use `/character list` to find the character ID, then use `/select id:<id>` or `/character switch id:<id>`.

### `/character list`

Shows all of your characters, their IDs and which one is selected.

Use the listed ID when selecting, switching, or deleting a character.

### `/character image link:<image-link>`

Sets the image shown on your selected character-related embeds.

The link must start with `http://` or `https://`. Direct image links work best.

### `/character color color:<hexcode>`

Sets the embed color used for your selected character. 
This controls the colored line on the left side of character-related embeds.

### `/character rename name:<name>`

Renames your selected character.

### `/character switch id:<id>`

Switches your active character.

### `/character delete id:<id>`

Deletes one of your characters.

Deleted characters cannot be recovered from inside Discord.

## Selection and sheet commands

### `/select id:<id>`

Selects one of your characters as active.

### `/sheet` or `/character sheet`

Shows your active character sheet.

Character sheets use your selected character image and embed color.

When a sheet message is pinned, the bot remembers it and automatically updates it when visible sheet values change.

## Rolling commands

### `/roll stat:<ability-or-skill> mode:<normal|adv|dis> label:<optional-label>`

Rolls a d20 check for an ability or skill.

Ability rolls use:

```text
d20 + ability
```

Skill rolls use:

```text
d20 + parent ability + skill
```

Examples:

```text
/roll stat:Physique mode:normal
/roll stat:Melee mode:adv label:Knife attack
/roll stat:Stealth mode:dis label:Sneak past guard
```

The `mode` option is optional. If you leave it blank, the roll is normal.

Available modes:

- `normal`: roll once
- `adv`: advantage
- `dis`: disadvantage

### `/rollraw dice:<notation> label:<optional-label>`

Rolls free-form dice notation.

Examples:

```text
/rollraw dice:2d6+3
/rollraw dice:d20 label:Luck roll
```

### `/history`

Shows the last 10 rolls for your selected character.

## Resource commands

Use positive numbers to add resources and negative numbers to spend, lose, or take damage.

### `/ap amount:<number>`

Adjusts your selected character's AP.

### `/hp amount:<number>`

Adjusts your selected character's health.

### `/movement amount:<number>`

Adjusts your selected character's movement.

### `/stress amount:<number>`

Adjusts your selected character's stress.

When stress is maxed out, the bot rolls Morale and resets stress to 0.

### `/end`

Ends your turn.

This command:

- Applies end-turn effects
- Reduces timed condition durations by 1 round
- Removes expired timed conditions
- Resets AP to full
- Resets movement to full

## Conditions

### `/condition add name:<condition> time:<rounds>`

Adds a condition to your selected character.

The `time` option is optional and defaults to 1 round.

### `/condition remove name:<condition>`

Removes a condition from your selected character.

### `/condition list`

Lists active conditions on your selected character.

## Injuries

### `/injury add name:<injury>`

Adds an injury to your selected character.

Some injuries automatically add persistent conditions.

### `/injury remove name:<injury>`

Removes an injury from your selected character.

Any persistent conditions granted by that injury are also removed.

### `/injury list`

Lists active injuries on your selected character.

## Level-up commands

### `/advance stat:<ability-or-skill>`

Spends one pending ability or skill level-up. Choose the ability or skill from the single `stat` option, similar to `/roll`.


## NPC commands

These commands require admin or moderator permissions. NPCs are hardcoded in `npc-data.js`, not created through Discord commands.

The bot currently includes:

- **Infected**: HP 3, AP 2, Movement 3, Physique 2, Agility 1, Melee 2, Resilience 2, Awareness 2, Intimidation 2. Any unlisted ability or skill defaults to 0.
- **examplenpc**: HP 1, AP 1, Movement 1, all abilities 1, and all skills 1.

### `/npclist`

Lists all hardcoded NPCs with their HP, AP, and Movement.

### `/npcsheet npc:<name>`

Shows the full hardcoded NPC sheet, including resources, abilities, and all skill levels.

Examples:

```text
/npcsheet npc:infected
/npcsheet npc:examplenpc
```

### `/npcroll npc:<name> stat:<ability-or-skill> mode:<normal|adv|dis>`

Rolls as a hardcoded NPC.

Ability rolls use:

```text
d20 + ability
```

Skill rolls use:

```text
d20 + parent ability + skill
```

Examples:

```text
/npcroll npc:infected stat:Melee
/npcroll npc:examplenpc stat:Awareness mode:adv
```

NPC traits are not calculated from ability or skill levels. Their resources and stat values come directly from `npc-data.js`.

## Admin commands

These commands require admin or moderator permissions.

### `/levelup character_id:<id> type:<skill|ability> amount:<number>`

Grants pending level-ups to a character.

### `/setstat character_id:<id> stat:<stat> value:<number>`

Sets an ability or skill to a specific value.

### `/adminsheet id:<id>`

Shows the sheet for any character by character ID, regardless of who owns it.

### `/adminlist`

Lists all characters created on the bot.

Each entry shows:

- character name
- user name
- character ID

If there are many characters, the command splits the list across multiple embeds.

## Tips

- Use `/character list` when you forget a character ID.
- Use `/sheet` after creating or changing a character.
- Pin a sheet message if you want the bot to keep that sheet updated.
