import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { handleGuildBanAdd } from "../systems/banAppeals.js";
import { logger } from "../utils/logger.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "guildBanAdd",
  async execute(client, rawBan) {
    const ban = rawBan as any;
    if (!ban?.guild || !ban?.user) {
      return;
    }

    await handleGuildBanAdd(client, ban, env).catch((error) => {
      logger.error({ err: error, guildId: ban.guild?.id, userId: ban.user?.id }, "Failed to process guild ban appeal flow");
    });
  }
};

export default event;
