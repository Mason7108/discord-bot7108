import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { randomInt } from "../../../utils/math.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a dice")
    .addIntegerOption((option) =>
      option
        .setName("sides")
        .setDescription("Dice sides")
        .setMinValue(2)
        .setMaxValue(1000)
    ),
  module: "fun",
  cooldownSec: 2,
  async execute({ interaction }) {
    const sides = interaction.options.getInteger("sides") ?? 6;
    const value = randomInt(1, sides);
    await interaction.reply({ content: `You rolled **${value}** (1-${sides}).` });
  }
};

export default command;
