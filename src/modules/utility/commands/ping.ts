import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { infoEmbed } from "../../../utils/embeds.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  module: "utility",
  cooldownSec: 2,
  async execute({ client, interaction }) {
    const gatewayMs = Math.round(client.ws.ping);
    const reply = await interaction.reply({ embeds: [infoEmbed("Pong", "Measuring latency...")], fetchReply: true });
    const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply({
      embeds: [infoEmbed("Pong", `Gateway: **${gatewayMs}ms**\nRound-trip: **${roundTrip}ms**`)]
    });
  }
};

export default command;
