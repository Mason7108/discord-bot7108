import type { EventDefinition } from "../core/types.js";
import { registerInviteInCache } from "../systems/inviteLogs.js";

const event: EventDefinition = {
  name: "inviteCreate",
  async execute(_client, rawInvite) {
    const invite = rawInvite as any;
    if (!invite?.code || !invite?.guild) {
      return;
    }

    registerInviteInCache(invite);
  }
};

export default event;
