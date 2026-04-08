import { Colors, EmbedBuilder } from "discord.js";

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Green).setTitle(title).setDescription(description).setTimestamp();
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Red).setTitle(title).setDescription(description).setTimestamp();
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Blurple).setTitle(title).setDescription(description).setTimestamp();
}

export function warningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Orange).setTitle(title).setDescription(description).setTimestamp();
}
