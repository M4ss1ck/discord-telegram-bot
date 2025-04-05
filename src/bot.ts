import TelegramBot from './telegram/bot';
import DiscordClient from './discord/client';
import './bridge'; // Import the bridge module we'll create
import { deployCommands } from './deploy-commands';
import { initRedditService } from './services/redditService';

// Deploy Discord commands first, then start the bots
async function init() {
    try {
        // First deploy Discord commands
        console.log('Deploying Discord commands...');
        const success = await deployCommands();
        if (success) {
            console.log('Discord commands deployed successfully');
        } else {
            console.warn('Failed to deploy Discord commands, but continuing with bot startup');
        }

        // Then start the bots
        console.log('Starting bots...');

        // Start Telegram bot
        await TelegramBot.launch();
        console.log('Telegram bot started');

        // Discord client is initialized in the client.ts file
        console.log('Discord bot started');

        // Initialize Reddit subscription service
        await initRedditService();
        console.log('Reddit subscription service started');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Run initialization
init().catch(error => {
    console.error('Failed to initialize:', error);
    process.exit(1);
});