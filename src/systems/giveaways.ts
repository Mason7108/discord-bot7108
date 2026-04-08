import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type Client } from "discord.js";
import mongoose from "mongoose";
import { GiveawayEntryModel } from "../models/GiveawayEntry.js";
import { GIVEAWAY_SCAN_MS } from "../core/constants.js";
import { pickRandom } from "../utils/math.js";
import { logger } from "../utils/logger.js";

export function giveawayRow(giveawayId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_join:${giveawayId}`).setLabel("Join Giveaway").setStyle(ButtonStyle.Primary)
  );
}

export function chooseWinners(entrants: string[], winnerCount: number): string[] {
  const unique = [...new Set(entrants)];
  const winners: string[] = [];

  while (unique.length > 0 && winners.length < winnerCount) {
    const next = pickRandom(unique);
    winners.push(next);
    const index = unique.indexOf(next);
    unique.splice(index, 1);
  }

  return winners;
}

export async function handleGiveawayJoin(interaction: ButtonInteraction): Promise<void> {
  const [, giveawayId] = interaction.customId.split(":");
  const giveaway = await GiveawayEntryModel.findById(giveawayId);

  if (!giveaway || giveaway.status !== "active") {
    await interaction.reply({ content: "This giveaway is no longer active.", ephemeral: true });
    return;
  }

  if (!giveaway.entrants.includes(interaction.user.id)) {
    giveaway.entrants.push(interaction.user.id);
    await giveaway.save();
  }

  await interaction.reply({ content: "You have joined the giveaway.", ephemeral: true });
}

export async function finalizeGiveaway(client: Client, giveawayId: string): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const giveaway = await GiveawayEntryModel.findById(giveawayId).session(session);
      if (!giveaway || giveaway.status !== "active") {
        return;
      }

      const winners = chooseWinners(giveaway.entrants, giveaway.winnerCount);
      giveaway.status = "ended";
      giveaway.winners = winners;
      await giveaway.save({ session });

      const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
      const channel = guild?.channels.cache.get(giveaway.channelId);

      if (!channel?.isTextBased()) {
        return;
      }

      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (!message) {
        return;
      }

      const winnerText = winners.length
        ? winners.map((winnerId) => `<@${winnerId}>`).join(", ")
        : "No valid entrants";

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("Giveaway Ended")
        .setDescription(`Prize: **${giveaway.prize}**\nWinners: ${winnerText}`)
        .setTimestamp();

      await message.edit({ embeds: [embed], components: [] });
      await channel.send({ content: `Giveaway ended. Winners: ${winnerText}` });
    });
  } catch (error) {
    logger.error({ err: error, giveawayId }, "Failed to finalize giveaway");
  } finally {
    session.endSession();
  }
}

export function startGiveawayWatcher(client: Client): NodeJS.Timeout {
  return setInterval(async () => {
    const now = new Date();
    const dueGiveaways = await GiveawayEntryModel.find({
      status: "active",
      endsAt: { $lte: now }
    }).lean();

    for (const giveaway of dueGiveaways) {
      await finalizeGiveaway(client, String(giveaway._id));
    }
  }, GIVEAWAY_SCAN_MS);
}
