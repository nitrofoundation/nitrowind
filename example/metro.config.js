const { getDefaultConfig } = require("expo/metro-config");
const { withNitrowindMetroConfig } = require("nitrowind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Wrap Expo's Metro config with nitrowind's transformer so Tailwind class names
// are compiled to native style payloads at bundle time.
module.exports = withNitrowindMetroConfig(config, {
  input: "./global.css",
  content: ["./app/**/*.{tsx,ts,jsx,js}", "./components/**/*.{tsx,ts,jsx,js}"],
});
