# Nitrowind Skills

Reusable agent skills for supported Nitrowind and Nitrocss workflows.

Install every curated skill in the current project:

```bash
npx @nitrofoundation/nitrowind-skills add --all
```

Install one focused skill:

```bash
npx @nitrofoundation/nitrowind-skills add nitrowind-background-images
```

Create a project-specific starting point interactively:

```bash
npx @nitrofoundation/nitrowind-skills create
```

Skills are written to `.agents/skills` by default. Use `--path <directory>` to choose another location.

The package includes setup, migration, plain CSS, adaptive theming, components and interop, interaction states, responsive layouts, container queries, safe area, background images, native effects, animations, SVG, native props, and native-engine workflows.

## Safe areas and grids

Apply safe-area utilities to a screen parent and make the grid a child view. This keeps the grid focused on its columns and gaps while the parent owns device insets:

```tsx
<View className="flex-1 pt-safe pb-safe">
  <View className="flex-1 grid grid-cols-2 gap-4">
    <View className="bg-violet-400" />
    <View className="bg-violet-500" />
  </View>
</View>
```

For Tailwind projects, include `@reference "@nitrofoundation/nitrocss";` in the CSS entry file so Nitrocss utilities are available to the compiler and editor tooling.
