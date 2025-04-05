import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { addChannelMapping, removeChannelMapping } from "../../../bridge";

export const data = new SlashCommandBuilder()
    .setName('bridge')
    .setDescription('Manage the Discord-to-Telegram bridge')
    .addSubcommand(subcommand =>
        subcommand
            .setName('link')
            .setDescription('Send messages from this Discord channel to a Telegram chat')
            .addStringOption(option =>
                option.setName('telegram_chat_id')
                    .setDescription('The Telegram chat ID to send messages to')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('unlink')
            .setDescription('Stop sending messages to a Telegram chat')
            .addStringOption(option =>
                option.setName('telegram_chat_id')
                    .setDescription('The Telegram chat ID to stop sending to')
                    .setRequired(true)));

export const execute = async (interaction: CommandInteraction) => {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (subcommand === 'link') {
        const telegramChatIdStr = interaction.options.getString('telegram_chat_id', true);
        const telegramChatId = parseInt(telegramChatIdStr, 10);

        if (isNaN(telegramChatId)) {
            await interaction.reply({ content: 'Invalid Telegram chat ID. Please provide a valid number.', ephemeral: true });
            return;
        }

        const added = await addChannelMapping(channelId, telegramChatId);

        if (added) {
            await interaction.reply(`Successfully connected this Discord channel to Telegram chat ID ${telegramChatId}. Messages from here will be forwarded to Telegram.`);
        } else {
            await interaction.reply({ content: `This channel is already sending messages to Telegram chat ID ${telegramChatId}`, ephemeral: true });
        }
    } else if (subcommand === 'unlink') {
        const telegramChatIdStr = interaction.options.getString('telegram_chat_id', true);
        const telegramChatId = parseInt(telegramChatIdStr, 10);

        if (isNaN(telegramChatId)) {
            await interaction.reply({ content: 'Invalid Telegram chat ID. Please provide a valid number.', ephemeral: true });
            return;
        }

        const removed = await removeChannelMapping(channelId, telegramChatId);

        if (removed) {
            await interaction.reply(`Successfully disconnected this Discord channel from Telegram chat ID ${telegramChatId}. Messages will no longer be forwarded.`);
        } else {
            await interaction.reply({ content: `This channel is not connected to Telegram chat ID ${telegramChatId}`, ephemeral: true });
        }
    }
}; 