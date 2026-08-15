---
title: Supported Features & Compatibility
description: Complete compatibility matrix showing what CSS and Tailwind CSS v4 features are supported natively via React Native, through the C++ NitroCSS engine, on Web, or marked as Experimental.
---

# Supported Features & Compatibility Matrix

Nitrowind compiles Tailwind CSS v4 utilities into high-performance style definitions. Features are processed either directly via React Native's native layout engine (Yoga/StyleSheet), hardware-accelerated through Nitrowind's native C++ **NitroCSS engine**, or preserved for web builds.

---

## Legend

| Badge | Support Level | Description |
| :--- | :--- | :--- |
| 📱 **Native & Web** | **Core React Native** | Supported across iOS, Android, and Web out of the box. |
| ⚡ **NitroCSS Engine** | **Native C++ Engine** | Accelerated via Nitrowind's native C++ ShadowTree runtime (zero JS re-renders). |
| 🌐 **Web only** | **Web Browser** | Supported when target browser engine allows, fallback on native. |
| 🧪 **Experimental** | **In Development** | Experimental support subject to native engine flags. |

---

## Layout & Flexbox

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `flex-row`, `flex-col`, `flex-row-reverse` | 📱 Native & Web | Maps directly to React Native `flexDirection`. |
| `flex-wrap`, `flex-nowrap`, `flex-wrap-reverse` | 📱 Native & Web | Maps to React Native `flexWrap`. |
| `flex-1`, `flex-auto`, `flex-initial`, `flex-none` | 📱 Native & Web | Maps to React Native `flex` property. |
| `flex-grow`, `flex-grow-0` | 📱 Native & Web | Maps to `flexGrow`. |
| `flex-shrink`, `flex-shrink-0` | 📱 Native & Web | Maps to `flexShrink`. |
| `items-start`, `items-center`, `items-end`, `items-stretch` | 📱 Native & Web | Maps to `alignItems`. |
| `justify-start`, `justify-center`, `justify-between`, `justify-around`, `justify-evenly` | 📱 Native & Web | Maps to `justifyContent`. |
| `self-auto`, `self-start`, `self-center`, `self-end`, `self-stretch` | 📱 Native & Web | Maps to `alignSelf`. |
| `gap-1` to `gap-96` | 📱 Native & Web | Maps to `gap`, `rowGap`, and `columnGap`. |
| `box-border`, `box-content` | 📱 Native & Web | React Native defaults to `box-border`. |
| `aspect-square`, `aspect-video`, `aspect-[ratio]` | 📱 Native & Web | Maps to React Native `aspectRatio`. |
| `display: flex`, `display: none` | 📱 Native & Web | Maps to `display: 'flex'` / `'none'`. |
| `grid`, `grid-cols-*` | ⚡ NitroCSS Engine | Flexbox fallbacks on native, full CSS Grid on web & NitroCSS. |
| `break-inside-*`, `break-before-*` | 🌐 Web only | Print & multi-column page break controls for web targets. |

---

## Spacing & Sizing

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `p-1` to `p-96`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*` | 📱 Native & Web | Maps to `padding`, `paddingHorizontal`, `paddingVertical`, etc. |
| `m-1` to `m-96`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*` | 📱 Native & Web | Maps to `margin`, `marginHorizontal`, etc. |
| `w-full`, `w-screen`, `w-auto`, `w-[value]` | 📱 Native & Web | Maps to `width`. |
| `min-w-*`, `max-w-*` | 📱 Native & Web | Maps to `minWidth` and `maxWidth`. |
| `h-full`, `h-screen`, `h-auto`, `h-[value]` | 📱 Native & Web | Maps to `height`. |
| `min-h-*`, `max-h-*` | 📱 Native & Web | Maps to `minHeight` and `maxHeight`. |
| `p-safe`, `pt-safe`, `pb-safe` | ⚡ NitroCSS Engine | Dynamically binds to native device safe area inset values. |

---

## Typography

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `font-sans`, `font-serif`, `font-mono`, `font-[family]` | 📱 Native & Web | Maps to React Native `fontFamily`. |
| `text-xs` through `text-9xl` | 📱 Native & Web | Maps to `fontSize` & default `lineHeight`. |
| `font-thin`, `font-normal`, `font-bold`, `font-[weight]` | 📱 Native & Web | Maps to `fontWeight`. |
| `tracking-tighter` through `tracking-widest` | 📱 Native & Web | Maps to `letterSpacing`. |
| `leading-none` through `leading-loose` | 📱 Native & Web | Maps to `lineHeight`. |
| `text-left`, `text-center`, `text-right`, `text-justify` | 📱 Native & Web | Maps to `textAlign`. |
| `text-color` (e.g. `text-slate-900`, `text-primary`) | 📱 Native & Web | Maps to `color`. |
| `underline`, `line-through`, `no-underline` | 📱 Native & Web | Maps to `textDecorationLine`. |
| `uppercase`, `lowercase`, `capitalize` | 📱 Native & Web | Maps to `textTransform`. |
| `line-clamp-1` to `line-clamp-6` | 📱 Native & Web | Maps to `numberOfLines` native prop. |

---

## Backgrounds & Colors

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `bg-color` (e.g. `bg-white`, `bg-slate-900`) | 📱 Native & Web | Maps to `backgroundColor`. |
| `bg-gradient-to-r`, `from-*`, `via-*`, `to-*` | ⚡ NitroCSS Engine | Native C++ linear gradient rendering without extra components. |
| `bg-[url(...)]` | ⚡ NitroCSS Engine | Rendered via native C++ image background layers. |

---

## Borders & Radii

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `rounded-none` through `rounded-full`, `rounded-t-*` | 📱 Native & Web | Maps to `borderRadius`, `borderTopLeftRadius`, etc. |
| `border`, `border-2`, `border-4`, `border-[width]` | 📱 Native & Web | Maps to `borderWidth`. |
| `border-solid`, `border-dashed`, `border-dotted` | 📱 Native & Web | Maps to `borderStyle`. |
| `border-color` (e.g. `border-slate-200`) | 📱 Native & Web | Maps to `borderColor`. |

---

## Effects & Filters

| Utility Class | Support | Description / React Native Mapping |
| :--- | :--- | :--- |
| `opacity-0` through `opacity-100` | 📱 Native & Web | Maps to `opacity`. |
| `shadow-sm`, `shadow`, `shadow-lg`, `shadow-2xl` | ⚡ NitroCSS Engine | Compiled to native iOS `shadowColor`/`shadowRadius` and Android `elevation`. |
| `blur-*`, `backdrop-blur-*` | ⚡ NitroCSS Engine | Hardware accelerated blur effects via native runtime filters. |

---

## NitroCSS Engine & Native Features

| Feature | Support | Description |
| :--- | :--- | :--- |
| `@container`, `@md:flex-row`, `@lg:grid-cols-3` | ⚡ NitroCSS Engine | Component-level container queries calculated natively in C++. |
| `dark:bg-slate-900`, `adaptive:bg-surface` | ⚡ NitroCSS Engine | Native theme switching synchronized with OS without React re-renders. |
| `ios:shadow-lg`, `android:elevation-4` | ⚡ NitroCSS Engine | Targeted platform variant modifiers. |
| `group-hover:*`, `group-active:*` | ⚡ NitroCSS Engine | Parent-child component state binding at native runtime speed. |
| Keyframe Animations (`animate-spin`, `animate-bounce`) | 🧪 Experimental | Native C++ animation timing driver. |

---

## Usage Examples

### Flexbox Layout Example

```tsx
<View className="flex-1 flex-col items-center justify-between p-5 bg-surface">
  <Text className="text-2xl font-bold text-content">
    Header Title
  </Text>
  <View className="flex-row gap-3 w-full">
    <View className="flex-1 h-24 bg-primary rounded-lg" />
    <View className="flex-1 h-24 bg-secondary rounded-lg" />
  </View>
</View>
```

### Native Container Queries & Adaptive Themes

```tsx
<View className="@container p-4 bg-surface dark:bg-slate-900 rounded-xl">
  <View className="flex-col @md:flex-row gap-4">
    <Text className="text-lg font-semibold text-primary">
      Adaptive Card Title
    </Text>
  </View>
</View>
```
