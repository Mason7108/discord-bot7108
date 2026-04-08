import type { Client } from "discord.js";
import { REMINDER_SCAN_MS } from "../core/constants.js";
import { ReminderModel } from "../models/Reminder.js";

export function startReminderWatcher(client: Client): NodeJS.Timeout {
  return setInterval(async () => {
    const due = await ReminderModel.find({
      delivered: false,
      dueAt: { $lte: new Date() }
    })
      .sort({ dueAt: 1 })
      .limit(30);

    for (const reminder of due) {
      const guild = await client.guilds.fetch(reminder.guildId).catch(() => null);
      const channel = guild?.channels.cache.get(reminder.channelId);
      if (channel && channel.isTextBased()) {
        await channel.send({ content: `<@${reminder.userId}> reminder: ${reminder.text}` });
      }

      reminder.delivered = true;
      await reminder.save();
    }
  }, REMINDER_SCAN_MS);
}
