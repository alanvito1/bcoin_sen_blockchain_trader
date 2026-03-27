const readline = require('readline');
console.log('Hello from PKG!');

function waitExit() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question('\nPrecione ENTER para sair...', () => {
    rl.close();
    resolve();
  }));
}

async function run() {
  console.log('Testing wait exit...');
  await waitExit();
}

run();
