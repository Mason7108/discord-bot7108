import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { claimWork } from "../../../core/services/userProfileService.js";
import { warningEmbed } from "../../../utils/embeds.js";
import { msToHuman } from "../../../utils/time.js";
import { replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("work").setDescription("Work to earn coins"),
  module: "economy",
  cooldownSec: 3,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Guild-only command.", ephemeral: true });
      return;
    }

    const result = await claimWork(interaction.guildId, interaction.user.id);

    if (!result.ok) {
      await interaction.reply({
        embeds: [warningEmbed("Work Cooldown", `Try again in ${msToHuman(result.msRemaining)}.`)],
        ephemeral: true
      });
      return;
    }

    await replySuccess(interaction, "Work Complete", `You earned **${result.awarded}** coins. Balance: **${result.balance}** coins.`);
  }
};

export default command;
