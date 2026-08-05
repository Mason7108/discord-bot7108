import { EmbedBuilder, type Role } from "discord.js";
import type { EventDefinition } from "../core/types.js";
import { getGuildSettings } from "../core/services/guildSettingsService.js";
import { sendModLog } from "../systems/logging.js";

const event: EventDefinition = {
  name: "roleUpdate",
  async execute(_client, rawOldRole, rawNewRole) {
    const oldRole = rawOldRole as Role;
    const newRole = rawNewRole as Role;
    const settings = await getGuildSettings(newRole.guild.id);

    const changes: string[] = [];
    if (oldRole.name !== newRole.name) {
      changes.push(`Name: ${oldRole.name} -> ${newRole.name}`);
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push(`Color: ${oldRole.hexColor} -> ${newRole.hexColor}`);
    }
    if (oldRole.position !== newRole.position) {
      changes.push(`Position: ${oldRole.position} -> ${newRole.position}`);
    }

    if (changes.length === 0) {
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Role Updated")
      .addFields(
        { name: "Role", value: `${newRole.name} (${newRole.id})` },
        { name: "Changes", value: changes.slice(0, 8).join("\n") }
      )
      .setTimestamp();

    await sendModLog(newRole.guild, settings, embed, "roleUpdates");
  }
};

export default event;
