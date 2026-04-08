import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError } from "../../../utils/replies.js";
import { infoEmbed } from "../../../utils/embeds.js";

function safeMathEvaluate(expression: string): number {
  const cleaned = expression.replace(/\s+/g, "");
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
    throw new Error("Expression contains unsupported characters.");
  }

  // eslint-disable-next-line no-new-func
  const evaluator = new Function(`return (${cleaned});`);
  const result = evaluator();

  if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error("Expression produced an invalid result.");
  }

  return result;
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("math")
    .setDescription("Evaluate a simple math expression")
    .addStringOption((option) => option.setName("expression").setDescription("Example: (2+5)*4").setRequired(true)),
  module: "utility",
  cooldownSec: 2,
  async execute({ interaction }) {
    const expression = interaction.options.getString("expression", true);

    try {
      const result = safeMathEvaluate(expression);
      await interaction.reply({ embeds: [infoEmbed("Math Result", `\`${expression}\` = **${result}**`)] });
    } catch (error) {
      await replyError(interaction, "Math Error", (error as Error).message);
    }
  }
};

export default command;
