---
title: Display
description: Utilities for controlling the display box type of an element.
---

# Display

Utilities for controlling the display box type of an element.

---

## Compatibility

| Class | Support |
| :--- | :--- |
| `flex` | 📱 Native & Web |
| `hidden` (`display: none`) | 📱 Native & Web |
| `grid` | ⚡ NitroCSS Engine |
| `inline`, `block` | 🌐 Web only |

---

## Usage

### Flex

Use `flex` to create a flexbox container.

```tsx
<View className="flex flex-row items-center justify-between p-4">
  <Text className="text-lg font-bold">Profile</Text>
  <View className="w-8 h-8 rounded-full bg-primary" />
</View>
```

### Hidden

Use `hidden` to set an element to `display: none` and remove it from the layout flow.

```tsx
<View className="hidden">
  <Text>This text is hidden from layout</Text>
</View>
```
