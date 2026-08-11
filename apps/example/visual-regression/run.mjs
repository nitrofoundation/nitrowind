#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const baselines = join(here, 'baselines');
// Metro watches the whole example tree. Test artifacts must live outside it or
// each screenshot write can trigger the Refreshing overlay under test.
const artifacts = '/tmp/nitrowind-example-visual-regression';
const raw = join(artifacts, 'raw');
const configuredScenes = JSON.parse(
  readFileSync(join(here, 'scenes.json'), 'utf8'),
);
const command = process.argv[2] ?? 'test';
const requestedPlatform = process.argv[3] ?? 'all';
const requestedScene = process.argv[4];
const scenes = requestedScene
  ? configuredScenes.filter(scene => scene.name === requestedScene)
  : configuredScenes;
const platforms = requestedPlatform === 'all' ? ['ios', 'android'] : [requestedPlatform];
const app = {
  ios: 'org.reactjs.native.example.NitrowindExampleCli',
  android: 'com.nitrowindexamplecli',
};
const threshold = 0.0025;

if (requestedScene && scenes.length === 0) {
  throw new Error(`Unknown scene '${requestedScene}'.`);
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${bin} ${args.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function sleep(ms) {
  run('sleep', [String(ms / 1000)]);
}

function assertPlatform(platform) {
  if (!['ios', 'android'].includes(platform)) {
    throw new Error(`Unknown platform '${platform}'. Use ios, android, or all.`);
  }
  if (platform === 'ios') {
    const booted = run('xcrun', ['simctl', 'list', 'devices', 'booted'], {
      capture: true,
    });
    if (!booted.includes('(Booted)')) throw new Error('No booted iOS simulator.');
    run('xcrun', ['simctl', 'get_app_container', 'booted', app.ios, 'app'], {
      capture: true,
    });
  } else {
    const devices = run('adb', ['devices'], { capture: true });
    if (!/\tdevice\b/.test(devices)) throw new Error('No connected Android device.');
    const packagePath = run('adb', ['shell', 'pm', 'path', app.android], {
      capture: true,
    });
    if (!packagePath.startsWith('package:')) {
      throw new Error(`${app.android} is not installed on Android.`);
    }
  }
}

function setAppearance(platform, appearance) {
  if (platform === 'ios') {
    run('xcrun', ['simctl', 'ui', 'booted', 'appearance', appearance]);
  } else {
    run('adb', ['shell', 'cmd', 'uimode', 'night', appearance === 'dark' ? 'yes' : 'no']);
  }
}

function terminate(platform) {
  if (platform === 'ios') {
    run('xcrun', ['simctl', 'terminate', 'booted', app.ios], { allowFailure: true });
  } else {
    run('adb', ['shell', 'am', 'force-stop', app.android]);
  }
}

function open(platform, path) {
  const url = `nitrowind-example://${path}`;
  if (platform === 'ios') {
    run('xcrun', ['simctl', 'openurl', 'booted', url]);
  } else {
    run('adb', [
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      url,
      app.android,
    ]);
  }
}

function dimensions(path) {
  const value = run('magick', ['identify', '-format', '%w %h', path], {
    capture: true,
  });
  return value.split(' ').map(Number);
}

function rawScreenshot(platform, rawPath) {
  mkdirSync(raw, { recursive: true });
  if (platform === 'ios') {
    run('xcrun', ['simctl', 'io', 'booted', 'screenshot', rawPath], {
      capture: true,
    });
  } else {
    const png = execFileSync('adb', ['exec-out', 'screencap', '-p']);
    writeFileSync(rawPath, png);
  }
}

function hasPurpleHeader(path, cropped = false) {
  const [width, height] = dimensions(path);
  const x = Math.round(width * 0.1);
  // Raw screenshots include the status bar; normalized captures do not.
  const y = Math.round(height * (cropped ? 0.03 : 0.08));
  const [hue, saturation] = run(
    'magick',
    [
      path,
      '-crop',
      `1x1+${x}+${y}`,
      '+repage',
      '-colorspace',
      'HSL',
      '-format',
      '%[fx:r] %[fx:g]',
      'info:',
    ],
    { capture: true },
  )
    .split(' ')
    .map(Number);
  // The app header is #6d28d9 (hue ~= .732). Metro's Refreshing banner is
  // blue (hue ~= .585), which must never be accepted as a stable app frame.
  return hue > 0.69 && hue < 0.78 && saturation > 0.55;
}

function waitForReady(platform) {
  const probe = join(raw, `${platform}-readiness.png`);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    rawScreenshot(platform, probe);
    if (hasPurpleHeader(probe)) return;
    sleep(0.5);
  }
  throw new Error(`${platform} app did not become visually ready within 45 seconds.`);
}

function screenshot(platform, output) {
  mkdirSync(dirname(output), { recursive: true });
  const rawPath = join(raw, `${platform}-${Date.now()}.png`);
  rawScreenshot(platform, rawPath);
  const [width, height] = dimensions(rawPath);
  const top = Math.round(height * (platform === 'ios' ? 0.055 : 0.04));
  const bottom = Math.round(height * (platform === 'ios' ? 0.025 : 0.035));
  run('magick', [
    rawPath,
    '-crop',
    `${width}x${height - top - bottom}+0+${top}`,
    '+repage',
    '-strip',
    output,
  ]);
}

function changedPixels(expected, actual, diff) {
  run('magick', [expected, actual, '-compose', 'difference', '-composite', diff]);
  const ratio = Number(
    run(
      'magick',
      [
        diff,
        '-colorspace',
        'Gray',
        '-threshold',
        '4%',
        '-format',
        '%[fx:mean]',
        'info:',
      ],
      { capture: true },
    ),
  );
  const [width, height] = dimensions(actual);
  return { pixels: Math.round(ratio * width * height), ratio };
}

function captureScene(platform, appearance, scene, output) {
  setAppearance(platform, appearance);
  terminate(platform);
  open(platform, scene.path);
  // Do not let the previous screen or SpringBoard satisfy the color-based
  // readiness probe while the new process is still entering the foreground.
  sleep(2);
  // Cold debug launches can reconnect to Metro at very different speeds. The
  // purple native-stack header is the readiness signal, so a blank/loading
  // overlay can never be recorded as a baseline.
  waitForReady(platform);
  // Native launch, Metro download and Refreshing overlays can each remain
  // unchanged briefly. Require two consecutive settled frames rather than
  // trusting a fixed delay, then keep only the converged frame.
  const candidate = join(artifacts, `candidate-${platform}-${scene.name}-${appearance}.png`);
  const convergenceDiff = join(
    artifacts,
    `convergence-${platform}-${scene.name}-${appearance}.png`,
  );
  const settled = join(
    artifacts,
    `settled-${platform}-${scene.name}-${appearance}.png`,
  );
  const deadline = Date.now() + 45_000;
  screenshot(platform, candidate);
  while (Date.now() < deadline) {
    sleep(1);
    screenshot(platform, settled);
    const result = changedPixels(candidate, settled, convergenceDiff);
    if (result.ratio <= threshold && hasPurpleHeader(settled, true)) {
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(settled, output);
      return;
    }
    screenshot(platform, candidate);
  }
  throw new Error(
    `${platform}/${scene.name}-${appearance} did not converge within 45 seconds.`,
  );
}

function updatePlatform(platform) {
  console.log(`\nUpdating ${platform} visual baselines`);
  const outputDir = join(baselines, platform);
  mkdirSync(outputDir, { recursive: true });
  for (const appearance of ['light', 'dark']) {
    for (const scene of scenes) {
      const name = `${scene.name}-${appearance}.png`;
      captureScene(platform, appearance, scene, join(outputDir, name));
      console.log(`  stable ${name}`);
    }
  }
}

function testPlatform(platform) {
  console.log(`\nTesting ${platform} visual baselines`);
  let failed = false;
  for (const appearance of ['light', 'dark']) {
    for (const scene of scenes) {
      const name = `${scene.name}-${appearance}.png`;
      const expected = join(baselines, platform, name);
      const actual = join(artifacts, `actual-${platform}-${name}`);
      const diff = join(artifacts, `diff-${platform}-${name}`);
      captureScene(platform, appearance, scene, actual);
      const result = changedPixels(expected, actual, diff);
      const ok = result.ratio <= threshold;
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'} ${name}: ${(result.ratio * 100).toFixed(3)}% changed`,
      );
      failed ||= !ok;
    }
  }
  if (failed) throw new Error(`${platform} visual regression failed. See ${artifacts}`);
}

function luminance(path) {
  const [width, height] = dimensions(path);
  const y = Math.round(height * 0.2);
  const cropHeight = Math.round(height * 0.75);
  const value = run(
    'magick',
    [
      path,
      '-crop',
      `${width}x${cropHeight}+0+${y}`,
      '+repage',
      '-colorspace',
      'Gray',
      '-format',
      '%[fx:mean]',
      'info:',
    ],
    { capture: true },
  );
  return Number(value);
}

function waitForAppearance(platform, appearance, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    screenshot(platform, output);
    const value = luminance(output);
    const reached = appearance === 'dark' ? value < 0.72 : value > 0.78;
    if (reached && hasPurpleHeader(output, true)) return value;
    sleep(0.5);
  }
  throw new Error(`${platform} did not render ${appearance} appearance within 15 seconds.`);
}

function stressPlatform(platform) {
  console.log(`\nStress testing ${platform} navigation and live theme changes`);
  setAppearance(platform, 'light');
  terminate(platform);
  open(platform, 'home');
  waitForReady(platform);
  // The NavigationContainer subscribes to warm URL events after JS startup.
  // Do not dispatch the Effects link until that listener is definitely live.
  sleep(1);
  open(platform, 'effects');
  const frames = [];
  for (let index = 0; index < 8; index += 1) {
    const frame = join(artifacts, `stress-${platform}-light-${index}.png`);
    screenshot(platform, frame);
    frames.push(frame);
    sleep(0.08);
  }
  const lightValues = frames.map(luminance);
  if (Math.min(...lightValues) < 0.48) {
    throw new Error(
      `${platform} navigation produced a dark frame in light mode (min luminance ${Math.min(...lightValues).toFixed(3)}).`,
    );
  }

  setAppearance(platform, 'dark');
  const dark = join(artifacts, `stress-${platform}-effects-dark.png`);
  const darkValue = waitForAppearance(platform, 'dark', dark);
  setAppearance(platform, 'light');
  const light = join(artifacts, `stress-${platform}-effects-light-restored.png`);
  const lightValue = waitForAppearance(platform, 'light', light);
  console.log(
    `  PASS navigation min=${Math.min(...lightValues).toFixed(3)}, active-screen dark=${darkValue.toFixed(3)}, light=${lightValue.toFixed(3)}`,
  );
}

rmSync(artifacts, { recursive: true, force: true });
mkdirSync(artifacts, { recursive: true });
for (const platform of platforms) assertPlatform(platform);

try {
  for (const platform of platforms) {
    if (command === 'update') updatePlatform(platform);
    else if (command === 'test') testPlatform(platform);
    else if (command === 'stress') stressPlatform(platform);
    else throw new Error(`Unknown command '${command}'. Use update, test, or stress.`);
  }
  console.log('\nVisual regression command completed successfully.');
} finally {
  rmSync(raw, { recursive: true, force: true });
}
