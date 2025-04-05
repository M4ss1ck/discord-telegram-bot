import TelegramBot from './telegram/bot';
import DiscordClient from './discord/client';
import './bridge'; // Import the bridge module we'll create

// Start both bots
TelegramBot.launch().then(() => {
    console.log('Telegram bot started');
});

// Discord client is initialized in the client.ts file
console.log('Discord bot starting...');