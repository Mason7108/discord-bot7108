import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommands } from "../../src/core/loaders/commandLoader.js";
describe("commandLoader integration", () => {
    it("loads known command names from modules folder", async () => {
        const testDir = path.dirname(fileURLToPath(import.meta.url));
        const modulesPath = path.resolve(testDir, "../../src/modules");
        const commands = await loadCommands(modulesPath);
        expect(commands.has("help")).toBe(true);
        expect(commands.has("modules")).toBe(true);
        expect(commands.has("kick")).toBe(true);
        expect(commands.has("ticket")).toBe(true);
    });
});
