import type { ChatInputCommandInteraction } from "discord.js";
import { errorEmbed, successEmbed } from "./embeds.js";

export async function replySuccess(interaction: ChatInputCommandInteraction, title: string, description: string, ephemeral = false) {
  const payload = { embeds: [successEmbed(title, description)], ephemeral };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

export async function replyError(interaction: ChatInputCommandInteraction, title: string, description: string, ephemeral = true) {
  const payload = { embeds: [errorEmbed(title, description)], ephemeral };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
