// Require the necessary discord.js classes
import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import { DISCORD_TOKEN } from '../config';
import path from 'path';
import fs from 'fs';

// Extend the Client class to include the commands property
class ExtendedClient extends Client {
    commands: Collection<string, any>;

    constructor(options: any) {
        super(options);
        this.commands = new Collection();
    }
}

// client.commands is already initialized in the ExtendedClient constructor
const client = new ExtendedClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // MessageContent is now enabled in Discord Developer Portal
        GatewayIntentBits.MessageContent
    ]
});

// Promise to track when commands are loaded
const commandLoadingPromises: Promise<void>[] = [];

// Load commands
const loadCommands = async () => {
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                // Convert to file:// URL for import
                const fileUrl = `file://${filePath}`;

                // Create a promise for each command loading
                const commandPromise = import(fileUrl).then(command => {
                    // Set a new item in the Collection with the key as the command name and the value as the exported module
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                }).catch(error => {
                    console.error(`Error importing command at ${filePath}:`, error);
                });

                commandLoadingPromises.push(commandPromise);
            } catch (error) {
                console.error(`Error loading command at ${filePath}:`, error);
            }
        }
    }
};

// Initialize bot
const initBot = async () => {
    // First load all commands
    await loadCommands();

    // Wait for all commands to be loaded
    await Promise.all(commandLoadingPromises);
    console.log('All commands loaded');

    // When the client is ready, run this code (only once)
    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = (interaction.client as ExtendedClient).commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    });

    // Log in to Discord with your client's token
    client.login(DISCORD_TOKEN);
};

// Start the bot
initBot();

// Export the client so that it can be used in other files
export default client;