import { Telegraf } from 'telegraf';
import { TG_TOKEN } from '../config';
import start from './middleware/start';
import bridge from './middleware/bridge';
import reddit from './middleware/reddit';

if (!TG_TOKEN) {
    throw new Error('BOT_TOKEN is required!');
}
const bot = new Telegraf(TG_TOKEN);

// Define the commands to be set
const commands = [
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help message' },
    { command: 'link', description: 'Link a Discord channel to this chat' },
    { command: 'unlink', description: 'Unlink a Discord channel from this chat' },
    { command: 'status', description: 'Show linked Discord channels' },
    { command: 'sub', description: 'Subscribe to a subreddit' },
    { command: 'unsub', description: 'Unsubscribe from a subreddit' },
    { command: 'subslist', description: 'List all subreddit subscriptions' },
    { command: 'latest', description: 'Get latest post from a subreddit' },
    { command: 'mappings', description: 'Show all active connections (admin only)' }
];

// Check current commands and set if needed
bot.telegram.getMyCommands()
    .then(currentCommands => {
        // Check if 'mappings' command exists in the current commands
        const hasMappingsCommand = currentCommands.some(cmd => cmd.command === 'mappings');

        if (!hasMappingsCommand) {
            // If 'mappings' doesn't exist, set all commands
            console.log('Setting bot commands as "mappings" command was not found');
            return bot.telegram.setMyCommands(commands)
                .then(() => {
                    console.log('Bot commands set successfully');
                });
        } else {
            console.log('Bot commands already set, skipping');
            return Promise.resolve();
        }
    })
    .catch(error => {
        console.error('Error checking or setting bot commands:', error);
    });

// Use middleware
bot.use(start);
bot.use(bridge);
bot.use(reddit);

// Add a catch-all message handler to forward messages to Discord
// (The actual forwarding logic is in the bridge.ts file)

export default bot;