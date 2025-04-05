import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { getMappingsForDiscordChannel } from "../../../bridge";

export const data = new SlashCommandBuilder()
    .setName('server')
    .setDescription('Provides information about the server, channel and bridge status');

export const execute = async (interaction: CommandInteraction) => {
    const channelId = interaction.channelId;

    // Server and channel information
    let responseMessage =
        `Server Information:\n` +
        `• Server Name: ${interaction.guild?.name}\n` +
        `• Total Members: ${interaction.guild?.memberCount}\n` +
        `• Current Channel ID: ${channelId}\n\n`;

    // Bridge status information
    const telegramChatIds = getMappingsForDiscordChannel(channelId);

    if (telegramChatIds.length === 0) {
        responseMessage += `Bridge Status: This channel is not forwarding messages to any Telegram chats.`;
    } else {
        const chatsList = telegramChatIds.map(id => `  • Telegram chat ID ${id}`).join('\n');
        responseMessage += `Bridge Status: This channel is forwarding messages to the following Telegram chats:\n${chatsList}`;
    }

    await interaction.reply(responseMessage);
};