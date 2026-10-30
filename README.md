# Hearthward

A hex-based hamlet builder, drawn like ink on parchment. You place buildings and roads,
and your villagers do the work. They can only travel on roads that connect to the
hearth, so a cut-off farm feeds no one. Survive winter, fire, blight, spring floods and wolves, and grow.

## Run

```
npm install
npm run dev      # play at http://localhost:5173
npm test         # sim tests (hex math, roads, pathing, jobs, balance smoke)
npm run build    # static build in dist/ (relative paths, works offline)
```

Requires Node 16+.

## Reading the build

The **Overlays** button (key C) cycles through three map modes:

| Mode | Shows |
| --- | --- |
| Roads | Which roads and buildings reach the hearth (teal) and which are cut off (vermilion) |
| Coverage | The reach of every well, chapel, watchtower and barracks. Houses are ringed green when their next tier can rise (or is rising), ochre when something is missing, and vermilion when they're about to fall back |
| Traffic | A warm wash over the hexes villagers have walked most in the last couple of days. Busy stretches are where a storehouse or a shortcut road pays off |

The top bar's **Idle** stat counts buildings that should be working and aren't: no road to the hearth, no workers, a full store, a used-up source, fire or flood. Fields resting in winter don't count. Hover it for the reasons, and click it to step the camera through the idle buildings one at a time.

## Tutorial

A new hamlet opens with a short guided tutorial in the top-left panel: lay a road from the hearth, build a woodcutter by the forest, watch the wood come home, then build a well against fire. Each step completes on its own when you have done it, and the tool it wants pulses in the toolbar. Skip it at any time. Saves from before the tutorial existed skip it.

## Controls

| Key | Action |
| --- | --- |
| 1–9, 0 | Road, House, Farm, Woodcutter, Quarry, Storehouse, Well, Watchtower, Dike, Fishery |
| G / T / B / H | Granary, Trading Post, Barracks, Chapel |

The toolbar groups build tools into tabs (Settle, Gather, Produce, Store & Trade, Defend, Great Works). Hotkeys work from any tab and jump to the tool's tab. A dot marks the tab holding the active tool, and a tab is dimmed while everything in it is locked.
| U / X | Upgrade / Demolish tool |
| C | Cycle map overlays: Roads, Coverage, Traffic, off |
| Esc / right-click | Clear tool |
| Space | Pause |
| - / = | Slower / faster |
| WASD / arrows, drag | Pan |
| Wheel | Zoom |
| F | Fullscreen |

Drag with the Road or Upgrade tool to paint along a path. Roads only join where you drag them: each new road joins the hex before it. Start or end a drag on an existing road to branch from it or join into it. Roads that touch but were not drawn together stay separate, and villagers cannot cross between them. Drag back and forth over a patch to pave a plaza. A road tile next to three or more buildings (the hearth counts) is also paved as a plaza, and the buildings around it face onto it. A road placed with a single click joins neighboring road ends on its own.

## Layout

- `src/sim/`: pure simulation with no DOM. World state, road network, A* pathing, jobs,
  villagers, seasons, fire, and save serialization.
- `src/render/`: the canvas renderer, the ink pictograms in `icons.ts`, and the colors in `palette.ts`.
- `src/ui/`: the HUD, input, and keymap. All hotkeys live in `keymap.ts`.
- `src/platform.ts`: where the game meets its host. A desktop (Tauri) build replaces the
  save backend and the fullscreen call here.

## Threats

| Threat | When | What it does | Counter |
| --- | --- | --- | --- |
| Winter | Every winter | Farms lie fallow, and each occupied home burns 2 wood a day | Stockpile food and wood |
| Fire | Any time after the first season, worst in summer | Spreads between neighboring buildings | Wells douse fires within 2 hexes |
| Blight | Summer and autumn | A field stops producing, rots, and spreads to neighboring farms | Keep farms staffed; frost kills it |
| Flood | Spring, from year 2 | Marsh and marshy forest flood for a day (grass and other dry land stay dry, even beside water); roads there are cut and dirt roads may wash out | Dikes (built on or beside marsh or marshy forest) protect within 2 hexes; cobble roads survive |
| Wolves | Winter | Packs leave the forest and take villagers walking the roads | A manned watchtower drives them off within 3 hexes; warriors kill them |
| Raiders | From autumn of year 1, outside winter | Bands march in from beyond the map to plunder the nearest stockpile, or burn buildings if there is none; bands grow each year | Barracks warriors intercept them inside their patrol radius |

## Economy and military

- **Storage.** Every good except coin has a storage limit. The hearth holds a base amount (Hearth: 100 food, 100 wood, 60 stone, 40 iron; more at the Longhouse and the Moot Hall). Connected stores add room: a Storehouse adds a little of each, while a Granary (food), Woodshed (wood), Stone Yard (stone) and Ore Shed (iron) add a lot of one good. When a store is full, workers producing that good stand idle, and trade or loot that does not fit is turned away. Coin has no limit.
- **Trading Post and coin.** Every 4–7 days a caravan stops at a connected trading post and stays for 2 days. You buy and sell goods in lots of 10 for coin. Prices change from caravan to caravan, and every lot you buy or sell moves the price against you. Coin pays for the barracks upgrade.
- **Workshops: planks and tools.** Two crafted goods, each one step from a raw one. A **Sawmill** (Village level, 2 workers) saws 2 wood into a plank every 10s. A **Smithy** (Town level, 1 worker) forges a tool from 1 iron and 1 wood every 20s. Porters keep each workshop stocked with its materials, right after pantries, and a workshop with nothing to work stands idle "waiting for wood". Planks go into the finer upgrades: the Townhouse, the Garrison, the Lumber yard and the Cathedral nave. Tools go to workplaces: porters keep 2 at every producing building, it works 25% faster while it has any, and each worker wears one out every 3 days. The hearth and storehouses hold some of each, and caravans trade planks (not tools).
- **Barracks.** Each barracks invites warriors to the hearth, one every 15s, each costing 10 food to equip, until it has its full number. Warriors walk by road to their post and fight any monster inside the patrol radius. They can die, and the barracks replaces them. Every warrior eats 1 food a day. Upgrading to a Garrison (which costs coin and planks) raises the number of warriors from 2 to 3, turns Militia into Men-at-arms (health 14→24, damage 3→5 per second), and widens the patrol radius from 4 to 5. More barracks means more warriors.

## Upgrades are supplied

An upgrade doesn't take its cost out of the stores all at once. Clicking a building with the Upgrade tool **orders** the next tier. Coin is paid when you order, since nobody carries it. Everything else is delivered by porters, one load at a time. The tier changes the moment the last supply arrives, and the building keeps working while it waits. A gold arrow and a supply meter mark a building with an order, and the inspector shows progress ("6 / 15 wood").

- Supply errands rank below pantries and above tidying goods into dedicated stores.
- Supplies are never taken below 3 days of what people eat (and, from autumn, burn), so a burst of orders can't leave homes short.
- Click a building with an order to cancel it. Delivered supplies go back to the nearest stores and the coin is refunded.
- Supplies waiting in a building are lost if it burns down or is demolished.

## Upgrade prerequisites

Some upgrades need another building nearby. Prerequisites are set per tier with `needs` in `src/sim/buildings.ts`.

| Upgrade | Needs | Supplies |
| --- | --- | --- |
| Field → Irrigated field | A connected well within 2 hexes | 10 wood, 10 stone |

When you hover with the Upgrade tool, the map shows where qualifying buildings reach.

## Homes improve themselves

Houses aren't upgraded by hand. Each day a house checks its surroundings. When its next tier's needs are all met, it orders that tier itself and porters supply it. When the needs of the tier it's at go unmet for 2 days in a row, it falls back one tier, and residents it can no longer hold move out to find another home. Hover a house to see what its next tier needs.

| Tier | Houses | Needs | Supplies |
| --- | --- | --- | --- |
| Hut | 3 | A road to the hearth | (built: 10 wood) |
| Cottage | 5 | Village level; a connected well within 2 hexes; every resident fed from the pantry today | 15 wood, 10 stone |
| Townhouse | 7 | Town level; the Cottage's needs; a staffed **Chapel** within 3 hexes; a storehouse or Trading Post within 4 | 10 wood, 8 planks, 20 stone, 5 iron |

The **Chapel** (Village level, key H, 30 wood and 20 stone) takes one priest.

## Settlement levels

The hearth is the settlement's progression track. Use the Upgrade tool on it once you have the people, and porters will supply it. Each level houses more villagers and unlocks new buildings and upgrades. The top bar shows your settlement's name, with an ↑ when the hearth can be raised.

| Level | Hearth becomes | Needs | Unlocks |
| --- | --- | --- | --- |
| Hamlet | Hearth | (start) | Road, house, farm, woodcutter, quarry, well, watchtower, dike, barracks |
| Village | Longhouse | 8 villagers, 40 wood, 20 stone | Storehouse, Trading Post, Chapel, Sawmill, Irrigated field, Cottage, Cobble road, Lumber camp, Deep quarry |
| Town | Moot Hall | 16 villagers, 60 wood, 50 stone, 30 coin | Granary, Stone granary, Garrison, Townhouse, Smithy |

Requirements are data: a building's `level`, and a tier's `level`, `pop` and `needs`, in `src/sim/buildings.ts`.

## Expanding and winning

**Biomes.** Most land is grass, forest, hills, marsh and water. A few rarer terrains change how a spot plays. Each covers only a few percent of the land. Hover a hex to see its traits.

| Terrain | Where | What it changes |
| --- | --- | --- |
| Marshy forest | Forest on the edge of water or marsh | Worked by woodcutters like any forest, but floods in spring. Leaves marsh when cut down |
| Rocky highland | The tops of the hills | 200 stone to quarry (hills hold 120), and one extra iron vein per map. Leaves heath when worked out |
| Meadow | Patches of open grassland | Farms yield 25% more. In summer, buildings there catch fire, and fire spreads to them, twice as readily |
| Heath | Patches of poor ground | Farms yield 40% less. Buildings placed there cost 25% less wood and stone |

**The land runs out.** Each forest hex holds 100 wood, each hill 120 stone, and each iron vein 80 iron. Woodcutters, quarries and mines draw from what they touch. Forests thin to stumps and then clear to grass, which is new farmland. Hills are quarried flat. Veins close. When its source runs out, a producer stands idle and says why, so production keeps moving outward.

**Discoveries in the fog.** Each map has special sites at least 6 hexes from the hearth. Hover one for details.

| Site | What it gives |
| --- | --- |
| Old ruins | A cache of coin and stone, once a connected road reaches them |
| Abandoned homestead | 2–3 survivors join you, once a connected road reaches it |
| Iron vein | Build a **Mine** (Village level) on or beside it to dig **iron**. One vein is always within 10 hexes |
| Fertile valley | Farms built here yield 50% more |

Iron pays for the Garrison and the Cathedral. Caravans sometimes sell a little.

**Winning: the Town Charter.** Meet all three terms and the Crown charters your town. You can keep playing afterwards.

1. Raise the hearth to the Moot Hall (Town).
2. Grow to 30 folk.
3. Complete the **Cathedral** (Town level): Foundations (40 wood, 60 stone), then the Nave (30 wood, 20 planks, 80 stone, 20 iron, 50 coin), then the Spire (100 stone, 40 iron, 100 coin), each stage ordered with the Upgrade tool and supplied by porters.

The top bar's **Charter** stat shows your progress. Hover it for the checklist.

## Gathering

Woodcutters, quarries, fisheries and mines work **every** tile of their material that they sit on or touch: forest, hills, water and iron veins. Each tile beyond the first adds 20% to the yield, up to double, and each work cycle draws evenly from all of them. A woodcutter can stand inside a forest, so its own tile counts too. While you're placing one, the tiles it would work are ringed on the map, and the inspector shows the bonus and how much is left.

**Fishery** (Gather tab, key 0; Fishing fleet at Village level). Build it on a shore tile. It is slower than farming: 1 food every 14s (1.5 for a fleet) against a field's 2 every 12s. Even a fishery ringed by water feeds fewer people over a year than one lone field. Each water tile holds 40 fish and restocks 3 a day, so a fishery worked at a moderate pace can run indefinitely. Catches halve in winter. Water that's been fished out stays water and recovers.

## Logistics

Goods physically sit in buildings, and people carry them around.

- **Stores** hold the settlement's stock, each up to its own limit. The hearth holds a base amount of every good and gets more room as it is raised. A storehouse holds a little of everything. A granary, woodshed, stone yard and ore shed each hold a lot of one good. The top bar totals what all connected stores hold.
- **Workers** carry what they make to the nearest hearth or storehouse with room. They never take it to a dedicated store, and they stand idle when there is no room left.
- **Porters** are jobs at the hearth (1, or 2 once it is raised) and at each storehouse (2). Villagers without a job help too. Their errands, in order:
  1. Keep **pantries** stocked: three days of food in each house and barracks, and from autumn, a day and a half of firewood in each house. People eat and keep warm from their own home's pantry. The hearth counts as a home: it keeps back what its residents need, and porters restock it from other stores when it runs low.
  2. **Supply upgrades** under way, one load at a time, leaving 3 days of upkeep in the stores.
  3. **Tidy goods** from the hearth and storehouses into dedicated stores. Granaries are only ever filled this way.
- Porter posts are filled after producing jobs. If nobody at all is free to haul, one worker is reassigned to portering.
- **Losing a store loses its goods.** Raiders carry off a share of what the building they hit actually holds, and a store that burns loses its stock. Building costs come out of the stores nearest the site.

Hover any store or home to see what it holds. Stores also show a small fill meter on the map.
