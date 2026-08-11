import { describe, expect, it } from "vitest";
import { interopPresets } from "..";

describe("interopPresets", () => {
  it("ships dependency-free mappings for common component libraries", () => {
    expect(interopPresets.gorhomBottomSheet.mapping).toMatchObject({
      backgroundClassName: "backgroundStyle",
      handleClassName: "handleStyle",
    });
    expect(interopPresets.shopifyFlashList.mapping).toMatchObject({
      contentContainerClassName: "contentContainerStyle",
    });
    expect(interopPresets.expoImage.packageName).toBe("expo-image");
  });
});
