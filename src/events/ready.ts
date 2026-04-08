import type { EventDefinition } from "../core/types.js";
import { logger } from "../utils/logger.js";

const event: EventDefinition = {
  name: "ready",
  once: true,
  async execute(client) {
    logger.info({ user: client.user?.tag, id: client.user?.id }, "Bot ready");
  }
};

export default event;
