import { Text, View } from "nitrowind";

import { Card, Caption, Screen, Section } from "../components/ui";

type SupportSource = "rn" | "nitrowind" | "bridge" | "unsupported";

const RN_LAYOUT_SUPPORT = [
  { name: "flex-wrap", status: "RN native", source: "rn" },
  { name: "gap", status: "RN native", source: "rn" },
  { name: "row-gap", status: "RN native", source: "rn" },
  { name: "column-gap", status: "RN native", source: "rn" },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const NITROWIND_GRID_SUPPORT = [
  { name: "equal fr columns", status: "internal", source: "nitrowind" },
  { name: "fixed px columns", status: "internal", source: "nitrowind" },
  { name: "auto rows", status: "internal", source: "nitrowind" },
  { name: "row + column gaps", status: "internal", source: "nitrowind" },
  { name: "col-start / row-start", status: "internal", source: "nitrowind" },
  { name: "col-span / row-span", status: "internal", source: "nitrowind" },
  { name: "sparse auto placement", status: "internal", source: "nitrowind" },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const GRID_BRIDGE_WORK = [
  { name: "NitrowindGridView", status: "bridge next", source: "bridge" },
  { name: "Fabric ShadowNode layout", status: "bridge next", source: "bridge" },
  {
    name: "JS class metadata to native props",
    status: "bridge next",
    source: "bridge",
  },
  {
    name: "iOS / Android component registration",
    status: "bridge next",
    source: "bridge",
  },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const NOT_SUPPORTED_YET = [
  { name: "display: grid", status: "not RN", source: "unsupported" },
  { name: "grid-template-columns", status: "not RN", source: "unsupported" },
  { name: "grid-template-rows", status: "not RN", source: "unsupported" },
  { name: "grid-column / grid-row", status: "not RN", source: "unsupported" },
  { name: "dense auto-placement", status: "later", source: "unsupported" },
  { name: "subgrid / masonry", status: "later", source: "unsupported" },
  { name: "named grid lines", status: "later", source: "unsupported" },
  { name: "min-content / max-content", status: "later", source: "unsupported" },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const INTERNAL_GRID_PREVIEW = [
  { label: "A", className: "col-span-1 bg-sky-500" },
  { label: "B", className: "col-span-1 bg-emerald-500" },
  { label: "C", className: "col-span-1 bg-fuchsia-500" },
  { label: "Span", className: "col-span-2 bg-amber-500" },
  { label: "D", className: "col-span-1 bg-rose-500" },
];

const CELLS = [
  { label: "A", className: "w-[48%] bg-sky-500" },
  { label: "B", className: "w-[48%] bg-emerald-500" },
  { label: "Span", className: "w-full bg-amber-500" },
  { label: "C", className: "w-[48%] bg-fuchsia-500" },
  { label: "D", className: "w-[48%] bg-rose-500" },
];

function badgeClass(source: SupportSource): string {
  switch (source) {
    case "rn":
      return "bg-emerald-500";
    case "nitrowind":
      return "bg-sky-500";
    case "bridge":
      return "bg-amber-500";
    default:
      return "bg-surface";
  }
}

function badgeTextClass(source: SupportSource): string {
  return source === "unsupported" ? "text-muted" : "text-white";
}

function PropertyRow({
  name,
  status,
  source,
}: {
  name: string;
  status: string;
  source: SupportSource;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <Text className="flex-1 text-sm font-semibold text-on-surface">
        {name}
      </Text>
      <View className={`rounded-full px-3 py-1 ${badgeClass(source)}`}>
        <Text className={`text-xs font-bold ${badgeTextClass(source)}`}>
          {status}
        </Text>
      </View>
    </View>
  );
}

export default function GridExamples() {
  return (
    <Screen>
      <Section
        title="Native gap layout"
        subtitle="React Native supports flex wrapping with gap, row-gap, and column-gap."
      >
        <Card className="flex-row flex-wrap gap-3">
          {CELLS.map((cell) => (
            <View
              key={cell.label}
              className={`h-16 items-center justify-center rounded-xl ${cell.className}`}
            >
              <Text className="text-sm font-extrabold text-white">
                {cell.label}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section
        title="Row and column gaps"
        subtitle="These map directly to RN style props and work natively."
      >
        <Card className="gap-y-4 gap-x-2">
          <View className="flex-row gap-x-2">
            <View className="h-12 flex-1 rounded-xl bg-primary" />
            <View className="h-12 flex-1 rounded-xl bg-accent" />
            <View className="h-12 flex-1 rounded-xl bg-success" />
          </View>
          <View className="flex-row gap-x-2">
            <View className="h-12 flex-1 rounded-xl bg-warning" />
            <View className="h-12 flex-1 rounded-xl bg-danger" />
          </View>
        </Card>
      </Section>

      <Section
        title="React Native support"
        subtitle="These are real RN style props today, so Nitrowind maps them directly."
      >
        <Card>
          {RN_LAYOUT_SUPPORT.map((item) => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Section
        title="Nitrowind internal grid"
        subtitle="The shared C++ engine can calculate these layouts before the Fabric bridge is connected."
      >
        <Card className="gap-4">
          <View className="grid grid-cols-3 auto-rows-[64px] flex-row flex-wrap gap-3 rounded-xl bg-surface">
            {INTERNAL_GRID_PREVIEW.map((cell) => (
              <View
                key={cell.label}
                className={`h-16 items-center justify-center rounded-xl ${cell.className}`}
              >
                <Text className="text-sm font-extrabold text-white">
                  {cell.label}
                </Text>
              </View>
            ))}
          </View>
          <View>
            {NITROWIND_GRID_SUPPORT.map((item) => (
              <PropertyRow key={item.name} {...item} />
            ))}
          </View>
        </Card>
      </Section>

      <Section
        title="Bridge work"
        subtitle="These pieces connect the internal grid engine to a real native component."
      >
        <Card>
          {GRID_BRIDGE_WORK.map((item) => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Section
        title="CSS Grid not native yet"
        subtitle="React Native 0.85 does not expose these browser CSS Grid props as layout styles."
      >
        <Card>
          {NOT_SUPPORTED_YET.map((item) => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Caption>
        Green rows come from React Native. Blue rows are implemented inside
        Nitrowind's shared C++ grid engine. Amber rows are the remaining bridge
        to make the grid engine drive Fabric layout.
      </Caption>
    </Screen>
  );
}
