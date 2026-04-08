import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { updateGuildSettings } from "../../../core/services/guildSettingsService.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure core bot settings")
    .addSubcommand((sub) =>
      sub
        .setName("modlog")
        .setDescription("Set moderation log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Text channel for moderation logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("ticketcategory")
        .setDescription("Set ticket category")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category channel for ticket channels")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("staffrole")
        .setDescription("Add or remove a ticket staff role")
        .addRoleOption((option) => option.setName("role").setDescription("Role to add/remove").setRequired(true))
        .addBooleanOption((option) => option.setName("remove").setDescription("Set true to remove role from staff list"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("rolepolicy")
        .setDescription("Configure role policy for Admin/Moderator/Helper")
        .addStringOption((option) =>
          option
            .setName("tier")
            .setDescription("Policy tier")
            .setRequired(true)
            .addChoices(
              { name: "Admin", value: "admin" },
              { name: "Moderator", value: "moderator" },
              { name: "Helper", value: "helper" }
            )
        )
        .addRoleOption((option) => option.setName("role").setDescription("Role to add or remove").setRequired(true))
        .addBooleanOption((option) => option.setName("remove").setDescription("Set true to remove role from selected tier"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("automod")
        .setDescription("Toggle common automod switches")
        .addStringOption((option) =>
          option
            .setName("setting")
            .setDescription("Which setting to update")
            .setRequired(true)
            .addChoices(
              { name: "enabled", value: "enabled" },
              { name: "linkFilter", value: "linkFilter" },
              { name: "capsFilter", value: "capsFilter" },
              { name: "antiSpam", value: "antiSpam" },
              { name: "antiRaid", value: "antiRaid" }
            )
        )
        .addBooleanOption((option) => option.setName("value").setDescription("Enable or disable").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("blacklist")
        .setDescription("Add or remove blacklist words")
        .addStringOption((option) => option.setName("word").setDescription("Word to add/remove").setRequired(true))
        .addBooleanOption((option) => option.setName("remove").setDescription("Set true to remove"))
    ),
  module: "admin",
  userPerms: [PermissionFlagsBits.Administrator],
  roleRequirement: "Admin",
  async execute({ interaction, settings }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "This command is only available in servers.");
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === "modlog") {
      const channel = interaction.options.getChannel("channel", true);
      await updateGuildSettings(interaction.guildId, { modLogChannelId: channel.id } as never);
      await replySuccess(interaction, "Config Updated", `Mod log channel set to ${channel}.`);
      return;
    }

    if (subcommand === "ticketcategory") {
      const category = interaction.options.getChannel("category", true);
      await updateGuildSettings(interaction.guildId, { ticketCategoryId: category.id } as never);
      await replySuccess(interaction, "Config Updated", `Ticket category set to ${category}.`);
      return;
    }

    if (subcommand === "staffrole") {
      const role = interaction.options.getRole("role", true);
      const remove = interaction.options.getBoolean("remove") ?? false;
      const nextRoles = new Set(settings.staffRoleIds);
      if (remove) {
        nextRoles.delete(role.id);
      } else {
        nextRoles.add(role.id);
      }

      await updateGuildSettings(interaction.guildId, { staffRoleIds: [...nextRoles] } as never);
      await replySuccess(interaction, "Config Updated", `Staff role list ${remove ? "updated (removed)" : "updated (added)"}: ${role}`);
      return;
    }

    if (subcommand === "rolepolicy") {
      const tier = interaction.options.getString("tier", true);
      const role = interaction.options.getRole("role", true);
      const remove = interaction.options.getBoolean("remove") ?? false;

      const policy = {
        adminRoleIds: [...settings.rolePolicy.adminRoleIds],
        moderatorRoleIds: [...settings.rolePolicy.moderatorRoleIds],
        helperRoleIds: [...settings.rolePolicy.helperRoleIds]
      };

      const targetKey = `${tier}RoleIds` as "adminRoleIds" | "moderatorRoleIds" | "helperRoleIds";
      const next = new Set(policy[targetKey]);

      if (remove) {
        next.delete(role.id);
      } else {
        next.add(role.id);
      }

      policy[targetKey] = [...next];

      await updateGuildSettings(interaction.guildId, { rolePolicy: policy } as never);
      await replySuccess(interaction, "Config Updated", `${tier} policy roles ${remove ? "removed" : "added"}: ${role}`);
      return;
    }

    if (subcommand === "automod") {
      const setting = interaction.options.getString("setting", true);
      const value = interaction.options.getBoolean("value", true);
      const automod = { ...settings.automod, [setting]: value };
      await updateGuildSettings(interaction.guildId, { automod } as never);
      await replySuccess(interaction, "Config Updated", `AutoMod setting **${setting}** is now **${value ? "enabled" : "disabled"}**.`);
      return;
    }

    if (subcommand === "blacklist") {
      const word = interaction.options.getString("word", true).toLowerCase().trim();
      const remove = interaction.options.getBoolean("remove") ?? false;
      const blacklist = new Set(settings.automod.blacklist);

      if (remove) {
        blacklist.delete(word);
      } else {
        blacklist.add(word);
      }

      await updateGuildSettings(interaction.guildId, {
        automod: {
          ...settings.automod,
          blacklist: [...blacklist]
        }
      } as never);

      await replySuccess(interaction, "Config Updated", `Blacklist ${remove ? "removed" : "added"}: **${word}**.`);
    }
  }
};

export default command;
