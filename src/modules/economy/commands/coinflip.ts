import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { addCoins, getOrCreateProfile, removeCoins } from "../../../core/services/userProfileService.js";
import { randomInt } from "../../../utils/math.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Bet on heads or tails")
    .addIntegerOption((option) => option.setName("amount").setDescription("Bet amount").setRequired(true).setMinValue(1))
    .addStringOption((option) =>
      option
        .setName("choice")
        .setDescription("Pick a side")
        .setRequired(true)
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })
    ),
  module: "economy",
  cooldownSec: 4,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const choice = interaction.options.getString("choice", true);
    const profile = await getOrCreateProfile(interaction.guildId, interaction.user.id);

    if (profile.coins < amount) {
      await replyError(interaction, "Insufficient Funds", "You do not have enough coins.");
      return;
    }

    const result = randomInt(0, 1) === 1 ? "heads" : "tails";

    if (choice === result) {
      await addCoins(interaction.guildId, interaction.user.id, amount);
      await replySuccess(interaction, "Coinflip Win", `Result: **${result}**. You won **${amount}** coins.`);
      return;
    }

    await removeCoins(interaction.guildId, interaction.user.id, amount);
    await replySuccess(interaction, "Coinflip Loss", `Result: **${result}**. You lost **${amount}** coins.`);
  }
};

export default command;
