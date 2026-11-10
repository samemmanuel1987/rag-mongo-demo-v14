import { spawn } from 'child_process';

function runCmd(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

async function checkVersion(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function main() {
  console.log('🔍 Detecting Python and pip environment...');
  
  const pythonCmds = ['python', 'python3', 'py'];
  let chosenPython = null;
  
  for (const py of pythonCmds) {
    if (await checkVersion(py)) {
      chosenPython = py;
      break;
    }
  }
  
  if (!chosenPython) {
    console.error('❌ Error: Python was not found in your system PATH.');
    console.error('Please install Python (v3.9+) and ensure it is added to your PATH.');
    process.exit(1);
  }
  
  console.log(`✓ Found Python launcher: ${chosenPython}`);
  console.log('📦 Installing python dependencies from requirements.txt...');
  
  const success = await runCmd(chosenPython, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
  if (success) {
    console.log('✅ Python dependencies installed successfully!');
  } else {
    console.error('❌ Error: Failed to install Python dependencies.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
