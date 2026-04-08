import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type VoiceBasedChannel } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { buildSplitButtons, createSplitSession } from "../../../systems/vcTeamRandomizer.js";
import { replyError } from "../../../utils/replies.js";

const MAX_TEAMS = 10;

function collectProvidedTargetChannels(interaction: any): VoiceBasedChannel[] {
  const channels: VoiceBasedChannel[] = [];

  for (let index = 1; index <= MAX_TEAMS; index += 1) {
    const optionName = `target_vc_${index}`;
    const channel = interaction.options.getChannel(optionName);

    if (!channel) {
      continue;
    }

    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
      continue;
    }

    if (!channels.find((item) => item.id === channel.id)) {
      channels.push(channel as VoiceBasedChannel);
    }
  }

  return channels;
}

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("splitvc")
    .setDescription("Randomly split users from one voice channel into teams")
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addChannelOption((option) =>
      option
        .setName("source_vc")
        .setDescription("Voice channel containing players")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    )
    .addIntegerOption((option) =>
      option
        .setName("team_count")
        .setDescription("How many teams to create")
        .setRequired(true)
        .setMinValue(2)
        .setMaxValue(MAX_TEAMS)
    )
    .addBooleanOption((option) =>
      option
        .setName("auto_create")
        .setDescription("Auto-create missing team voice channels (default: true when no target VCs provided)")
    )
    .addChannelOption((option) => option.setName("target_vc_1").setDescription("Target team voice channel 1").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_2").setDescription("Target team voice channel 2").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_3").setDescription("Target team voice channel 3").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_4").setDescription("Target team voice channel 4").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_5").setDescription("Target team voice channel 5").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_6").setDescription("Target team voice channel 6").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_7").setDescription("Target team voice channel 7").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_8").setDescription("Target team voice channel 8").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_9").setDescription("Target team voice channel 9").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addChannelOption((option) => option.setName("target_vc_10").setDescription("Target team voice channel 10").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)),
  module: "utility",
  userPerms: [PermissionFlagsBits.MoveMembers],
  botPerms: [PermissionFlagsBits.MoveMembers],
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guild) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const sourceChannel = interaction.options.getChannel("source_vc", true);
    if (sourceChannel.type !== ChannelType.GuildVoice && sourceChannel.type !== ChannelType.GuildStageVoice) {
      await replyError(interaction, "Invalid Source", "The source channel must be a voice channel.");
      return;
    }

    const teamCount = interaction.options.getInteger("team_count", true);
    const sourceVoiceChannel = sourceChannel as VoiceBasedChannel;

    const sourceMembers = sourceVoiceChannel.members.filter((member) => !member.user.bot).map((member) => member);

    if (sourceMembers.length === 0) {
      await replyError(interaction, "No Players", "No non-bot users are currently in the selected source VC.");
      return;
    }

    if (teamCount > sourceMembers.length) {
      await replyError(interaction, "Invalid Team Count", "Team count cannot be greater than the number of connected users.");
      return;
    }

    const providedTargets = collectProvidedTargetChannels(interaction);
    const autoCreate = interaction.options.getBoolean("auto_create") ?? providedTargets.length === 0;

    if (providedTargets.length < teamCount && !autoCreate) {
      await replyError(
        interaction,
        "Missing Target Channels",
        `Provide at least ${teamCount} target voice channels or enable auto_create.`
      );
      return;
    }

    if (autoCreate) {
      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyError(interaction, "Missing Permission", "I need ManageChannels to auto-create team channels.");
        return;
      }
    }

    const session = createSplitSession({
      guildId: interaction.guild.id,
      sourceChannelId: sourceVoiceChannel.id,
      hostUserId: interaction.user.id,
      teamCount,
      targetChannelIds: providedTargets.slice(0, teamCount).map((channel) => channel.id),
      autoCreate,
      memberIds: sourceMembers.map((member) => member.id)
    });

    await interaction.reply({
      content: `Ready to split ${sourceMembers.length} players into ${teamCount} teams.`,
      components: [buildSplitButtons(session.id)]
    });
  }
};

export default command;
