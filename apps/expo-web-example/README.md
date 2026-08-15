# Expo web example

Run `yarn workspace nitrowind-expo-web-example web` for browser development or
`yarn workspace nitrowind-expo-web-example export:web` for the server-rendering
export. `app/index.web.tsx` uses real HTML and browser Tailwind CSS; the
matching `app/index.tsx` stays native.

The scripts set `NODE_PATH` for Yarn's workspace linker so Expo CLI resolves
the example's local `expo-router` package correctly.

Expo Router server rendering remains experimental. Keep the web and native
routes split whenever their semantics differ.
