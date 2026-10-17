// Read-only archive audit. The temporary constraint is confined to this process.
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine');
const M = require('../messages');
const H = require('../hypotheses');
const T = require('../timeline');
const input = process.argv[2] || 'C:/Users/87736/Downloads/长夜消息存档 (19).json';
const output = path.resolve(__dirname, '../artifacts/archive19-coin-audit.json');
const archive = JSON.parse(fs.readFileSync(input, 'utf8'));
const built = M.build(archive.base, archive.messages);
const config = built.model.config;
if (config.size !== 9) throw new Error('This audit expects the archive 19 nine-cell map.');
const zero = E.replay(built.views[0].model.segments[0], 9).observations;
const originalBounds = T.coinBounds;
const results = [];
const arrival = (observations, step) => observations.find(o => o.kind === 'action' && o.arrival && o.clock?.player === 1 && o.clock.round === 1 && o.clock.step === step);

for (const step of [13, 14, 17, 18]) for (const row of [0, 2]) {
  const result = {step, half: row === 0 ? 'upper' : 'lower', coinCell: [row + 1, 2]};
  // Require a first arrival at this exact coin cell. Missing actions in an
  // unfinished portal branch remain unknown, rather than being rejected.
  T.coinBounds = (cfg, domains, observations) => {
    const base = originalBounds(cfg, domains, observations);
    if (!base.valid) return base;
    const o = arrival(observations, step);
    if (!o) return base;
    const domain = domains.find(d => d.length && E.mod(o.r - d[0].origin.r, 9) < 3 && E.mod(o.c - d[0].origin.c, 9) < 3);
    if (domain) {
      const i = E.mod(o.r - domain[0].origin.r, 9) * 3 + E.mod(o.c - domain[0].origin.c, 9);
      if (i !== row * 3 + 1 || !domain.some(m => m.id === '49' && m.block.cells[i].attach === 'COIN')) return {valid: false, reason: 'coinHalf'};
    }
    if (observations.some(a => a.kind === 'action' && a.arrival && a.clock?.round === 1 && (a.clock.player === 0 || a.clock.player === 1 && a.clock.step < step) && a.r === o.r && a.c === o.c)) return {valid: false, reason: 'alreadyCollected'};
    return base;
  };
  try {
    E.setDeadline(Date.now() + 50000);
    const h = H.analyze({...config, witnessFirst: false}, archive.base, archive.messages, 1, built.self, 20000);
    result.search = h.search;
    result.walking = h.groundOnly.status;
    const alternatives = h.groups.flatMap(g => g.alternatives || []);
    result.routeCount = alternatives.length;
    result.coinRouteCount = alternatives.filter(a => !a.pending && arrival(a.observations, step)).length;
    let pending = h.truncated || alternatives.some(a => a.pending);
    let checks = 0;
    for (const alternative of alternatives) {
      if (alternative.pending) continue;
      const o = arrival(alternative.observations, step);
      if (!o) continue;
      const anchor = {id: '49', r: E.mod(o.r - row, 9), c: E.mod(o.c - 1, 9)};
      for (let dr = 0; dr < 9 && !result.witness; dr++) for (let dc = 0; dc < 9 && !result.witness; dc++) {
        const shift = o => ({...o, r: E.mod(o.r + dr, 9), c: E.mod(o.c + dc, 9)});
        const observations = alternative.observations.concat(zero.map(shift));
        const cfg = {...config, births: [{player: 1, r: 4, c: 4}, {player: 0, r: E.mod(4 + dr, 9), c: E.mod(4 + dc, 9)}]};
        const solution = E.solveMap(cfg, observations, [anchor]);
        const proof = E.verifyCompleteLayout(cfg, solution, observations, 200000);
        checks++;
        if (proof.status === 'unknown') pending = true;
        if (step === 14 && proof.status === 'impossible' && !result.withoutBirthWitness) {
          const relaxed = E.verifyCompleteLayout({...cfg, births: []}, solution, observations, 200000);
          if (relaxed.status === 'verified') result.withoutBirthWitness = {
            zeroOffset: [dr, dc], layout: relaxed.layout,
            birthCheck: E.birthLayoutCheck(cfg, relaxed.layout, cfg.births),
            oneBirthBlock: relaxed.layout.find(m => E.mod(4 - m.origin.r, 9) < 3 && E.mod(4 - m.origin.c, 9) < 3)?.id
          };
        }
        if (proof.status === 'verified') {
          const route = observations.filter(a => a.kind === 'action' && a.clock.player === 1).map(a => {
            const block = proof.layout.find(m => E.mod(a.r - m.origin.r, 9) < 3 && E.mod(a.c - m.origin.c, 9) < 3);
            const lr = E.mod(a.r - block.origin.r, 9), lc = E.mod(a.c - block.origin.c, 9);
            return {step: a.clock.step, arrival: a.arrival, block: block.id, cell: [lr + 1, lc + 1], attach: E.byId.get(block.id).cells[lr * 3 + lc].attach};
          });
          result.witness = {zeroOffset: [dr, dc], layout: proof.layout, births: cfg.births, teleports: alternative.teleports, route, observations};
        }
      }
      if (result.witness) break;
    }
    result.jointChecks = checks;
    result.status = result.witness ? 'possible' : pending ? 'unknown' : 'impossible';
  } catch (error) {
    if (error.code !== 'INFERENCE_TIMEOUT') throw error;
    result.status = 'unknown';
    result.reason = 'time limit';
  } finally {
    E.setDeadline();
    T.coinBounds = originalBounds;
  }
  results.push(result);
  fs.writeFileSync(output, JSON.stringify({input, results}, null, 2));
  console.log(JSON.stringify({...result, witness: result.witness ? {layout: result.witness.layout, teleports: result.witness.teleports} : undefined}));
}
console.log('Saved ' + output);
