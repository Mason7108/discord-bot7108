import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { pickRandom } from "../../../utils/math.js";

const memeLinks = [
  "https://i.imgur.com/W3duR07.png",
  "https://i.imgur.com/U9bP6vT.png",
  "https://i.imgur.com/Gn7xA8U.jpeg"
];

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("meme").setDescription("Send a random meme"),
  module: "fun",
  cooldownSec: 3,
  async execute({ interaction }) {
    await interaction.reply({ content: pickRandom(memeLinks) });
  }
};

export default command;
