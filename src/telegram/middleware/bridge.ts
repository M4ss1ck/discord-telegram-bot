import { Composer } from "telegraf";
import { addChannelMapping, removeChannelMapping, getMappingsForTelegramChat, getAllMappings } from "../../bridge";
import DiscordClient from "../../discord/client";
import { TextChannel } from "discord.js";

const bridge = new Composer();

// Command to link a Discord channel with the current Telegram chat
bridge.command('link', async (ctx) => {
    // Check if there's a channel ID in the command
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
        return ctx.reply('Please provide a Discord channel ID: /link <discord_channel_id>');
    }

    const discordChannelId = args[0];
    const telegramChatId = ctx.chat.id;

    try {
        // Verify the Discord channel exists and is accessible
        const channel = await DiscordClient.channels.fetch(discordChannelId);

        if (!channel || !(channel instanceof TextChannel)) {
            return ctx.reply('Invalid Discord channel ID or the channel is not a text channel.');
        }

        // Add the mapping
        const added = addChannelMapping(discordChannelId, telegramChatId);

        if (added) {
            await ctx.reply(`Successfully connected to Discord channel #${channel.name}. Messages from that channel will be forwarded to this chat.`);
            // Notify the Discord channel as well
            await channel.send(`This channel will now forward messages to a Telegram chat.`);
        } else {
            await ctx.reply(`This chat is already receiving messages from Discord channel #${channel.name}`);
        }
    } catch (error) {
        console.error('Error linking channel:', error);
        await ctx.reply('Failed to connect to channel. Make sure the Discord channel ID is valid and the bot has access to it.');
    }
});

// Command to unlink a Discord channel from the current Telegram chat
bridge.command('unlink', async (ctx) => {
    // Check if there's a channel ID in the command
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
        return ctx.reply('Please provide a Discord channel ID: /unlink <discord_channel_id>');
    }

    const discordChannelId = args[0];
    const telegramChatId = ctx.chat.id;

    try {
        // Remove the mapping
        const removed = removeChannelMapping(discordChannelId, telegramChatId);

        if (removed) {
            await ctx.reply(`Successfully disconnected from Discord channel ID ${discordChannelId}. Messages will no longer be forwarded to this chat.`);

            // Try to notify the Discord channel if possible
            try {
                const channel = await DiscordClient.channels.fetch(discordChannelId);
                if (channel && channel instanceof TextChannel) {
                    await channel.send(`This channel will no longer forward messages to a Telegram chat.`);
                }
            } catch (e) {
                // If we can't notify the Discord channel, that's fine
                console.log(`Could not notify Discord channel ${discordChannelId} about unlinking`);
            }
        } else {
            await ctx.reply(`This chat is not connected to Discord channel ID ${discordChannelId}`);
        }
    } catch (error) {
        console.error('Error unlinking channel:', error);
        await ctx.reply('Failed to disconnect from channel.');
    }
});

// Command to show the status of the current Telegram chat
bridge.command('status', async (ctx) => {
    const telegramChatId = ctx.chat.id;

    // Get all Discord channels linked to this Telegram chat
    const discordChannelIds = getMappingsForTelegramChat(telegramChatId);

    if (discordChannelIds.length === 0) {
        return ctx.reply('This chat is not receiving messages from any Discord channels.');
    }

    let message = 'This chat is receiving messages from the following Discord channels:\n\n';

    for (const channelId of discordChannelIds) {
        try {
            const channel = await DiscordClient.channels.fetch(channelId);
            if (channel && channel instanceof TextChannel) {
                message += `- #${channel.name} (${channelId})\n`;
            } else {
                message += `- Unknown channel (${channelId})\n`;
            }
        } catch (e) {
            message += `- Inaccessible channel (${channelId})\n`;
        }
    }

    await ctx.reply(message);
});

// Admin command to show all mappings (requires ADMIN_ID from .env)
bridge.command('mappings', async (ctx) => {
    // Check if the user is an admin
    const ADMIN_ID = process.env.ADMIN_ID;

    if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID) {
        return; // Silently ignore if not admin
    }

    const allMappings = getAllMappings();

    if (allMappings.length === 0) {
        return ctx.reply('No active channel mappings.');
    }

    let message = 'All active forwarding connections:\n\n';

    for (const mapping of allMappings) {
        try {
            const channel = await DiscordClient.channels.fetch(mapping.discordChannelId);
            if (channel && channel instanceof TextChannel) {
                message += `- Discord #${channel.name} (${mapping.discordChannelId}) → Telegram chat ${mapping.telegramChatId}\n`;
            } else {
                message += `- Discord unknown (${mapping.discordChannelId}) → Telegram chat ${mapping.telegramChatId}\n`;
            }
        } catch (e) {
            message += `- Discord inaccessible (${mapping.discordChannelId}) → Telegram chat ${mapping.telegramChatId}\n`;
        }
    }

    await ctx.reply(message);
});

export default bridge; 