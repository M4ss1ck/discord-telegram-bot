import { Composer } from "telegraf";

const start = new Composer();

start.start((ctx) => ctx.reply('Welcome to the Discord-to-Telegram Bridge Bot! Use /help to see available commands.'));

start.help((ctx) => ctx.reply(
    'This bot forwards messages from Discord to Telegram (one-way bridge).\n\n' +
    'Available commands:\n\n' +
    '/start - Start the bot\n' +
    '/help - Show this help message\n' +
    '/link <discord_channel_id> - Receive messages from a Discord channel in this chat\n' +
    '/unlink <discord_channel_id> - Stop receiving messages from a Discord channel\n' +
    '/status - Show Discord channels linked to this chat'
));

export default start;