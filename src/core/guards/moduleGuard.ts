import type { CommandDefinition, GuildSettingsShape } from "../types.js";

export function isModuleEnabled(command: CommandDefinition, settings: GuildSettingsShape): boolean {
  return settings.modules[command.module];
}
