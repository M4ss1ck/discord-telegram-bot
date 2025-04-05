import { REST, Routes } from 'discord.js';
import { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } from './config';
import fs from 'node:fs';
import path from 'node:path';

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    throw new Error('DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID variables are required!');
}

// Properly type the commands array
const commands: any[] = [];

// Function to load all commands
const loadCommands = async () => {
    // Get the base path - could be either src/ or dist/ depending on environment
    // We'll search in both possible locations
    const possibleBasePaths = [
        path.join(process.cwd(), 'dist'), // For production (compiled JS)
        process.cwd(),                    // For direct node execution with ts-node
        __dirname                         // For development
    ];

    // Try each possible base path until we find command files
    for (const basePath of possibleBasePaths) {
        const foldersPath = path.join(basePath, 'discord/commands');

        // Skip if the directory doesn't exist
        if (!fs.existsSync(foldersPath)) {
            continue;
        }

        const commandFolders = fs.readdirSync(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);

            // Skip if not a directory
            if (!fs.statSync(commandsPath).isDirectory()) {
                continue;
            }

            // Look for both .js and .ts files
            const commandFiles = fs.readdirSync(commandsPath).filter(file =>
                file.endsWith('.js') || file.endsWith('.ts')
            );

            // Process each command file
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const fileExtension = path.extname(file);

                try {
                    let command;

                    if (fileExtension === '.js') {
                        // For .js files, use require
                        command = require(filePath);
                    } else {
                        // For .ts files, use dynamic import
                        const fileUrl = `file://${filePath}`;
                        command = await import(fileUrl);
                    }

                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                        console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                } catch (error) {
                    console.error(`Error importing command at ${filePath}:`, error);
                }
            }
        }

        // If we found and loaded commands from this path, no need to check other paths
        if (commands.length > 0) {
            console.log(`Found and loaded ${commands.length} commands from ${basePath}`);
            break;
        }
    }
};

// Main function to deploy commands
const deployCommands = async () => {
    try {
        // First load all commands
        await loadCommands();

        if (commands.length === 0) {
            console.error('No commands found! Deployment aborted.');
            return false;
        }

        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Create REST instance
        const rest = new REST().setToken(DISCORD_TOKEN);

        // Deploy commands
        const data = await rest.put(
            Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${(data as any)?.length} application (/) commands.`);
        return true;
    } catch (error) {
        console.error('Error deploying commands:', error);
        return false;
    }
};

// Run the deployment and explicitly exit after completion
deployCommands().then(success => {
    if (success) {
        console.log('Command deployment completed successfully.');
    } else {
        console.error('Command deployment completed with errors.');
        process.exitCode = 1;
    }
    // Force exit after a short delay to ensure all logs are flushed
    setTimeout(() => {
        process.exit();
    }, 100);
});