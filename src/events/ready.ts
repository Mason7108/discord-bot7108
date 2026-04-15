import { loadEnv } from "../config/env.js";
import type { EventDefinition } from "../core/types.js";
import { ensureVerificationMessage } from "../systems/verification.js";
import { logger } from "../utils/logger.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "ready",
  once: true,
  async execute(client) {
    logger.info({ user: client.user?.tag, id: client.user?.id }, "Bot ready");
    await ensureVerificationMessage(client, env).catch((error) => {
      logger.error({ err: error }, "Failed to ensure verification message");
    });
  }
};

export default event;
