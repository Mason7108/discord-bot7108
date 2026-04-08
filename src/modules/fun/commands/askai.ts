import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("askai")
    .setDescription("Ask the configured AI provider")
    .addStringOption((option) => option.setName("prompt").setDescription("Prompt text").setRequired(true)),
  module: "fun",
  cooldownSec: 6,
  async execute({ interaction }) {
    const prompt = interaction.options.getString("prompt", true);
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
      await replyError(
        interaction,
        "AI Disabled",
        "AI commands are disabled. Set `AI_API_KEY` to enable provider integration."
      );
      return;
    }

    await interaction.reply({
      content: `AI provider scaffolding is enabled, but provider wiring is intentionally minimal. Prompt received: ${prompt}`,
      ephemeral: true
    });
  }
};

export default command;
