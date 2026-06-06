import { SlashCommandBuilder } from "discord.js";
import { loadEnv } from "../../../config/env.js";
import type { CommandDefinition } from "../../../core/types.js";
import { handleAppealCommand } from "../../../systems/banAppeals.js";

const env = loadEnv();

const command: CommandDefinition = {
  data: new SlashCommandBuilder().setName("appeal").setDescription("Submit a private ban appeal"),
  module: "moderation",
  cooldownSec: 300,
  async execute({ interaction }) {
    await handleAppealCommand(interaction, env);
  }
};

export default command;
