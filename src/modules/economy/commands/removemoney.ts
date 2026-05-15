import { SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import { removeCoins } from "../../../core/services/userProfileService.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const env = loadEnv();

function isOwnerUser(interaction: any): boolean {
  const ownerId = env.BOT_OWNER_ID?.trim();
  if (ownerId) {
    return interaction.user.id === ownerId;
  }

  return interaction.guild && interaction.user.id === interaction.guild.ownerId;
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("Owner-only: remove coins from a player")
    .addUserOption((option) => option.setName("user").setDescription("User to remove coins from").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Amount of coins to remove").setRequired(true).setMinValue(1)
    ),
  module: "economy",
  cooldownSec: 1,
  async execute({ interaction }) {
    if (!interaction.guildId || !interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    if (!isOwnerUser(interaction)) {
      await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.bot) {
      await replyError(interaction, "Invalid Target", "You cannot modify coins for bot accounts.");
      return;
    }

    const updated = await removeCoins(interaction.guildId, target.id, amount);
    await replySuccess(
      interaction,
      "Money Removed",
      `Removed **${amount}** coins from ${target}. New balance: **${updated.coins}**.`
    );
  }
};

export default command;
