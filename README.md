# Discord RPG Dice Bot

A Discord bot for a custom d20 tabletop RPG system with saved characters, ability and skill rolls, current/max resources, character sheets, morale checks, and admin-granted player-chosen level-ups.

## Main Rules

### Abilities and Skills

Each character has four abilities, each with child skills:

| Ability | Skills |
|---|---|
| Physique | Athletics, Melee, Resilience |
| Agility | Aiming, Stealth, Reflex, Finesse |
| Reason | Awareness, Medicine, Technology, Academia |
| Presence | Morale, Intimidation, Persuasion, Deception |

### Character Creation

New characters are saved in SQLite and begin with:

- 3 pending ability level-ups
- 5 pending skill level-ups
- 4 / 4 AP

Starting skill level-ups cannot raise a skill above 3. Later skill level-ups can raise skills up to 10.

### Rolling

Skill checks always roll:

```text
d20 + parent ability + skill
```

Ability checks roll:

```text
d20 + ability
```

Rolls support an optional mode:

- `normal`
- `adv`, roll 2d20 and keep the highest
- `dis`, roll 2d20 and keep the lowest

Roll output shows only the total and the breakdown. It does not show separate die-roll or bonus fields.

### Derived Traits

Traits update automatically whenever stats change.

| Trait | Formula |
|---|---|
| Health | 5 + Physique + floor(Resilience / 2) |
| Movement | 3 + floor((Athletics + Reflex) / 2) |
| Stress | 3 + Presence |
| AP | Current AP / Max AP, default 4 / 4 |
| Base Defense | 10 + Resilience |
| Dodge Defense | 10 + Agility + Reflex |
| Parry Defense | 10 + Physique + Melee |

AP, HP, Movement, and Stress all use current/max formatting.

### Stress and Morale

When Stress hits 0, the bot automatically rolls Morale as `d20 + Presence + Morale` and posts the morale table:

| Total | Result |
|---|---|
| 1-5 | Surrender: You surrender to your opponents. |
| 6-10 | Freeze: Your movement and AP reduced to 0 until the end of your next turn. |
| 11-15 | Flee: On your next turn you must get as far away as you can. |
| 16+ | Dazed: You are stunned until the end of your next round. |

If Freeze is rolled, the bot sets current AP and movement to 0.

## Commands

### Player Commands

| Command | Description |
|---|---|
| `/character create name:<name>` | Create and save a new character |
| `/character list` | List all your saved characters |
| `/character switch id:<id>` | Set a character as active |
| `/character delete id:<id>` | Delete one of your characters |
| `/profile` | View your active character sheet |
| `/profile user:@someone` | View another player's active character |
| `/roll skill skill:<skill> mode:<normal/adv/dis>` | Roll d20 + parent ability + skill |
| `/roll ability ability:<ability> mode:<normal/adv/dis>` | Roll d20 + ability |
| `/rollraw dice:<notation>` | Free-form dice roll, for example `2d6+3` or `d20` |
| `/history` | View your active character's last 10 rolls |
| `/ap amount:<n>` | Adjust AP. Use negative numbers to spend AP, for example `-2` |
| `/hp amount:<n>` | Adjust health. Use negative numbers to take damage |
| `/movement amount:<n>` | Adjust movement. Use negative numbers to spend movement |
| `/stress amount:<n>` | Adjust stress. Use negative numbers to lose stress |
| `/end` | Reset current AP and movement to full |
| `/advance skill skill:<skill>` | Spend a pending skill level-up |
| `/advance ability ability:<ability>` | Spend a pending ability level-up |

Discord slash commands display `amount` as an option, so the closest Discord form to `/ap -2` is `/ap amount:-2`.

### Admin Commands

Requires Manage Roles permission.

| Command | Description |
|---|---|
| `/levelup user:@player character_id:<id> type:skill amount:<n>` | Grant pending skill level-ups for the player to choose |
| `/levelup user:@player character_id:<id> type:ability amount:<n>` | Grant pending ability level-ups for the player to choose |
| `/setstat user:@player character_id:<id> stat:<stat> value:<n>` | Set a stat directly |

## Persistence

Characters are stored in SQLite at `data/dice.db` by default. The database migration is non-destructive and adds the new resource and pending level-up columns to existing databases.

For hosted deployments, make sure `data/dice.db` is on persistent storage. On Railway, Fly.io, or similar hosts, attach a persistent volume and keep the `data` directory on the mounted volume.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Your `.env` file needs:

```text
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_client_id
```

Slash commands register globally when the bot starts. Global command updates can take time to appear in Discord.
