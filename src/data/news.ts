/**
 * The "What's new" board: one entry per notable feature release, newest first. A returning player
 * sees the entries they haven't read in a card right after joining, and Settings re-opens the whole
 * board. Feature additions only: no balance tweaks, bug fixes or small adjustments.
 *
 * Adding an entry (see "What's new board" in CLAUDE.md):
 * - Put it at the top with `id` one higher than the current top entry. Ids are never reused or
 *   renumbered: the browser remembers the highest id it has shown (`src/game/news.ts`).
 * - Write for players, in the words the game uses on screen. Body paragraphs may hold simple HTML
 *   (`<b>`, `<kbd>`); only this file goes in, so nothing is escaped.
 * - A photo is optional, for the big releases: a 16:9 JPEG of about 1280x720 and under 200 KB in
 *   `src/assets/images/news/`, imported here so Vite bundles it.
 *
 * Example:
 *   import delve from '../assets/images/news/delve.jpg';
 *   { id: 1, date: '2026-11-20', title: 'The Delve', image: delve, alt: 'Diving below the pond',
 *     body: ['Past level 30, ...', 'Ask <b>Captain Reed</b> at the harbour to ...'] },
 */
import abyssGear from '../assets/images/news/abyss-gear.jpg';
import anglersRest from '../assets/images/news/anglers-rest.jpg';
import charterChart from '../assets/images/news/charter-chart.jpg';
import charterHold from '../assets/images/news/charter-hold.jpg';
import charterLures from '../assets/images/news/charter-lures.jpg';
import deepSea from '../assets/images/news/deep-sea.jpg';
import harbour from '../assets/images/news/harbour.jpg';
import phones from '../assets/images/news/phones.jpg';
import deepSeaRod from '../assets/images/news/deep-sea-rod.jpg';
import emotes from '../assets/images/news/emotes.jpg';
import fightLeft from '../assets/images/news/fight-left.jpg';
import reelFight from '../assets/images/news/reel-fight.jpg';
import seaWeather from '../assets/images/news/sea-weather.jpg';
import zoneSets from '../assets/images/news/zone-sets.jpg';

export interface NewsEntry {
  /** Release number: unique, and higher than every entry below it. */
  id: number;
  /** Release day, YYYY-MM-DD. */
  date: string;
  title: string;
  /** Paragraphs, HTML allowed. Two or three short ones. */
  body: string[];
  /** A bundled image URL (an `import` from `src/assets/images/news/`). */
  image?: string;
  /** What the image shows, for screen readers. Required with `image`. */
  alt?: string;
}

export const NEWS: NewsEntry[] = [
  {
    id: 16,
    date: '2026-11-18',
    title: "Anglers' Rest",
    image: anglersRest,
    alt: "Night at Anglers' Rest: six anglers sit on logs round the great fire playing a washboard, whistle, squeezebox, drum, banjo and jug, under strings of lights, with Bram's Kettle behind the fire and the Deep Sea and Lake Legends boards on either side, each with its record fish mounted above it",
    body: [
      "The campfire on the east headland is now <b>Anglers' Rest</b>: a great fire under a crown of lights, with seats all round it. Press <kbd>E</kbd> at any log, wall seat or bench to sit down. Each log by the fire has an instrument beside it: sit there and you play it, and everyone nearby hears the band.",
      "<b>Top Anglers</b> is now two boards by the fire: <b>Lake Legends</b> for your best lake catch and <b>Deep Sea</b> for your best charter catch. The fish to beat hangs over each, with its angler's name.",
      "Down the steps on <b>Skipper's Beach</b>, hold <kbd>E</kbd> at the stone pile and let go on the mark to skip a stone; the day's best goes on the sign. <b>Bram Tinder</b> keeps the fire and sells rockets at <b>Bram's Kettle</b>: light one at the rack on the jetty's end and the whole lake looks up.",
    ],
  },
  {
    id: 15,
    date: '2026-11-16',
    title: 'Emotes',
    image: emotes,
    alt: 'Three anglers on the pier, seen from behind the nearest one: she waves a mittened hand, one of the two facing her waves back and the other claps over his head with a burst of sparkles',
    body: [
      'Say it without typing: hold <kbd>F</kbd> for the <b>emote wheel</b>, move the mouse to an emote and let go to play it. On a phone or tablet, hold the 👋 button and drag to one, or tap 👋 and tap one.',
      'Every angler has four: <b>Wave</b>, <b>Nice!</b>, <b>Yes</b> and <b>No</b>. While one plays, your view pulls back so you see yourself, and everyone nearby sees it too. A step, a jump or a cast ends it.',
      "<b>Captain Reed</b> on the west beach sells a deep sea emote for <b>Kelp Deep</b>, <b>the Twilight</b> and <b>the Abyss</b>, at the end of each zone's row in his <b>Wardrobe</b> tab. Own the zone's whole set to unlock its emote (in the Abyss, all three legends' sets with their pets), then buy it for coins and Black Pearls. What it does is a surprise until you play it. Own all three and there's one more: <b>Master of the Deep</b>.",
    ],
  },
  {
    id: 14,
    date: '2026-11-15',
    title: 'An anchor for the Lord of the Deep',
    body: [
      'Reach <b>level 150</b> and become <b>Lord of the Deep</b>, the top rank, and an aurora anchor appears before your name, for every angler to see.',
      'It shows on your name tag over your head, on your chat lines and in the 👥 Anglers list, and it stays whichever title you wear.',
    ],
  },
  {
    id: 13,
    date: '2026-11-15',
    title: 'Lakeside on phones and tablets',
    image: phones,
    alt: 'Lakeside on a phone held sideways: two players fishing off the pier at sunset, a chat line at the top, the hotbar at the bottom and the big gold Cast button in the corner',
    body: [
      "Lakeside now plays on <b>phones and tablets</b>: open the game and turn your phone sideways. Push the left thumbstick to walk, drag to look around, and hold the big gold button to cast and reel.",
      "Tap 💬 to chat with Lakeside's own keyboard, which leaves the lake in view (🌐 switches to your phone's keyboard for emoji). Tap 🎒 for your bag; menus fill the screen, and a tap on an item tries it on and shows what it is. Hold a hotbar slot to drop it.",
      "Your account works on every device: set a password in ⚙️ Settings to play as you on your phone too.",
    ],
  },
  {
    id: 12,
    date: '2026-11-15',
    title: 'Sets for Kelp Deep and the Twilight',
    image: zoneSets,
    alt: 'Two players on the pier at night: one in the Kelp Deep set, kelp blades rising off a woven cap with floats at their tips and a wrap of golden and olive kelp; one in the Twilight set, a crown of glowing tendrils and a lavender tunic veined with light, little glowing jellies circling and rising round them',
    body: [
      "<b>Kelp Deep</b> and <b>the Twilight</b> each have a set of their own at <b>Captain Reed</b>'s: a hat, a shirt and a piece of jewelry. Kelp Deep's is flowing kelp that floats up round you; the Twilight's is a crown of glowing tendrils, a tunic veined with light and little glowing jellies that drift round you.",
      "Every fish you land in a zone counts toward its set, and the fish you've already landed there count too. In Kelp Deep the <b>Kelp Cap</b> unlocks at 40 fish, the <b>Kelp Wrap</b> at 90 and the <b>Holdfast Pendant</b> at 150. In the Twilight the <b>Anemone Crown</b> unlocks at 100, the <b>Drift Tunic</b> at 300 and the <b>Jelly Locket</b> at 550.",
      "Reed sells each piece once it's unlocked, in the <b>Wardrobe</b> tab of his menu, where a bar shows how far you've come in each zone.",
    ],
  },
  {
    id: 11,
    date: '2026-11-14',
    title: 'Legend gear from the Abyss',
    image: abyssGear,
    alt: "Three players on the pier: one in the Kraken's gear, a crimson shell with tentacles and water spiralling round it; one with the Leviathan coiled round them and its fanged jaw on their head; one in the Dreamer's nightcap and starry robe, standing on a little cloud; a pink Kraken Hatchling and a little Leviathan float beside them",
    body: [
      "Land a legend in <b>the Abyss</b> and <b>Captain Reed</b> can make you something from it. Each of its three legends has a set: <b>the Kraken</b>'s crown, armor and beak, <b>the Leviathan</b>'s jaw, coil and fangs, and <b>the Drowned Dreamer</b>'s nightcap, robe and dreamcatcher.",
      "Your first landing of a legend unlocks its hat, the second its shirt, the third its jewelry, and the fourth its pet, which floats after you wherever you go: the <b>Kraken Hatchling</b>, the <b>Leviathan Wyrmling</b> or the <b>Sleepy Dreamer</b>. Find unlocked pieces in the new <b>Wardrobe</b> tab of Reed's menu, try them on, and buy them there. They don't come cheap: a hat is 3,000,000 coins. Wear them from your own Wardrobe (<kbd>Tab</kbd>) too, where pets have a row of their own.",
      "They're the first <b>Abyssal</b> pieces, a new rarity above Legendary that only comes from the Abyss. Landings count from today on.",
    ],
  },
  {
    id: 10,
    date: '2026-11-14',
    title: 'Charters fill a hold',
    image: charterHold,
    alt: "Captain Reed's chart: each zone card shows what a fish pays and the fee, and under the Deep Sea Rod a new row reads Hold, 20 fish, next 25 fish a charter, on sale when the Twilight opens; the Cast off button says 20 fish, fee 7,000 coins",
    body: [
      "Charters no longer run on a spool of line. Each charter fills <b>the hold</b>: land that many fish and the boat heads home. A fish that gets away takes no room, so a hard zone costs you time, not fish. <b>Captain Reed</b> charges a small fee from <b>the Drop-off</b> on; the Shelf stays free.",
      "The hold starts at 10 fish. Reed sells a bigger one as each zone opens, five fish more each time, up to 30 in <b>the Abyss</b>. Find it on his chart under the Deep Sea Rod.",
      "Further out now pays clearly more: from the Drop-off on, a zone's fish are worth about twice the zone before, and the rod's steps and Abyss levels cost more to match. Steps you've already bought are yours.",
    ],
  },
  {
    id: 9,
    date: '2026-11-14',
    title: 'Shiny Lures at sea',
    image: charterLures,
    alt: "Captain Reed's chart with Kelp Deep picked: under the next boat part's bar a line reads about 5 charters to the Deep lamps, about 2 with Shiny Lures, and a new row shows 46 Shiny Lures with a switch set to On",
    body: [
      "A shiny sea fish now pays five times the <b>Black Pearls</b> as well as five times the coins. A <b>Shiny Lure</b> from the casino's <b>Prize Counter</b> works on a charter as it does at the lake: every bite is a shiny until the lures run out.",
      "<b>Captain Reed's</b> chart now says how many charters away your next <b>boat part</b> is, and how many with Shiny Lures, and shows the lures you hold with a switch to save them for later. At the Prize Counter you can buy 30 casts at once, and <b>Turn in all</b> trades every fish in your hotbar for chips in one press.",
      "From <b>Kelp Deep</b> on, the way out is longer: the <b>Deep lamps</b> and the <b>Iron keel</b> take more Black Pearls and the Deep Sea Rod's last four steps cost more coins. What you've already bought is yours. Fishing the lake for chips and bringing lures to sea is the quick way there.",
    ],
  },
  {
    id: 8,
    date: '2026-11-13',
    title: 'A fresh start at sea',
    body: [
      "With the charters rebuilt, everyone's sea progress starts over, so the climb from <b>the Shelf</b> to <b>the Abyss</b> is the same for every angler. Your <b>Deep Sea Rod</b>'s steps and Abyss levels, your <b>boat parts</b>, your <b>Black Pearls</b> and your furthest Abyss marker are back to the start, and the sea fish are out of your Fishdex, ready to catch again. The <b>Furthest Out</b> board starts fresh too.",
      "You keep the Deep Sea Rod itself, your coins and everything at the pond. If your best catch was a sea fish, <b>Top Anglers</b> now shows your best pond fish. See <b>Captain Reed</b> on the west beach to cast off again: the first boat part comes quickly.",
    ],
  },
  {
    id: 7,
    date: '2026-11-13',
    title: 'Charters rebuilt: line, zones and the boat',
    image: charterChart,
    alt: "Captain Reed's chart: a card for each of the five zones from the Shelf to the Abyss with its rating for your rod, what a fish pays and the price of a spool, Kelp Deep picked and the Twilight and the Abyss locked; under it the Deep Sea Rod at step 3 of 8, the next boat part's bar of Black Pearls, and a Cast off to Kelp Deep button",
    body: [
      "Deep sea charters work a new way. <b>Captain Reed</b> on the west beach now sells the <b>Deep Sea Rod</b> himself (from level 20), and his chart shows the five zones: how each one rates for your rod, from <b>Easy</b> to <b>Too much</b>, what a fish pays there and what a spool costs. Pick a zone and <b>Cast off</b>.",
      "A charter runs on one <b>spool</b> of line: free on <b>the Shelf</b>, bought with coins further out. Every fish you hook uses a few metres, fewer the better your rod is for the zone, and one that gets away takes 25 m more. When the spool's out, buy another or <b>Head home</b>. Fish sell as they land, and nothing you've earned is ever lost.",
      "Coins upgrade the Deep Sea Rod, two steps for each zone past the Shelf. <b>Black Pearls</b> fill the bar for your next <b>boat part</b>, and each part opens the next zone. Only <b>the Abyss</b> has <b>markers</b> now: every third fish takes you one further out, where the fish fight harder and pay more.",
    ],
  },
  {
    id: 6,
    date: '2026-11-10',
    title: 'Weather on the charters',
    image: seaWeather,
    alt: "Captain Reed's blue charter boat, the Pelican, on the Shelf at dusk: a red-and-white marker buoy with a lit lamp rides the swell beside it, gulls wheel overhead and the lighthouse stands on the far headland under a pink sky",
    body: [
      "The open sea has had a makeover. <b>Captain Reed's</b> boat has a name on her bows, a proper bridge with Reed at the wheel, a mast with running lights and a deck full of gear, and after dark her windows and lamps glow on the water. Overhead there's a moon with its path on the sea, brighter stars and banks of cloud on the horizon.",
      "Every zone now looks like its own place. <b>The Shelf</b> is blue to a clear horizon, with gulls wheeling round the boat. Past <b>the Drop-off</b> the rain starts: <b>Kelp Deep</b> has rafts of golden kelp drifting by over the dark forest below, <b>the Twilight</b> is a standing dusk of rose and violet, and <b>the Abyss</b> is dark by day, with the boat's lamps lit against the storm.",
      "At each <b>marker</b>, look to starboard: a red-and-white buoy with a flashing lamp comes alongside while you choose to <b>Head home</b> or <b>Sail on</b>.",
    ],
  },
  {
    id: 5,
    date: '2026-11-10',
    title: 'The harbour',
    image: harbour,
    alt: "Looking back at the harbour from the pier by day: the quay across the cove, Top Anglers and the Thanks board on the deck, the Smokehouse and Marlow's striped stall behind a cobbled quay road, and the main street up through the trees to the gate",
    body: [
      "The lakeside has a new shape. The town now wraps a small cove: a timber <b>quay</b> runs across the back of it, the pier runs out from the quay's middle to the T end, and a short <b>jetty</b> either side of the pier gives two more spots to cast from. Out past the T end, a rock islet with a tree and a lantern marks the open lake.",
      "Everything you know is along the waterfront. <b>Marlow's stall</b> and the <b>Smokehouse</b> stand behind the quay facing the water, <b>Top Anglers</b> stands on the deck at the quay's east end, and the <b>wardrobe mirror</b> is at the quay's west corner by Reed's lane. The cottages stand close along the street with gardens, trees and grass between them. The well square up the main street is now a junction: lanes run round past the cottages, down to the campfire on the east headland and over to the worm patch.",
      "<b>Captain Reed's</b> corner is the quay's west end. His lane runs down past the worm patch and the <b>Furthest Out</b> board to his beach, and his seaplane floats in the cove in view from the pier. The messages in bottles have moved too: there are still seven to find.",
    ],
  },
  {
    id: 4,
    date: '2026-11-03',
    title: 'A new reel fight',
    image: reelFight,
    alt: 'Reeling in a Moonstone Salmon at the pond: the reel gauge mid-surge, its black pull mark at the edge of the red, the needle in the blue, and the words RIDE HIGHER, in the blue it takes line',
    body: [
      "Every fish now fights you on two things: how <b>strong</b> it is for your <b>line</b> and how <b>heavy</b> it is for your <b>rod</b>, and the reel gauge shows both. The black mark is how hard a surge pulls: the nearer the red, the stronger the fish for your line, and holding in the red frays it. Hold in the <b>green</b> to win line back. In the <b>blue</b> the fish takes line even while you hold, so ride higher.",
      "The <b>Hooked!</b> note says how a fish matches your gear: <b>Strong for your line</b> or <b>Heavy for your rod</b> one step over, <b>Too strong</b> or <b>Too heavy</b> from two, and <b>An easy one</b> once you've outgrown it. Lose one and the card says how it got away, <b>SNAP!</b> or <b>RAN OFF!</b>, and which line or rod to get next. Bait at <b>Marlow's stall</b> tells you the same before you buy.",
      "On charters, every fish that gets away costs 25 m of line, and one that was too much for your gear is noted in your <b>Fishdex</b>. The <b>Deep Sea Rod</b> and <b>Deep Sea Line</b> show from which marker sea fish get heavy or strong for them. The <b>Quick-Reel Gloves</b> from the Prize Counter now reel fish in faster.",
    ],
  },
  {
    id: 3,
    date: '2026-11-02',
    title: 'The Deep Sea Rod',
    image: deepSeaRod,
    alt: 'First person on a charter boat: a long navy Deep Sea Rod with brass loop guides and a big brass reel holds up a striped Squall Marlin over the open sea',
    body: [
      "Charters have their own gear now. Buy the <b>Deep Sea Rod</b> on the new <b>Sea gear</b> tab at <b>Marlow's stall</b> (from level 20, 100,000 coins), then find <b>Captain Reed</b> on the west beach. Every angler needs one to cast off, Aurora Rod or not.",
      "Reed keeps it on his boat and hands it to you as a charter casts off. Out at sea it's all you hold: your hotbar waits just as you left it until you head home. Its brass reel shows how much line you have left, and the badges in the corner show your rod's and line's levels. Land a big one and it hangs out over the water, bigger than ever.",
      "Black Pearl levels now go on the Deep Sea Rod, and any you put on the Aurora Rod carry over. The <b>Deep Sea Line</b> comes on the rod and is for charters only, so the Aurora Rod is the pond's top rod again. If the Deep Sea Line was on your rod, your pond line is now <b>Moonsilk Line</b>, free.",
    ],
  },
  {
    id: 2,
    date: '2026-11-01',
    title: 'Wear down the big ones',
    image: fightLeft,
    alt: "A charter fight at Marker 35 in the Drop-off: above the reel gauge a half-empty yellow FIGHT bar, and under it a tag reads Runner, long pulls that take line",
    body: [
      "Fish at sea now tire as you fight them. The <b>Fight</b> bar above the reel gauge shows how much fight a hooked fish has left.",
      "Keep your line tight through its surges to wear it down; the bar glows while it's tiring. As the bar runs low the fish pulls weaker, in shorter surges that come less often, and once it's empty the fish stops fighting: reel it in.",
      "A tag under the gauge shows how each fish fights and whether it's a strong one. When it turns red, that fish is too strong for your line and won't tire out of the red: the <b>Deep Sea Line</b> at <b>Marlow's stall</b> holds it.",
    ],
  },
  {
    id: 1,
    date: '2026-11-01',
    title: 'Charters to the deep sea',
    image: deepSea,
    alt: 'The Kraken, a giant crimson squid with a glowing golden eye, rearing its arms out of towering storm waves far out at sea',
    body: [
      "<b>Captain Reed</b>'s seaplane is flying again! Bring the <b>Aurora Rod</b> to his stand on the west beach and cast off on a charter to the open sea. Every 5 fish you land, you reach a marker: <b>Head home</b> with your haul of <b>Black Pearls</b>, or <b>Sail on</b> for a bigger one.",
      'The further out you sail, the stranger the fish: leafy seadragons in <b>Kelp Deep</b>, glowing anglers in <b>the Twilight</b>, and in <b>the Abyss</b>, things with far too many eyes. Every zone has its own legends, long, hard fights that are worth a fortune.',
      "Spend your Black Pearls at <b>Marlow's stall</b> to level up the Aurora Rod and the new <b>Deep Sea Line</b>. The rod makes your line last, and the line keeps strong fish from snapping it.",
    ],
  },
];
