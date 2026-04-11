import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type GuildMember, type VoiceBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("movevc")
    .setDescription("Move everyone from one voice channel to another")
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addChannelOption((option) =>
      option
        .setName("source_vc")
        .setDescription("Voice channel to move members from")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    )
    .addChannelOption((option) =>
      option
        .setName("target_vc")
        .setDescription("Voice channel to move members to")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),
  module: "utility",
  userPerms: [PermissionFlagsBits.MoveMembers],
  botPerms: [PermissionFlagsBits.MoveMembers],
  cooldownSec: 3,
  async execute({ interaction }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const source = interaction.options.getChannel("source_vc", true);
    const target = interaction.options.getChannel("target_vc", true);

    if (
      (source.type !== ChannelType.GuildVoice && source.type !== ChannelType.GuildStageVoice) ||
      (target.type !== ChannelType.GuildVoice && target.type !== ChannelType.GuildStageVoice)
    ) {
      await replyError(interaction, "Invalid Channel", "Both source and target must be voice channels.");
      return;
    }

    if (source.id === target.id) {
      await replyError(interaction, "Invalid Channels", "Source and target voice channels must be different.");
      return;
    }

    const sourceVoice = source as VoiceBasedChannel;
    const targetVoice = target as VoiceBasedChannel;

    const membersToMove = sourceVoice.members
      .filter((member) => member.voice.channelId === sourceVoice.id)
      .map((member) => member as GuildMember);

    if (membersToMove.length === 0) {
      await replyError(interaction, "No Members", "There are no members in the selected source voice channel.");
      return;
    }

    let movedCount = 0;
    let failedCount = 0;

    for (const member of membersToMove) {
      try {
        await member.voice.setChannel(targetVoice, `Bulk moved by ${interaction.user.tag}`);
        movedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    if (movedCount === 0) {
      await replyError(
        interaction,
        "Move Failed",
        "I could not move any members. Check role hierarchy and channel permissions."
      );
      return;
    }

    await replySuccess(
      interaction,
      "Voice Members Moved",
      `Moved **${movedCount}** member(s) from **${sourceVoice.name}** to **${targetVoice.name}**.${
        failedCount > 0 ? ` Failed to move **${failedCount}** member(s).` : ""
      }`
    );
  }
};

export default command;
