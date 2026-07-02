/**
 * Reanimated / CSS-animation utility generation.
 *
 * Tailwind has no concept of React Native Reanimated's entering/exiting/layout
 * animations, so we synthesise an `@utility` family that bakes the animation
 * *intent* into `--reanimated-*` custom properties. The nitrocss runtime reads
 * those properties back and instantiates the matching Reanimated animation
 * builder — the JS/UI-thread path Reanimated requires.
 *
 * We also ship a set of pure CSS `@keyframes` animations (`animate-wiggle`, …)
 * that Reanimated runs natively through its CSS-animation support, so they need
 * no JS driver at all.
 *
 * The preset name lists (`ENTERING_EXITING_PRESETS` / `LAYOUT_PRESETS`) live in
 * `@nitrofoundation/nitrocss` because the runtime needs them to map the
 * `--reanimated-*` values back to builders; this module only turns them into
 * Tailwind `@utility` CSS.
 */
import {
  ENTERING_EXITING_PRESETS,
  LAYOUT_PRESETS,
} from "@nitrofoundation/nitrocss/compiler";

/** `"FadeInDown"` -> `"-fade-in-down"`. */
const kebab = (name: string): string =>
  name.replace(/([A-Z])/g, "-$1").toLowerCase();

/** Built-in CSS keyframe animations, run natively by Reanimated's CSS engine. */
export const CSS_ANIMATIONS: ReadonlyArray<{
  name: string;
  keyframes: Record<string, Record<string, string | number>>;
  animation: string;
}> = [
  {
    name: "wiggle",
    keyframes: {
      "0%, 100%": { transform: "rotate(-3deg)" },
      "50%": { transform: "rotate(3deg)" },
    },
    animation: "wiggle 1s ease-in-out infinite",
  },
  {
    name: "shake",
    keyframes: {
      "0%, 100%": { transform: "translateX(0)" },
      "10%, 50%, 90%": { transform: "translateX(-8px)" },
      "30%, 70%": { transform: "translateX(8px)" },
    },
    animation: "shake 0.8s ease-in-out infinite",
  },
  {
    name: "flash",
    keyframes: {
      "0%, 50%, 100%": { opacity: 1 },
      "25%, 75%": { opacity: 0 },
    },
    animation: "flash 1s linear infinite",
  },
  {
    name: "rubber-band",
    keyframes: {
      "0%": { transform: "scale(1)" },
      "30%": { transform: "scaleX(1.25) scaleY(0.75)" },
      "40%": { transform: "scaleX(0.75) scaleY(1.25)" },
      "60%": { transform: "scaleX(1.15) scaleY(0.85)" },
      "80%": { transform: "scaleX(0.95) scaleY(1.05)" },
      "100%": { transform: "scale(1)" },
    },
    animation: "rubber-band 1s ease-in-out infinite",
  },
  {
    name: "swing",
    keyframes: {
      "0%, 100%": { transform: "rotate(0deg)" },
      "20%": { transform: "rotate(15deg)" },
      "40%": { transform: "rotate(-10deg)" },
      "60%": { transform: "rotate(5deg)" },
      "80%": { transform: "rotate(-5deg)" },
    },
    animation: "swing 1s ease-in-out infinite",
  },
  {
    name: "tada",
    keyframes: {
      "0%, 100%": { transform: "scale(1) rotate(0deg)" },
      "10%, 20%": { transform: "scale(0.9) rotate(-3deg)" },
      "30%, 50%, 70%, 90%": { transform: "scale(1.1) rotate(3deg)" },
      "40%, 60%, 80%": { transform: "scale(1.1) rotate(-3deg)" },
    },
    animation: "tada 1.2s ease-in-out infinite",
  },
  {
    name: "heartbeat",
    keyframes: {
      "0%, 100%": { transform: "scale(1)" },
      "14%": { transform: "scale(1.3)" },
      "28%": { transform: "scale(1)" },
      "42%": { transform: "scale(1.3)" },
      "70%": { transform: "scale(1)" },
    },
    animation: "heartbeat 1.3s ease-in-out infinite",
  },
  {
    name: "jello",
    keyframes: {
      "0%, 100%": { transform: "rotate(0deg)" },
      "22%": { transform: "rotate(-4deg)" },
      "33%": { transform: "rotate(4deg)" },
      "44%": { transform: "rotate(-3deg)" },
      "55%": { transform: "rotate(3deg)" },
      "67%": { transform: "rotate(-1deg)" },
      "78%": { transform: "rotate(1deg)" },
    },
    animation: "jello 0.9s ease-in-out infinite",
  },
  {
    name: "float",
    keyframes: {
      "0%, 100%": { transform: "translateY(0)" },
      "50%": { transform: "translateY(-8px)" },
    },
    animation: "float 3s ease-in-out infinite",
  },
  {
    name: "breathe",
    keyframes: {
      "0%, 100%": { transform: "scale(1)" },
      "50%": { transform: "scale(1.05)" },
    },
    animation: "breathe 4s ease-in-out infinite",
  },
  {
    name: "tilt",
    keyframes: {
      "0%, 100%": { transform: "rotate(0deg)" },
      "25%": { transform: "rotate(-15deg)" },
      "75%": { transform: "rotate(15deg)" },
    },
    animation: "tilt 1.5s ease-in-out infinite",
  },
  {
    name: "glitch",
    keyframes: {
      "0%, 100%": { transform: "translateX(0)" },
      "10%": { transform: "translateX(-4px)" },
      "20%": { transform: "translateX(4px)" },
      "30%": { transform: "translateX(-3px)" },
      "40%": { transform: "translateX(3px)" },
      "50%": { transform: "translateX(-2px)" },
      "60%": { transform: "translateX(2px)" },
      "70%": { transform: "translateX(-1px)" },
      "80%": { transform: "translateX(1px)" },
      "90%": { transform: "translateX(0)" },
    },
    animation: "glitch 0.5s linear infinite",
  },
];

const PRESET_TYPES = ["entering", "exiting", "layout"] as const;
const TIME_TYPES = ["duration", "delay"] as const;
const DEFAULT_TIME_VALUES = [75, 100, 150, 200, 300, 500, 700, 1000];
const SPRING_TYPES = ["damping", "stiffness", "mass"] as const;
const EASINGS: ReadonlyArray<[suffix: string, value: string]> = [
  ["linear", "linear"],
  ["in", "ease-in"],
  ["out", "ease-out"],
  ["in-out", "ease-in-out"],
  ["bounce", "ease-bounce"],
];

const utility = (name: string, body: string): string =>
  `@utility ${name} {\n  ${body}\n}\n`;

/** Build the entering/exiting/layout preset utilities. */
function buildPresetUtilities(): string {
  let css = "";
  for (const preset of ENTERING_EXITING_PRESETS) {
    const suffix = kebab(preset);
    css += utility(`entering${suffix}`, `--reanimated-entering: ${preset};`);
    css += utility(`exiting${suffix}`, `--reanimated-exiting: ${preset};`);
  }
  for (const preset of LAYOUT_PRESETS) {
    css += utility(`layout${kebab(preset)}`, `--reanimated-layout: ${preset};`);
  }
  return css;
}

/** Build the duration/delay/spring/easing/springify config utilities. */
function buildConfigUtilities(): string {
  let css = "";
  for (const type of PRESET_TYPES) {
    for (const timeType of TIME_TYPES) {
      for (const value of DEFAULT_TIME_VALUES) {
        css += utility(
          `${type}-${timeType}-${value}`,
          `--reanimated-${type}-${timeType}: ${value}ms;`,
        );
      }
      css += utility(
        `${type}-${timeType}-*`,
        `--reanimated-${type}-${timeType}: --value(integer)ms;`,
      );
    }
    for (const physics of SPRING_TYPES) {
      css += utility(
        `${type}-${physics}-*`,
        `--reanimated-${type}-${physics}: --value(number);`,
      );
    }
    for (const [suffix, value] of EASINGS) {
      css += utility(
        `${type}-ease-${suffix}`,
        `--reanimated-${type}-easing: ${value};`,
      );
    }
    css += utility(
      `${type}-springify`,
      `--reanimated-${type}-springify: true;`,
    );
  }
  return css;
}

/** Build the `@keyframes` + `animate-*` CSS-animation utilities. */
function buildCssAnimations(): string {
  let css = "";
  for (const anim of CSS_ANIMATIONS) {
    const steps = Object.entries(anim.keyframes)
      .map(([selector, props]) => {
        const decls = Object.entries(props)
          .map(([prop, val]) => `    ${prop}: ${val};`)
          .join("\n");
        return `  ${selector} {\n${decls}\n  }`;
      })
      .join("\n");
    css += `@keyframes ${anim.name} {\n${steps}\n}\n`;
    css += utility(`animate-${anim.name}`, `animation: ${anim.animation};`);
  }
  return css;
}

/**
 * The full Reanimated utility stylesheet, appended to the user's input CSS
 * before Tailwind compiles (alongside `PLATFORM_CSS` and `INSETS_CSS`).
 */
export const REANIMATED_CSS: string = [
  buildPresetUtilities(),
  buildConfigUtilities(),
  buildCssAnimations(),
].join("\n");
