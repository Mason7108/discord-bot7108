import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { ReminderModel } from "../../../models/Reminder.js";
import { parseDurationToMs } from "../../../utils/time.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder")
    .addStringOption((option) =>
      option.setName("in").setDescription("Duration until reminder (e.g. 10m, 2h)").setRequired(true)
    )
    .addStringOption((option) => option.setName("text").setDescription("Reminder text").setRequired(true)),
  module: "utility",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guildId || !interaction.channelId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const durationRaw = interaction.options.getString("in", true);
    const text = interaction.options.getString("text", true);
    const durationMs = parseDurationToMs(durationRaw);

    if (!durationMs || durationMs < 5_000) {
      await replyError(interaction, "Invalid Duration", "Use values like 30s, 5m, 1h, 1d.");
      return;
    }

    const dueAt = new Date(Date.now() + durationMs);

    await ReminderModel.create({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      text,
      dueAt,
      delivered: false
    });

    await replySuccess(interaction, "Reminder Set", `I will remind you <t:${Math.floor(dueAt.getTime() / 1000)}:R>.`);
  }
};

export default command;
