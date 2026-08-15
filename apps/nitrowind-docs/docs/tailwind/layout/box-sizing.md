---
title: Box Sizing
description: Utilities for controlling how the total size of an element is calculated.
---

# Box Sizing

Utilities for controlling how the total size of an element is calculated.

---

## Compatibility

| Class | Support |
| :--- | :--- |
| `box-border` | 📱 Native & Web |
| `box-content` | 📱 Native & Web |

---

## Usage

### Border Box

Use `box-border` to set an element's `box-sizing` to `border-box`, telling the browser or native layout engine to include borders and padding in the element's specified width and height.

```tsx
<View className="box-border h-32 w-32 p-4 border-4 border-primary">
  <Text className="text-content">Content inside border box</Text>
</View>
```
