import { Message, TextChannel } from 'discord.js';
import { Context } from 'telegraf';
import { Message as TelegramMessage } from 'telegraf/typings/core/types/typegram';
import DiscordClient from './discord/client';
import TelegramBot from './telegram/bot';
import { createClient } from 'redis';

// Interface for channel mappings
interface ChannelMapping {
    discordChannelId: string;
    telegramChatId: number;
}

// Create Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({
    url: redisUrl
});

// Redis connection handling
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('ready', () => console.log('Redis Client Ready'));
redisClient.on('reconnecting', () => console.log('Redis Client Reconnecting'));

// Connect to Redis
(async () => {
    await redisClient.connect();
})().catch(err => {
    console.error('Failed to connect to Redis:', err);
});

// Redis keys
const MAPPINGS_KEY = 'discord_telegram_mappings';

// Function to add a new mapping
export async function addChannelMapping(discordChannelId: string, telegramChatId: number): Promise<boolean> {
    try {
        // Check if mapping already exists
        const mappings = await getAllMappings();
        const existingMapping = mappings.find(
            mapping => mapping.discordChannelId === discordChannelId && mapping.telegramChatId === telegramChatId
        );

        if (!existingMapping) {
            // Add new mapping
            mappings.push({ discordChannelId, telegramChatId });
            // Save to Redis
            await redisClient.set(MAPPINGS_KEY, JSON.stringify(mappings));
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error adding channel mapping:', error);
        return false;
    }
}

// Function to remove a mapping
export async function removeChannelMapping(discordChannelId: string, telegramChatId: number): Promise<boolean> {
    try {
        const mappings = await getAllMappings();
        const initialLength = mappings.length;

        // Filter out the mapping to remove
        const newMappings = mappings.filter(
            mapping => !(mapping.discordChannelId === discordChannelId && mapping.telegramChatId === telegramChatId)
        );

        // If mapping was found and removed
        if (initialLength !== newMappings.length) {
            await redisClient.set(MAPPINGS_KEY, JSON.stringify(newMappings));
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error removing channel mapping:', error);
        return false;
    }
}

// Function to get all mappings for a Discord channel
export async function getMappingsForDiscordChannel(discordChannelId: string): Promise<number[]> {
    try {
        const mappings = await getAllMappings();
        return mappings
            .filter(mapping => mapping.discordChannelId === discordChannelId)
            .map(mapping => mapping.telegramChatId);
    } catch (error) {
        console.error('Error getting mappings for Discord channel:', error);
        return [];
    }
}

// Function to get all mappings for a Telegram chat
export async function getMappingsForTelegramChat(telegramChatId: number): Promise<string[]> {
    try {
        const mappings = await getAllMappings();
        return mappings
            .filter(mapping => mapping.telegramChatId === telegramChatId)
            .map(mapping => mapping.discordChannelId);
    } catch (error) {
        console.error('Error getting mappings for Telegram chat:', error);
        return [];
    }
}

// Function to get all mappings
export async function getAllMappings(): Promise<ChannelMapping[]> {
    try {
        const data = await redisClient.get(MAPPINGS_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch (error) {
        console.error('Error getting all mappings:', error);
        return [];
    }
}

// Handle Discord messages and forward them to Telegram
DiscordClient.on('messageCreate', async (message: Message) => {
    // Don't process messages from bots (including our own)
    if (message.author.bot) return;

    // Get the channel ID
    const channelId = message.channelId;

    // Find all Telegram chats this Discord channel is mapped to
    const telegramChatIds = await getMappingsForDiscordChannel(channelId);

    if (telegramChatIds.length > 0) {
        // Format the message for Telegram using HTML parse mode
        let formattedMessage = '';

        // Get the display name (nickname) instead of username
        const displayName = message.member?.displayName || message.author.username;

        // Check if we have access to message content
        if (message.content) {
            formattedMessage = `<b>${displayName}</b>: ${message.content}`;
        } else {
            formattedMessage = `<b>${displayName}</b> sent a message`;
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