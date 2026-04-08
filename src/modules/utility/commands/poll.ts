import { EmbedBuilder, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a simple poll")
    .addStringOption((option) => option.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription("Comma-separated options (up to 10)")
        .setRequired(true)
    ),
  module: "utility",
  cooldownSec: 5,
  async execute({ interaction }) {
    const question = interaction.options.getString("question", true);
    const options = interaction.options
      .getString("options", true)
      .split(",")
      .map((opt) => opt.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (options.length < 2) {
      await replyError(interaction, "Invalid Poll", "Provide at least two options, separated by commas.");
      return;
    }

    if (!interaction.channel || interaction.channel.isDMBased()) {
      await replyError(interaction, "Unavailable", "Polls can only be created in guild text channels.");
      return;
    }

    const numbers = ["1??", "2??", "3??", "4??", "5??", "6??", "7??", "8??", "9??", "??"];

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Poll")
      .setDescription(question)
      .addFields(
        options.map((option, index) => ({
          name: `${numbers[index]} Option ${index + 1}`,
          value: option,
          inline: false
        }))
      )
      .setFooter({ text: `Started by ${interaction.user.tag}` })
      .setTimestamp();

    const channel = interaction.channel as GuildTextBasedChannel;
    const message = await channel.send({ embeds: [embed] });

    for (let index = 0; index < options.length; index += 1) {
      await message.react(numbers[index]);
    }

    await replySuccess(interaction, "Poll Created", "Your poll has been posted.", true);
  }
};

export default command;
