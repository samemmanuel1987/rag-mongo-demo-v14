import { spawn } from 'child_process';

const args = ['llm-eval-providers/deepeval_server.py'];

async function checkVersion(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function main() {
  const cmds = ['python', 'python3', 'py'];
  let chosenCmd = null;

  for (const cmd of cmds) {
    if (await checkVersion(cmd)) {
      chosenCmd = cmd;
      break;
    }
  }

  if (!chosenCmd) {
    console.error('❌ Error: Python not found. Please install Python and ensure it is in your PATH.');
    process.exit(1);
  }

  console.log(`🚀 Starting Python server using ${chosenCmd}...`);
  const serverProc = spawn(chosenCmd, args, { stdio: 'inherit', shell: true });

  serverProc.on('close', (code) => {
    process.exit(code);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
