import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const cwd = process.cwd();
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const port = 8081;
const bundleId = 'org.reactjs.native.example.NitrowindExampleCli';

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', resolve));
}

function isPortOpen() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(300, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForMetro(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isPortOpen()) return;
    if (child.exitCode !== null) {
      throw new Error(`Metro exited with code ${child.exitCode}`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Metro did not become ready on port 8081 within 30 seconds');
}

const metroWasRunning = await isPortOpen();
const metro = metroWasRunning
  ? null
  : spawn(yarn, ['start'], { cwd, stdio: 'inherit' });
let ios = null;

function stopChildren() {
  ios?.kill('SIGINT');
  metro?.kill('SIGINT');
}

process.once('SIGINT', () => {
  stopChildren();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});

try {
  if (metro) await waitForMetro(metro);

  ios = spawn(
    yarn,
    ['react-native', 'run-ios', '--no-packager', ...process.argv.slice(2)],
    { cwd, stdio: 'inherit' },
  );
  const iosCode = await waitForExit(ios);
  ios = null;
  if (iosCode !== 0) {
    metro?.kill('SIGINT');
    process.exit(typeof iosCode === 'number' ? iosCode : 1);
  }

  // `run-ios` can report a simulator launch error while still exiting 0.
  // Launch once through simctl so this script only reports success when the
  // installed app actually has a process handle.
  const launch = spawn(
    'xcrun',
    [
      'simctl',
      'launch',
      '--terminate-running-process',
      'booted',
      bundleId,
    ],
    { cwd, stdio: 'inherit' },
  );
  const launchCode = await waitForExit(launch);
  if (launchCode !== 0) {
    metro?.kill('SIGINT');
    process.exit(typeof launchCode === 'number' ? launchCode : 1);
  }

  if (metro) {
    console.log('\nApp launched. Metro is running; press Ctrl+C to stop it.');
    const metroCode = await new Promise(resolve => metro.once('exit', resolve));
    process.exit(typeof metroCode === 'number' ? metroCode : 0);
  }
} catch (error) {
  stopChildren();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
