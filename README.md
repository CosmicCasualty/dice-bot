# Undead Archive Dice Bot
## Setup

```bash
npm install
cp .env.example .env
npm start
```

The real `.env` file should contain your Discord bot token and app/client ID. Do not commit `.env` to GitHub.

## Main commands

- `/character create name:<name>` creates and saves a character.
- `/character list` lists your characters.
- `/select id:<id>` selects your active character.
- `/sheet` shows the selected character sheet.
- `/roll skill skill:<skill> mode:<normal|adv|dis>` rolls `d20 + parent ability + skill`.
- `/roll ability ability:<ability> mode:<normal|adv|dis>` rolls `d20 + ability`.
- `/rollraw dice:<notation>` rolls free-form dice like `2d6+3`.
- `/history` shows the selected character's recent rolls.

## Resources

Use positive numbers to recover and negative numbers to spend or reduce.

- `/ap amount:-2`
- `/hp amount:-2`
- `/movement amount:-2`
- `/stress amount:-2`

`/end` applies end-turn effects, resets AP and Movement to full, and reduces condition durations by 1.

## Starting level-ups

New characters receive:

- 3 ability level-ups
- 5 skill level-ups

Starting skill level-ups cannot raise a skill above 3. Later level-ups can raise skills and abilities up to 10.

Admins can grant level-ups:

- `/levelup user:<player> character_id:<id> type:skill amount:<n>`
- `/levelup user:<player> character_id:<id> type:ability amount:<n>`

Players spend them with:

- `/advance skill skill:<skill>`
- `/advance ability ability:<ability>`
