// Laat de computer tegen zichzelf spelen op alle levels, om fouten en balans te controleren.
import { LEVELS, createGame, endTurn } from '../www/js/game.js';
import { aiTurn } from '../www/js/ai.js';
import { mulberry32 } from '../www/js/hex.js';

let wins = 0, losses = 0, stuck = 0;
const turns = [];
for (const level of LEVELS) {
  const game = createGame(level);
  // De "speler" wordt ook door de AI gespeeld, met gemiddelde vaardigheid.
  Object.assign(game.players[0], { skill: 0.7, incomeMult: 1 });
  const rng = mulberry32(level.seed);
  let guard = 0;
  while (!game.winner && game.turn <= 120 && guard++ < 2000) {
    for (const _ of aiTurn(game, game.current, rng)) { /* stap */ }
    if (game.winner) break;
    endTurn(game);
  }
  if (game.winner === 'win') wins++; else if (game.winner === 'lose') losses++; else stuck++;
  turns.push(game.turn);
  console.log(`level ${String(level.id).padStart(2)}  tegenstanders ${level.opponents}  uitslag ${String(game.winner).padEnd(5)}  beurten ${game.turn}  (par ${level.par})`);
}
console.log(`\nSpeler-AI won ${wins}, verloor ${losses}, onbeslist ${stuck}. Gem. beurten ${Math.round(turns.reduce((a, b) => a + b) / turns.length)}`);
if (stuck > LEVELS.length / 3) { console.error('Te veel spellen zonder winnaar.'); process.exit(1); }
