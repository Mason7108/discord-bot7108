import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { pickRandom } from "../../../utils/math.js";

const trivia = [
  {
    question: "What year was Discord released?",
    answer: "2015"
  },
  {
    question: "Which protocol does HTTPS secure?",
    answer: "HTTP"
  },
  {
    question: "What does RAM stand for?",
    answer: "Random Access Memory"
  }
];

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("trivia").setDescription("Get a random trivia question"),
  module: "fun",
  cooldownSec: 3,
  async execute({ interaction }) {
    const item = pickRandom(trivia);
    await interaction.reply({ content: `**Trivia:** ${item.question}\n**Answer:** ${item.answer}` });
  }
};

export default command;
