import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { pickRandom } from "../../../utils/math.js";

const jokes = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "A SQL query walks into a bar, walks up to two tables, and asks: 'Can I join you?'",
  "There are 10 kinds of people: those who understand binary and those who don't."
];

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("joke").setDescription("Tell a random joke"),
  module: "fun",
  cooldownSec: 3,
  async execute({ interaction }) {
    await interaction.reply({ content: pickRandom(jokes) });
  }
};

export default command;
