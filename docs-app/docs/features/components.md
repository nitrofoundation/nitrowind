---
title: Components
description: ClassName-aware React Native primitives and scrollables.
---

# Components

Import styled React Native primitives from Nitrowind:

```tsx
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
  SectionList,
} from "@nitrofoundation/nitrowind";
```

## Host components

Supported wrappers include:

- `View`
- `Text`
- `ActivityIndicator`
- `Image`
- `ImageBackground`
- `KeyboardAvoidingView`
- `Pressable`
- `Switch`
- `TextInput`
- `TouchableHighlight`
- `TouchableOpacity`
- `FlatList`
- `ScrollView`
- `SectionList`

## Scrollable class props

Scrollables support style props such as `contentContainerClassName`:

```tsx
<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
  <Card />
  <Card />
</ScrollView>
```

Use [cssInterop](../api/css-interop) to teach third-party components the same pattern.
