const REPO = '../../..';
const { defaultData: data, buildingDef } = await import(`${REPO}/src/gameplay/sim/data`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const layout = process.argv[2] ?? 'walled_keep'; const keep = Number(process.argv[3] ?? 12);
const L = G.LAYOUTS.find((l: any) => l.id === layout);
const g = G.generateOpponent(5000 + keep * 131, keep, data, { levelBias: 0.5, layout: L });
const hl = data.hall.levels[keep - 1].limits['bramble_hedge']; console.log('wall limit', JSON.stringify(hl));
const N = 44; const grid: string[][] = Array.from({ length: N }, () => Array(N).fill('.'));
let walls = 0;
for (const b of g.buildings) { const d: any = buildingDef(data, b.type); const w = d.size?.w ?? d.size ?? 1, h = d.size?.h ?? d.size ?? 1;
  const ch = d.category === 'wall' ? '#' : d.category === 'defense' ? 'D' : d.category === 'trap' ? 't' : b.type === 'elder_toadstool' ? 'K' : 'o';
  if (ch === '#') walls++;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (grid[b.y + y]?.[b.x + x] !== undefined) grid[b.y + y][b.x + x] = ch; }
console.log(layout, 'walls', walls, 'keys', Object.keys(g).join(','));
// flood fill from border over non-wall cells
const seen = Array.from({ length: N }, () => Array(N).fill(false)); const q: [number, number][] = [[0, 0]]; seen[0][0] = true;
while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[ny][nx] || grid[ny][nx] === '#') continue; seen[ny][nx] = true; q.push([nx, ny]); } }
let enclosed = 0, total = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ('DKo'.includes(grid[y][x])) { total++; if (!seen[y][x]) enclosed++; }
console.log('building cells walled off from outside:', enclosed, 'of', total);
console.log(grid.map((r) => r.join('')).filter((r) => /[^.]/.test(r)).join('\n'));
