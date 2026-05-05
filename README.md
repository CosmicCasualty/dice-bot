# 🎲 Discord RPG Dice Bot

A Discord bot for a custom tabletop RPG system with character profiles, abilities, skills, derived traits, and moderator-controlled progression.

---

## System Overview

### Abilities & Skills

Each character has four **Abilities**, each with child **Skills**:

| Ability | Skills |
|---|---|
| **Physique** | Athletics, Melee, Resilience |
| **Agility** | Aiming, Stealth, Reflex, Finesse |
| **Reason** | Awareness, Medicine, Technology, Academia |
| **Presence** | Morale, Intimidation, Persuasion, Deception |

### Rolling

All skill checks roll: **d20 + Skill + Parent Ability**

> Example: `/roll skill:athletics` → rolls d20 + Athletics + Physique

### Derived Traits

| Trait | Formula |
|---|---|
| ❤️ Health | 5 + Physique + ⌊Resilience ÷ 2⌋ |
| 🏃 Movement | 3 + ⌊(Athletics + Reflex) ÷ 2⌋ |
| 🧠 Stress | 3 + Presence |
| 🛡️ Dodge Defense | 10 + Agility + Reflex |
| ⚔️ Parry Defense | 10 + Physique + Melee |

Traits update automatically whenever stats change.

---

## Commands

### Player Commands

| Command | Description |
|---|---|
| `/character create name:<name>` | Create a new character |
| `/character list` | List all your characters |
| `/character switch id:<id>` | Set a character as active |
| `/character delete id:<id>` | Delete a character |
| `/profile` | View your active character sheet |
| `/profile user:@someone` | View another player's active character |
| `/roll skill:<skill>` | Roll a skill check (d20 + skill + ability) |
| `/roll skill:<skill> label:<text>` | Roll with a custom label |
| `/rollraw dice:<notation>` | Free-form dice roll (e.g. `2d6+3`, `d20`) |
| `/history` | View your active character's last 10 rolls |

### Moderator Commands
*Requires the **Manage Roles** permission*

| Command | Description |
|---|---|
| `/levelup user:@player character_id:<id> stat:<stat>` | Increase a stat by 1 |
| `/setstat user:@player character_id:<id> stat:<stat> value:<n>` | Set a stat to a specific value (0–99) |

> 💡 Find a character's ID via `/character list` (the player) or `/profile @player`.

---

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+
- A Discord bot with **Manage Roles** permission scope (for mod commands)

### 2. Create a Discord Application

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → name it
3. **Bot** → **Add Bot** → copy the **Token** (= `DISCORD_TOKEN`)
4. **General Information** → copy **Application ID** (= `CLIENT_ID`)
5. **Bot → Privileged Gateway Intents**: enable **Server Members Intent**

### 3. Invite the Bot

**OAuth2 → URL Generator**:
- Scopes: `bot`, `applications.commands`
- Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`

### 4. Install & Run

```bash
npm install

cp .env.example .env
# Fill in DISCORD_TOKEN and CLIENT_ID

npm start
```

Commands register globally on first start (can take up to 1 hour to propagate).

---

## File Structure

```
discord-dice-bot/
├── bot.js          # Slash commands, interactions, embeds
├── diceEngine.js   # d20 skill rolling + free-form notation
├── database.js     # SQLite: characters, stats, roll history
├── package.json
├── .env.example
└── data/
    └── dice.db     # Auto-created on first run
```

---

## Moderator Workflow Example

```
1. Player: /character create name:Seraphine
   → Bot: "Character Seraphine created! (ID: 3)"

2. Mod: /setstat user:@player character_id:3 stat:physique value:3
   → Bot: Physique set to 3. Updated traits shown.

3. Mod: /levelup user:@player character_id:3 stat:athletics
   → Bot: Athletics leveled up 0 → 1.

4. Player: /roll skill:athletics
   → Bot: d20 + Athletics (1) + Physique (3) = total shown.

5. Player: /profile
   → Bot: Full character sheet with all traits.
```

---

## Hosting (24/7 Uptime)

- **[Railway](https://railway.app)** or **[Fly.io](https://fly.io)** — easy Node.js + persistent volumes for SQLite
- **VPS with PM2**: `pm2 start bot.js --name dice-bot && pm2 save`
