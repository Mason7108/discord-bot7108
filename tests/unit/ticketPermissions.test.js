import { describe, expect, it } from "vitest";
import { ticketPermissionsForMember } from "../../src/systems/tickets.js";
describe("ticket permissions", () => {
    it("includes owner and staff roles", () => {
        const rows = ticketPermissionsForMember("owner", ["staff-1", "staff-2"]);
        expect(rows[0].id).toBe("owner");
        expect(rows.length).toBe(3);
    });
});
