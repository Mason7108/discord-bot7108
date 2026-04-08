import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { GiveawayEntryModel } from "../../../models/GiveawayEntry.js";
import { chooseWinners, finalizeGiveaway, giveawayRow } from "../../../systems/giveaways.js";
import { parseDurationToMs } from "../../../utils/time.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

async function findGiveawayByMessage(guildId: string, messageId: string) {
  return GiveawayEntryModel.findOne({ guildId, messageId });
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a giveaway")
        .addStringOption((option) =>
          option.setName("duration").setDescription("Duration e.g. 30m, 2h, 1d").setRequired(true)
        )
        .addStringOption((option) => option.setName("prize").setDescription("Prize description").setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName("winners")
            .setDescription("Number of winners")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End a giveaway immediately")
        .addStringOption((option) => option.setName("message_id").setDescription("Giveaway message ID").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Reroll winners for an ended giveaway")
        .addStringOption((option) => option.setName("message_id").setDescription("Giveaway message ID").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Mark a giveaway as deleted")
        .addStringOption((option) => option.setName("message_id").setDescription("Giveaway message ID").setRequired(true))
    ),
  module: "giveaways",
  userPerms: [PermissionFlagsBits.ManageGuild],
  roleRequirement: "Moderator",
  async execute({ client, interaction }) {
    if (!interaction.guildId || !interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await replyError(interaction, "Unavailable", "Guild text channel required.");
      return;
    }

    const channel = interaction.channel as GuildTextBasedChannel;
    const sub = interaction.options.getSubcommand(true);

    if (sub === "start") {
      const durationRaw = interaction.options.getString("duration", true);
      const prize = interaction.options.getString("prize", true);
      const winnerCount = interaction.options.getInteger("winners", true);
      const durationMs = parseDurationToMs(durationRaw);

      if (!durationMs || durationMs < 10_000) {
        await replyError(interaction, "Invalid Duration", "Use values like 30s, 10m, 2h, or 1d.");
        return;
      }

      const giveaway = await GiveawayEntryModel.create({
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: "pending",
        prize,
        winnerCount,
        endsAt: new Date(Date.now() + durationMs),
        entrants: [],
        status: "active",
        winners: []
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Giveaway Started")
        .setDescription(`Prize: **${prize}**\nWinners: **${winnerCount}**\nEnds: <t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>`)
        .setFooter({ text: `Hosted by ${interaction.user.tag}` })
        .setTimestamp();

      const message = await channel.send({
        embeds: [embed],
        components: [giveawayRow(String(giveaway._id))]
      });

      giveaway.messageId = message.id;
      await giveaway.save();

      await replySuccess(interaction, "Giveaway Started", "Giveaway message ID: " + message.id);
      return;
    }

    const messageId = interaction.options.getString("message_id", true);
    const giveaway = await findGiveawayByMessage(interaction.guildId, messageId);

    if (!giveaway) {
      await replyError(interaction, "Not Found", "No giveaway found for that message ID.");
      return;
    }

    if (sub === "end") {
      giveaway.endsAt = new Date();
      await giveaway.save();
      await finalizeGiveaway(client, String(giveaway._id));
      await replySuccess(interaction, "Giveaway Ended", "Giveaway has been ended manually.");
      return;
    }

    if (sub === "reroll") {
      if (giveaway.status !== "ended") {
        await replyError(interaction, "Invalid State", "You can only reroll ended giveaways.");
        return;
      }

      const winners = chooseWinners(giveaway.entrants, giveaway.winnerCount);
      giveaway.winners = winners;
      await giveaway.save();

      const winnerMentions = winners.length ? winners.map((id) => `<@${id}>`).join(", ") : "No entrants";
      await channel.send({ content: `Giveaway rerolled. New winner(s): ${winnerMentions}` });
      await replySuccess(interaction, "Giveaway Rerolled", `Winner(s): ${winnerMentions}`);
      return;
    }

    giveaway.status = "deleted";
    await giveaway.save();
    await replySuccess(interaction, "Giveaway Deleted", "Giveaway marked as deleted.");
  }
};

export default command;
