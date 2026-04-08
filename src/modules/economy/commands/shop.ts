import { SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "../../../core/types.js";
import { addItemToInventory, getOrCreateProfile, removeCoins } from "../../../core/services/userProfileService.js";
import { SHOP_ITEMS } from "../../../systems/shop.js";
import { infoEmbed } from "../../../utils/embeds.js";
import { replyError, replySuccess } from "../../../utils/replies.js";

const itemChoices = Object.keys(SHOP_ITEMS).map((item) => ({ name: `${item} (${SHOP_ITEMS[item]} coins)`, value: item }));

const command: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View or buy from the shop")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Item to buy")
        .addChoices(...itemChoices)
    ),
  module: "economy",
  cooldownSec: 2,
  async execute({ interaction }) {
    if (!interaction.guildId) {
      await replyError(interaction, "Unavailable", "Guild-only command.");
      return;
    }

    const item = interaction.options.getString("item");

    if (!item) {
      const listing = Object.entries(SHOP_ITEMS)
        .map(([name, price]) => `• **${name}**: ${price} coins`)
        .join("\n");

      await interaction.reply({ embeds: [infoEmbed("Shop", listing)] });
      return;
    }

    const price = SHOP_ITEMS[item];
    const profile = await getOrCreateProfile(interaction.guildId, interaction.user.id);

    if (profile.coins < price) {
      await replyError(interaction, "Insufficient Funds", `You need ${price} coins for **${item}**.`);
      return;
    }

    await removeCoins(interaction.guildId, interaction.user.id, price);
    await addItemToInventory(interaction.guildId, interaction.user.id, item);
    await replySuccess(interaction, "Purchase Complete", `You bought **${item}** for ${price} coins.`);
  }
};

export default command;
