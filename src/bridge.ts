import { Message, TextChannel } from 'discord.js';
import { Context } from 'telegraf';
import { Message as TelegramMessage } from 'telegraf/typings/core/types/typegram';
import DiscordClient from './discord/client';
import TelegramBot from './telegram/bot';

// Simple in-memory storage for channel mappings
// In a production app, this should be stored in a database
interface ChannelMapping {
    discordChannelId: string;
    telegramChatId: number;
}

// Array to store mappings between Discord channels and Telegram chats
const channelMappings: ChannelMapping[] = [];

// Function to add a new mapping
export function addChannelMapping(discordChannelId: string, telegramChatId: number) {
    // Check if mapping already exists
    const existingMapping = channelMappings.find(
        mapping => mapping.discordChannelId === discordChannelId && mapping.telegramChatId === telegramChatId
    );

    if (!existingMapping) {
        channelMappings.push({ discordChannelId, telegramChatId });
        return true;
    }

    return false;
}

// Function to remove a mapping
export function removeChannelMapping(discordChannelId: string, telegramChatId: number) {
    const initialLength = channelMappings.length;
    const newMappings = channelMappings.filter(
        mapping => !(mapping.discordChannelId === discordChannelId && mapping.telegramChatId === telegramChatId)
    );

    // Update the array
    channelMappings.length = 0;
    channelMappings.push(...newMappings);

    return channelMappings.length !== initialLength;
}

// Function to get all mappings for a Discord channel
export function getMappingsForDiscordChannel(discordChannelId: string): number[] {
    return channelMappings
        .filter(mapping => mapping.discordChannelId === discordChannelId)
        .map(mapping => mapping.telegramChatId);
}

// Function to get all mappings for a Telegram chat
export function getMappingsForTelegramChat(telegramChatId: number): string[] {
    return channelMappings
        .filter(mapping => mapping.telegramChatId === telegramChatId)
        .map(mapping => mapping.discordChannelId);
}

// Function to list all mappings
export function getAllMappings(): ChannelMapping[] {
    return [...channelMappings];
}

// Handle Discord messages and forward them to Telegram
DiscordClient.on('messageCreate', async (message: Message) => {
    // Don't process messages from bots (including our own)
    if (message.author.bot) return;

    // Get the channel ID
    const channelId = message.channelId;

    // Find all Telegram chats this Discord channel is mapped to
    const telegramChatIds = getMappingsForDiscordChannel(channelId);

    if (telegramChatIds.length > 0) {
        // Format the message for Telegram using HTML parse mode
        let formattedMessage = '';

        // Check if we have access to message content
        if (message.content) {
            formattedMessage = `<b>${message.author.username}</b>: ${message.content}`;
        } else {
            formattedMessage = `<b>${message.author.username}</b>:`;
            console.log('Note: No access to message content. Enable MESSAGE CONTENT INTENT in Discord Developer Portal for full functionality.');
        }

        // Forward the message to all mapped Telegram chats
        for (const chatId of telegramChatIds) {
            try {
                // Use HTML parse mode to properly render bold text
                await TelegramBot.telegram.sendMessage(chatId, formattedMessage, { parse_mode: 'HTML' });

                // If there are attachments, send them too
                if (message.attachments.size > 0) {
                    message.attachments.forEach(async (attachment) => {
                        if (attachment.contentType?.startsWith('image/')) {
                            await TelegramBot.telegram.sendPhoto(chatId, attachment.url);
                        } else {
                            await TelegramBot.telegram.sendDocument(chatId, attachment.url);
                        }
                    });
                }
            } catch (error) {
                console.error(`Failed to forward message to Telegram chat ${chatId}:`, error);
            }
        }
    }
});

// Note: We've removed the Telegram-to-Discord message forwarding code
// since we only want one-way communication from Discord to Telegram

console.log('Bridge module initialized (one-way: Discord → Telegram)'); 