# Motherboard: Ferrond

A Foundry VTT module for the Daggerheart campaign *White Signal*, set in Ferrond.
It holds the setting's house rules: money, scrap loot, the scrap trade and the Ikonis.

- Foundry VTT 14, Daggerheart system 2.12.9
- Replaces [dh-ikonis](https://git.geeks.gay/cosmo/dh-ikonis): Ferrond brings its own Ikonis. Switch dh-ikonis off.

## What it does

### Bits, Bytes and Chunks

The character sheets show Ferrond's money instead of Gold or Quantum:
**Bits**, **Bytes** and **Chunks** (8 Bits = 1 Byte, 8 Bytes = 1 Chunk).
The module writes this into Daggerheart's Homebrew currency settings. dh-ikonis would put
Quantum back on every start, so the module switches off its setting *Enable Quantum Currency*.
Amounts already on the sheets stay where they are (Quantum becomes Bits).

### Scrap

The compendium **Ferrond Items** holds the 18 scrap pieces of the Motherboard frame.
A piece is worth the number in its table: Shards in Bits, Metals in Bytes, Components in Chunks.

| Shards (d6) | 1 Gear · 2 Coil · 3 Wire · 4 Trigger · 5 Lens · 6 Crystal |
|---|---|
| **Metals (d8)** | 1 Aluminum · 3 Copper · 5 Cobalt · 6 Silver · 7 Platinum · 8 Gold |
| **Components (d10)** | 1 Fuse · 3 Circuit · 6 Disc · 8 Relay · 9 Capacitor · 10 Battery |

A roll between two numbers gives the lower piece (a 2 on the Metals die is Aluminum).
**Ferrond Tables** has the same three tables as roll tables. Both compendiums are GM only.

Scrap items get their own **Loot** section in the inventory and show kind and worth as tags.

### The Ferrond toolbar

The scene controls on the left get their own group **Ferrond** (gear):

- **Scrap Reward** (GM) – release scrap after a fight or a search.
- **Scrap Shack** – the GM manages the shop; players see the group only while a shop is open
  and use it to browse the shop.

The group has no canvas layer of its own, so the token layer stays active while it is selected.

### Scrap Reward (GM)

**Ferrond → Scrap Reward**:

1. Choose **Fight** (Easy … Very Difficult) or **Search** without a fight (type the DC:
   up to 12 Easy, 13–17 Standard, 18–22 Difficult, 23+ Very Difficult).
2. Choose how many **remnants** (machines) were among the enemies or are in the place.
3. The characters and their dice come from the loot table. Untick a character or change
   any number for this release only.
4. **Release** posts a card in the chat.

Every player gets their own dice. On the card they either click **Take scrap** to roll in
Foundry, or first type the results of physical dice (empty fields are rolled in Foundry).
The GM's client checks the results and puts the scrap straight into the inventory;
equal pieces stack. Typed results are marked with a hand. Each entry can be taken once.

Default loot table (dice per player):

| Remnants | Easy | Standard | Difficult | Very Difficult |
|---|---|---|---|---|
| None | 1 S | 2 S, 1 M | 3 S, 2 M | 3 S, 3 M |
| Some | 2 S | 2 S, 2 M | 3 S, 3 M | 3 S, 3 M, 1 C |
| Many | 3 S | 3 S, 2 M | 3 S, 3 M, 1 C | 3 S, 3 M, 2 C |

*S = Shard, M = Metal, C = Component.* Change it in the module settings: **Edit loot table**.

### Scrap Shack

**Ferrond → Scrap Shack** (GM): name the shop and check the daily stock – rolled like the SRD,
1d10 of each Shard, 1d8 of each Metal, 1d6 of each Component – then **Open shop**.
Every number can be changed. **New day** rolls a new stock, **Close shop** closes it.
One shop is open at a time.

**An open shop is the GM's approval.** Players open the shop from the Ferrond group or from the
chat card and trade without asking:

- **Buy**: pick quantities, see the total and your money; the button stays off if the money is
  not enough. Payment makes change in Ferrond's ladder – a Gear (1 Bit) paid with a Chunk gives
  7 Bytes and 7 Bits back.
- **Sell**: your scrap at its worth; sold pieces go into the shop's stock.

Prices are the scrap values, for buying and selling alike. Every trade runs through the GM's
client (stock and money are checked again) and is posted in the chat.

### Selling scrap outside a shop

Scrap items have **Sell** in their item menu (⋮ or right click). The player picks how many; the
GM gets **Approve / Deny** (in Ferrond you sell in town). Only on approval the pieces leave the
inventory and their worth is added to the matching currency. The sale appears in the chat.

### Ikonis and augments

An **Ikonis** is a weapon bound to its person. It has **Bonded** (Daggerheart's own weapon feature:
+ your level to damage with it) and grows through **augments**.

- Every weapon sheet has an **Ikonis** tab. The GM clicks **Make Ikonis** and can keep the weapon's
  stats or take the Iconic Weapon stats of the Motherboard frame: Physical Melee d12+1,
  Very Close d10+2, Close d10 · Tech Far d8+1, Very Far d6+1 (plus a trait).
- **Slots:** two at the start, one more per tier of the character.
- **Augments** are items in the inventory (own section *Augments*). In the Ikonis tab the owner
  installs one (it leaves the inventory) or takes it out again (it comes back). The same augment does
  not work twice. Every swap is posted in the chat – swapping happens during downtime.
- Installed, an augment is a Daggerheart weapon feature, so the system adds its effects itself:
  +1/+2/+3 damage (Force, Sear, Bury) and to attack rolls (Converge, Target), Armor Score
  (Guard, Deny, Block with −1 Evasion), an extra Armor Slot (Absorb), Powerful (Amplify),
  advantage reminder (Override), one range step (Scope). Augments with a Stress cost (Split,
  Magnetzug, Kick, Follow) get an action that pays it. The rest is rule text on the weapon.
- The compendium **Ferrond Items** has all augments in the folder *Augments*. Until crafting comes,
  the GM hands them out from there.

Augments come from the recipe table in the vault note *Crafting (DH)* (`npm run recipes`).

**Moving from dh-ikonis:** switch dh-ikonis off and reload. Ferrond then removes its leftovers
(weapon features "Ikonis: …" on weapons and in the Homebrew settings). While dh-ikonis is on,
the GM gets a reminder.

### Tech damage

Ferrond knows only physical and tech damage. The module names Daggerheart's magic damage **Tech**
(microchip icon) in the Homebrew settings; the rules stay the same. A name set there by hand is kept.

## Settings

- **Bits, Bytes and Chunks** – on by default. Off keeps whatever currency is set.
- **Edit loot table** – dice per player for every row and column.
- **Tech instead of Magic damage** – on by default.

For macros: `game.modules.get("motherboard-ferrond").api` has `openScrapReward()`,
`openShopManager()`, `openShopWindow()`,
`makeIkonis(weapon)`, `installAugment(weapon, item)`, `removeAugment(weapon, key)` and `addAugmentItem(actor, key)`.

## Install

Foundry Setup → Add-on Modules → Install Module → Manifest URL:

```
https://github.com/ichezzy/motherboard-ferrond/releases/latest/download/module.json
```

## Development

```
npm install
npm test               # rules and release helpers
npm run icons          # art/originals/*.webp → assets/icons (trimmed, 512 / 256 / 128 px)
npm run recipes        # vault note "Crafting (DH)" → scripts/recipes-data.mjs (vault folder in tools/vault.txt)
npm run packs          # build packs/ from scripts/data.mjs
```

- `scripts/data.mjs` holds all rules as plain data (scrap tables, loot table, currency).
- `scripts/recipes-data.mjs` is generated from the vault; `scripts/ikonis-rules.mjs` says what each augment does in Foundry.
- `docs/icon-prompts.md` has the image prompts for the icons.
- `tools/deploy.ps1` copies the module to the Foundry server (target in `tools/target.txt`).
- `Ferrond veröffentlichen.bat` publishes a new version on GitHub (tests, compendiums, ZIP, release).
