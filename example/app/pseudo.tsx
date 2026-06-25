import { Pressable, Text, TextInput, View } from "nitrowind";

import { Card, Caption, Screen, Section } from "../components/ui";

const PSEUDO_CLASSES = [
  ":active",
  ":any-link",
  ":auto-fill",
  ":checked",
  ":default",
  ":defined",
  ":dir()",
  ":disabled",
  ":empty",
  ":enabled",
  ":first",
  ":first-child",
  ":first-of-type",
  ":focus",
  ":focus-visible",
  ":focus-within",
  ":fullscreen",
  ":has()",
  ":hover",
  ":in-range",
  ":indeterminate",
  ":invalid",
  ":is()",
  ":lang()",
  ":last-child",
  ":last-of-type",
  ":left",
  ":link",
  ":modal",
  ":not()",
  ":nth-child()",
  ":nth-last-child()",
  ":nth-last-of-type()",
  ":nth-of-type()",
  ":only-child",
  ":only-of-type",
  ":optional",
  ":out-of-range",
  ":placeholder-shown",
  ":popover-open",
  ":read-only",
  ":read-write",
  ":required",
  ":right",
  ":root",
  ":scope",
  ":state()",
  ":target",
  ":user-invalid",
  ":user-valid",
  ":valid",
  ":visited",
  ":where()",
];

const PSEUDO_ELEMENTS = [
  "::after",
  "::backdrop",
  "::before",
  "::file-selector-button",
  "::first-letter",
  "::first-line",
  "::grammar-error",
  "::highlight()",
  "::marker",
  "::placeholder",
  "::selection",
  "::spelling-error",
  "::view-transition",
  "::view-transition-group",
  "::view-transition-image-pair",
  "::view-transition-new",
  "::view-transition-old",
];

const SUPPORTED = new Set([
  ":active",
  ":disabled",
  ":enabled",
  ":focus",
  ":focus-visible",
  ":focus-within",
  "group-active",
  "group-focus",
  "group-focus-visible",
  "group-hover",
  ":first-child",
  ":hover",
  ":last-child",
  "::selection",
  "::placeholder",
]);

function Token({ name }: { name: string }) {
  const supported = SUPPORTED.has(name);
  return (
    <View
      className={`rounded-full border px-3 py-2 ${
        supported
          ? "border-emerald-500 bg-emerald-500/15"
          : "border-border bg-surface-elevated"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          supported ? "text-success" : "text-muted"
        }`}
      >
        {name}
      </Text>
    </View>
  );
}

export default function PseudoSelectors() {
  return (
    <Screen>
      <Section
        title="Interactive pseudo-classes"
        subtitle="Pressable state resolves these without re-rendering the whole tree."
      >
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            className="rounded-2xl border border-border bg-surface-elevated p-4 active:bg-rose-500 hover:bg-sky-500 focus-visible:border-amber-500 disabled:opacity-50 transition-all duration-200"
          >
            <Text className="text-center text-sm font-bold text-on-surface active:text-white hover:text-white transition-colors duration-2000">
              Press, hover, or focus me
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled
            className="rounded-2xl border border-border bg-surface-elevated p-4 disabled:bg-muted disabled:opacity-50"
          >
            <Text className="text-center text-sm font-bold text-on-surface">
              Disabled state
            </Text>
          </Pressable>
        </View>
      </Section>

      <Section
        title="Group pseudo-classes"
        subtitle="Group descendants react to the nearest group root state through native shadow tree associations."
      >
        <Pressable
          accessibilityRole="button"
          className="group rounded-2xl border border-border bg-surface-elevated p-4 active:border-primary focus:border-primary"
        >
          <View className="rounded-xl border border-transparent bg-surface px-4 py-3 group-active:bg-primary group-focus:border-accent">
            <Text className="text-center text-sm font-bold text-on-surface group-active:text-on-primary">
              Group child follows parent state
            </Text>
          </View>
        </Pressable>
      </Section>

      <Section
        title="Host pseudo props"
        subtitle="Placeholder and selection map to React Native host props. Generated pseudo-elements stay inert."
      >
        <View className="gap-3">
          <TextInput
            placeholder="Placeholder uses ::placeholder color"
            className="rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-on-surface placeholder:text-amber-500"
          />
        </View>
      </Section>

      <Section
        title="Structural pseudo-classes"
        subtitle="The shim injects first/last child state into direct styled children."
      >
        <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
          {["first child", "middle child", "last child"].map((label) => (
            <View
              key={label}
              className="rounded-xl bg-surface px-4 py-3 first:bg-sky-500 last:bg-fuchsia-500"
            >
              <Text className="text-sm font-semibold text-on-surface first:text-white last:text-white">
                {label}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section
        title="W3 pseudo-class catalog"
        subtitle="Green tokens map to native state or host props; muted tokens are DOM/page/form-tree selectors."
      >
        <Card className="flex-row flex-wrap gap-2">
          {PSEUDO_CLASSES.map((name) => (
            <Token key={name} name={name} />
          ))}
        </Card>
      </Section>

      <Section
        title="W3 pseudo-element catalog"
        subtitle="Placeholder and selection have direct React Native host mappings; generated elements are intentionally inert."
      >
        <Card className="flex-row flex-wrap gap-2">
          {PSEUDO_ELEMENTS.map((name) => (
            <Token key={name} name={name} />
          ))}
        </Card>
      </Section>

      <Caption>
        DOM-only pseudos compile as inert buckets so they do not accidentally
        style native views.
      </Caption>
    </Screen>
  );
}
