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

// Check if we're in production
const isProd = process.env.NODE_ENV === 'production';

// Load commands
const loadCommands = async () => {
    try {
        console.log(`Loading commands in ${isProd ? 'production' : 'development'} mode`);
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Current file directory: ${__dirname}`);

        // First try to read command path from the file created by deploy-commands.ts
        const cmdPathFile = path.join(process.cwd(), 'command-path.txt');
        if (fs.existsSync(cmdPathFile)) {
            try {
                const commandsPath = fs.readFileSync(cmdPathFile, 'utf-8').trim();
                console.log(`Found command path from file: ${commandsPath}`);

                // Use this exact path
                if (fs.existsSync(commandsPath)) {
                    return await loadCommandsFromPath(commandsPath);
                } else {
                    console.log(`Command path ${commandsPath} from file does not exist`);
                }
            } catch (error) {
                console.error(`Error reading command path file: ${error}`);
            }
        }

        // Try multiple possible paths to find command files
        const possibleBasePaths = [
            path.join(process.cwd(), 'dist'),  // For compiled JS in Docker
            process.cwd(),                      // Root directory
            __dirname,                          // Current directory
        ];

        for (const basePath of possibleBasePaths) {
            console.log(`Trying to load commands from base path: ${basePath}`);

            // Try both command path structures
            const possibleCommandPaths = [
                path.join(basePath, 'discord', 'commands'),   // For /dist/discord/commands
                path.join(basePath, 'src', 'discord', 'commands'), // For /src/discord/commands
            ];

            for (const commandsPath of possibleCommandPaths) {
                if (!fs.existsSync(commandsPath)) {
                    console.log(`Path does not exist: ${commandsPath}`);
                    continue;
                }

                if (await loadCommandsFromPath(commandsPath)) {
                    return true;
                }
            }
        }

        console.error('❌ CRITICAL: Could not find any command files in any location!');
        return false;
    } catch (error) {
        console.error('Error in loadCommands:', error);
        return false;
    }
};

// Helper function to load commands from a specific path
const loadCommandsFromPath = async (commandsPath: string): Promise<boolean> => {
    console.log(`Found commands directory: ${commandsPath}`);
    const commandFolders = fs.readdirSync(commandsPath);

    let commandsLoaded = false;

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) {
            continue;
        }

        console.log(`Processing command category: ${folder}`);

        // Try both file extensions
        for (const extension of ['.js', '.ts']) {
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith(extension));

            if (commandFiles.length > 0) {
                console.log(`Found ${commandFiles.length} ${extension} command files in ${folder}`);
            }

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                console.log(`Loading command file: ${filePath}`);

                try {
                    let command;

                    if (extension === '.js') {
                        command = require(filePath);
                    } else {
                        const fileUrl = `file://${filePath}`;
                        command = await import(fileUrl);
                    }

                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        console.log(`✅ Successfully registered command handler for: ${command.data.name}`);
                        commandsLoaded = true;
                    } else {
                        console.log(`⚠️ The command at ${filePath} is missing required properties`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command at ${filePath}:`, error);
                }
            }
        }
    }

    if (commandsLoaded) {
        console.log(`Successfully loaded commands from ${commandsPath}`);
        return true;
    }

    return false;
};

// Initialize bot
const initBot = async () => {
    // First load all commands
    await loadCommands();
    console.log(`Commands registered: ${client.commands.size}`);

    // When the client is ready, run this code (only once)
    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = (interaction.client as ExtendedClient).commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            console.log('Available commands:', Array.from(client.commands.keys()));
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