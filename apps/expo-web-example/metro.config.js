const { getDefaultConfig } = require('expo/metro-config');
const { withNitrowindMetroConfig } = require('@nitrofoundation/nitrowind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNitrowindMetroConfig(config, {
  input: './global.css',
  content: ['./app/**/*.{ts,tsx,js,jsx}', './components/**/*.{ts,tsx,js,jsx}'],
});
