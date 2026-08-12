---
title: States and Groups
description: Use pseudo states and group variants with native state propagation.
---


Nitrowind supports interactive pseudo variants that can be represented in React Native.

```tsx
<Pressable className="rounded-lg bg-teal-700 p-4 active:bg-teal-800 disabled:opacity-50">
  <Text className="text-white">Press me</Text>
</Pressable>
```

## Supported pseudo variants

- `hover:`
- `focus:`
- `focus-visible:`
- `focus-within:`
- `active:`
- `disabled:`
- `enabled:`
- `first:`
- `last:`

## Group variants

Mark a parent with `group`, then style descendants from the parent state:

```tsx
<Pressable className="group rounded-xl border border-zinc-300 p-4 active:bg-zinc-100">
  <Text className="text-zinc-900 group-active:text-teal-700">
    Child reacts to parent press state
  </Text>
</Pressable>
```

Supported group variants include `group-active:`, `group-hover:`, `group-focus:`, `group-focus-visible:`, `group-focus-within:`, `group-disabled:`, and `group-enabled:`.
