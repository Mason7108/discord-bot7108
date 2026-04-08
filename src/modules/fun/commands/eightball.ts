import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { pickRandom } from "../../../utils/math.js";

const responses = [
  "Yes.",
  "No.",
  "Ask again later.",
  "Definitely.",
  "Very unlikely.",
  "It is certain.",
  "Not looking good."
];

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("eightball")
    .setDescription("Ask the magic 8-ball")
    .addStringOption((option) => option.setName("question").setDescription("Your question").setRequired(true)),
  module: "fun",
  cooldownSec: 3,
  async execute({ interaction }) {
    const question = interaction.options.getString("question", true);
    await interaction.reply({ content: `?? **Q:** ${question}\n**A:** ${pickRandom(responses)}` });
  }
};

export default command;
