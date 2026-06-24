import { describe, it, expect } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("returns empty string with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("filters falsy values (false, undefined, null, empty string)", () => {
    expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
  });

  it("deduplicates conflicting Tailwind utilities via tailwind-merge", () => {
    // tailwind-merge resolves the last value wins for the same property
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional class objects", () => {
    const isActive = true;
    expect(cn("base", { active: isActive, inactive: !isActive })).toBe(
      "base active"
    );
  });

  it("handles array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });
});
