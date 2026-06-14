import { describe, expect, it } from "vitest";
import { createHuntChain, defaultLimbs, normalize, resolveTargetAfterKill } from "../packages/shared/src";

describe("shared simulation helpers", () => {
  it("creates intact default limbs", () => {
    expect(defaultLimbs().leftLeg).toBe("intact");
    expect(defaultLimbs().rightArm).toBe("intact");
  });

  it("normalizes vectors safely", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("creates a closed hunt chain", () => {
    expect(createHuntChain(["a", "b", "c"])).toEqual({ a: "b", b: "c", c: "a" });
  });

  it("redirects a hunter to a third-party killer after a stolen kill", () => {
    const chain = createHuntChain(["a", "b", "c"]);
    expect(resolveTargetAfterKill("a", "c", "b", chain)).toBe("c");
  });
});
