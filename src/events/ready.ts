import { loadEnv } from "../config/env.js";
import { ensureBotApplicationOwnerLoaded } from "../api/dashboardSecurity.js";
import { applyBotPresence, getBotControlSettings } from "../core/services/botControlService.js";
import type { EventDefinition } from "../core/types.js";
import { ensureInviteGeneratorMessage } from "../systems/inviteGenerator.js";
import { primeInviteCaches } from "../systems/inviteLogs.js";
import { ensureTermsAgreementMessage } from "../systems/termsAgreement.js";
import { ensureVerificationMessage } from "../systems/verification.js";
import { logger } from "../utils/logger.js";

const env = loadEnv();

const event: EventDefinition = {
  name: "ready",
  once: true,
  async execute(client) {
    logger.info({ user: client.user?.tag, id: client.user?.id }, "Bot ready");
    await ensureBotApplicationOwnerLoaded(client).catch((error) => {
      logger.error({ err: error }, "Failed to load Discord application owner");
    });

    await getBotControlSettings()
      .then((settings) => applyBotPresence(client, settings))
      .catch((error) => {
        logger.error({ err: error }, "Failed to restore bot presence");
      });

    await ensureVerificationMessage(client, env).catch((error) => {
      logger.error({ err: error }, "Failed to ensure verification message");
    });

    await ensureInviteGeneratorMessage(client, env).catch((error) => {
      logger.error({ err: error }, "Failed to ensure invite generator message");
    });

    await ensureTermsAgreementMessage(client, env).catch((error) => {
      logger.error({ err: error }, "Failed to ensure terms agreement message");
    });

    await primeInviteCaches(client).catch((error) => {
      logger.error({ err: error }, "Failed to prime invite cache");
    });
  }
};

export default event;
