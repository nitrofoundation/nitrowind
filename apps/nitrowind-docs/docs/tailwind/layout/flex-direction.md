---
title: Flex Direction
description: Utilities for controlling the direction of flex items.
---

# Flex Direction

Utilities for controlling the direction of flex items.

---

## Compatibility

| Class | Support |
| :--- | :--- |
| `flex-row` | 📱 Native & Web |
| `flex-row-reverse` | 📱 Native & Web |
| `flex-col` | 📱 Native & Web |
| `flex-col-reverse` | 📱 Native & Web |

---

## Usage

### Row

Use `flex-row` to position flex items horizontally in the same direction as text.

```tsx
<View className="flex-row gap-4 p-4">
  <View className="flex-1 h-16 bg-primary rounded-md" />
  <View className="flex-1 h-16 bg-secondary rounded-md" />
</View>
```

### Column

Use `flex-col` to position flex items vertically (this is the default direction in React Native).

```tsx
<View className="flex-col gap-3 p-4">
  <View className="h-12 bg-primary rounded-md" />
  <View className="h-12 bg-secondary rounded-md" />
</View>
```
