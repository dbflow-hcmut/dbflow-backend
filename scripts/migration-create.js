const { spawnSync } = require('child_process');

const arg = process.argv.find(a => a.startsWith('--name='));
const name = arg ? arg.split('=')[1] : `Migration_${Date.now()}`;
const target = `src/migrations/${name}`;

const result = spawnSync(
  './node_modules/.bin/ts-node',
  ['-r', 'tsconfig-paths/register', './node_modules/typeorm/cli.js', 'migration:create', target],
  { stdio: 'inherit', shell: false }
);

process.exit(result.status || 0);


