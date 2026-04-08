import { describe, expect, it } from "vitest";
import { checkAndSetCooldown } from "../../src/core/guards/cooldownGuard.js";
describe("cooldownGuard", () => {
    it("blocks requests inside cooldown window", () => {
        const store = new Map();
        const first = checkAndSetCooldown(store, "ping", "u1", 5);
        const second = checkAndSetCooldown(store, "ping", "u1", 5);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
        if (!second.ok) {
            expect(second.msRemaining).toBeGreaterThan(0);
        }
    });
});
