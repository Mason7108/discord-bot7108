import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { addCoins, getOrCreateProfile, removeCoins } from "../../../core/services/userProfileService.js";
import { randomInt } from "../../../utils/math.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const GAMBLING_CHANNEL_ID = "1505055957653127239";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("gamble")
    .setDescription("Gamble coins with a simple 50/50")
    .addIntegerOption((option) => option.setName("amount").setDescription("Bet amount").setRequired(true).setMinValue(1)),
  module: "economy",
  cooldownSec: 5,
  async execute({ interaction, settings }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    if (interaction.channelId !== GAMBLING_CHANNEL_ID) {
      await replyError(interaction, "Wrong Channel", `The gamble command can only be used in <#${GAMBLING_CHANNEL_ID}>.");
      return;
    }

    if (!settings.gamblingEnabled) {
      await replyError(interaction, "Gambling Disabled", "Gambling is currently disabled in this server.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const profile = await getOrCreateProfile(interaction.guildId, interaction.user.id);

    if (profile.coins < amount) {
      await replyError(interaction, "Insufficient Funds", "You do not have enough coins.");
      return;
    }

    const won = randomInt(0, 1) === 1;
    if (won) {
      await addCoins(interaction.guildId, interaction.user.id, amount);
      await replySuccess(interaction, "You Won", `You won **${amount}** coins.`);
    } else {
      await removeCoins(interaction.guildId, interaction.user.id, amount);
      await replySuccess(interaction, "You Lost", `You lost **${amount}** coins.`);
    }
  }
};

export default command;