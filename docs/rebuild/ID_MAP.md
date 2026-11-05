# Internal id → player-facing name

Internal ids are stable on purpose. They are in saves, the server database, the wire protocol, stored replays and analytics. Renaming one needs a save migration and a `PROTOCOL_VERSION` bump. Change the name the player sees in `src/gameplay/data/*.json` instead.

| Kind | Internal id | Kagemura name |
|---|---|---|
| Hall | `elder_toadstool` | Clan Keep |
| Collector (gold) | `acorn_orchard` | Coin Mint |
| Collector (elixir) | `dewdrop_well` | Terraced Farm |
| Storage (gold) | `acorn_silo` | Treasury |
| Storage (elixir) | `dew_cistern` | Provision Storehouse |
| Builder hut | `beaver_lodge` | Artisan's Hut (builder = Village Artisan) |
| Barracks + research | `burrow_barracks` | Training Dojo (its research panel = scroll research) |
| Army camp | `army_camp` | Squad Courtyard |
| Basic ranged defense | `acorn_cannon` | Kunai Tower |
| Splash defense | `pinecone_catapult` | Firework Mortar |
| Air + ground defense | `wasp_nest` | Shuriken Tower |
| Anti-air | `firefly_tower` | Sky Bow Tower |
| Wall | `bramble_hedge` | Stone Wall (iron-banded at higher levels) |
| Traps | `thorn_snare`, `sap_puddle` | Spike Pit, Caltrop Field |
| Clan building | `grove_lodge` | Alliance Lodge |
| Decor | `flower_bed`, `lantern_post`, `mushroom_ring`, `mossy_statue` | Bonsai Planter, Stone Lantern, Rock Garden, Stone Sentinel Statue |
| Obstacles | `obstacle_bush`, `obstacle_stump`, `obstacle_rock` | Bamboo Thicket, Fallen Cedar, Mountain Boulder |
| Currencies | `acorns`, `dew`, `nightsap`, `moonstones` | Coins, Provisions, Shadow Ink (unused until Keep 7), Jade (premium) |
| Trophies / leagues | `trophies`; `sprout`, `fern`, `oak`, `elder` | Honor; Bamboo, Cedar, Iron, Obsidian League |
| Troops | `hedgehog_roller`, `frog_lobber`, `beetle_brute`, `owl_bomber`, `mole_digger`, `saboteur` | Shinobi, Kunai Adept, Armored Guardian, Kite Raider, Tunnel Runner, Saboteur (new) |
| Ability | `smoke_bomb` (in `Deployment.troop`) | Smoke Bomb |
| Social | `grove`, Grove Raid | Alliance, Alliance War |
| Season pass | Lantern Pass | Season Scroll |
| Server name | `toadstool-kingdoms` (`/v1/hello`) | kept; clients check it |
| App / bundle id | `com.toadstoolkingdoms.app` | display name is "Kagemura"; change the id only when you create the new store listings |

There is no separate research building today. Research happens in the Training Dojo. A **Scroll Library** building is planned for Keep 7 in the progression catalog.
