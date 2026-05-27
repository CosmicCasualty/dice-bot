# Discord RPG Dice Bot

A Discord bot for a custom d20 tabletop RPG system with saved characters, ability and skill rolls, action points, character sheets, and admin-granted player-chosen level-ups.

## Main Rules

### Abilities and Skills

Each character has four abilities, each with child skills:

| Ability | Skills |
|---|---|
| Physique | Athletics, Melee, Resilience |
| Agility | Aiming, Stealth, Reflex, Finesse |
| Reason | Awareness, Medicine, Technology, Academia |
| Presence | Morale, Intimidation, Persuasion, Deception |

### Rolling

Skill checks always roll:

```text
d20 + parent ability + skill
```

Ability checks roll:

```text
d20 + ability
```

Natural 20s are criticals. Natural 1s are fumbles.

### Derived Traits

Traits update automatically whenever stats change.

| Trait | Formula |
|---|---|
| Health | 5 + Physique + floor(Resilience / 2) |
| Movement | 3 + floor((Athletics + Reflex) / 2) |
| Stress | 3 + Presence |
| Dodge Defense | 10 + Agility + Reflex |
| Parry Defense | 10 + Physique + Melee |
| AP | Current AP / Max AP, default 4 / 4 |

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
| `/roll skill skill:<skill>` | Roll d20 + parent ability + skill |
| `/roll ability ability:<ability>` | Roll d20 + ability |
| `/rollraw dice:<notation>` | Free-form dice roll, for example `2d6+3` or `d20` |
| `/history` | View your active character's last 10 rolls |
| `/ap spend amount:<n>` | Retract or spend current AP |
| `/ap status` | Show current AP |
| `/end` | Reset current AP to full max AP |
| `/advance skill skill:<skill>` | Spend a pending skill level-up |
| `/advance ability ability:<ability>` | Spend a pending ability level-up |

### Admin Commands

Requires Manage Roles permission.

| Command | Description |
|---|---|
| `/levelup user:@player character_id:<id> type:skill amount:<n>` | Grant pending skill level-ups for the player to choose |
| `/levelup user:@player character_id:<id> type:ability amount:<n>` | Grant pending ability level-ups for the player to choose |
| `/setstat user:@player character_id:<id> stat:<stat> value:<n>` | Set a stat directly |

## Persistence

Characters are stored in SQLite at `data/dice.db` by default. The database migration is non-destructive and adds the new AP and pending level-up columns to existing databases.

For hosted deployments, make sure `data/dice.db` is on persistent storage. On Railway, Fly.io, or similar hosts, attach a persistent volume and point your app at it, or keep the `data` directory on the mounted volume.

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
