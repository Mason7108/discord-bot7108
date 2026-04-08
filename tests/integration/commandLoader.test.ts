import { describe, expect, it } from "vitest";
import help from "../../src/modules/admin/commands/help.js";
import kick from "../../src/modules/moderation/commands/kick.js";
import ticket from "../../src/modules/tickets/commands/ticket.js";

describe("command integration", () => {
  it("exports expected command metadata", () => {
    expect(help.data.name).toBe("help");
    expect(help.module).toBe("admin");

    expect(kick.data.name).toBe("kick");
    expect(kick.module).toBe("moderation");

    expect(ticket.data.name).toBe("ticket");
    expect(ticket.module).toBe("tickets");
  });
});
