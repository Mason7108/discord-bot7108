import type { EventDefinition } from "../core/types.js";
import { removeInviteFromCache } from "../systems/inviteLogs.js";

const event: EventDefinition = {
  name: "inviteDelete",
  async execute(_client, rawInvite) {
    const invite = rawInvite as any;
    if (!invite?.code || !invite?.guild) {
      return;
    }

    removeInviteFromCache(invite);
  }
};

export default event;
