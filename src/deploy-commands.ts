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
    console.log('Loading commands for deployment...');
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Current file directory: ${__dirname}`);

    // Get the base path - could be either src/ or dist/ depending on environment
    // We'll search in both possible locations
    const possibleBasePaths = [
        path.join(process.cwd(), 'dist'), // For production (compiled JS)
        process.cwd(),                    // For direct node execution with ts-node
        __dirname                         // For development
    ];

    // Try each possible base path until we find command files
    for (const basePath of possibleBasePaths) {
        console.log(`Trying to load commands from base path: ${basePath}`);

        // Try both possible command paths
        const possibleCommandPaths = [
            path.join(basePath, 'discord', 'commands'),
            path.join(basePath, 'src', 'discord', 'commands'),
        ];

        for (const commandsPath of possibleCommandPaths) {
            // Skip if the directory doesn't exist
            if (!fs.existsSync(commandsPath)) {
                console.log(`Path does not exist: ${commandsPath}`);
                continue;
            }

            console.log(`Found commands directory: ${commandsPath}`);
            const commandFolders = fs.readdirSync(commandsPath);

            let foundCommands = false;

            for (const folder of commandFolders) {
                const folderPath = path.join(commandsPath, folder);

                // Skip if not a directory
                if (!fs.statSync(folderPath).isDirectory()) {
                    continue;
                }

                console.log(`Processing command category: ${folder}`);

                // Try both file extensions
                for (const extension of ['.js', '.ts']) {
                    const commandFiles = fs.readdirSync(folderPath).filter(file =>
                        file.endsWith(extension)
                    );

                    if (commandFiles.length > 0) {
                        console.log(`Found ${commandFiles.length} ${extension} command files in ${folder}`);
                    }

                    // Process each command file
                    for (const file of commandFiles) {
                        const filePath = path.join(folderPath, file);
                        console.log(`Loading command file: ${filePath}`);

                        try {
                            let command;

                            if (extension === '.js') {
                                // For .js files, use require
                                command = require(filePath);
                            } else {
                                // For .ts files, use dynamic import
                                const fileUrl = `file://${filePath}`;
                                command = await import(fileUrl);
                            }

                            if ('data' in command && 'execute' in command) {
                                commands.push(command.data.toJSON());
                                console.log(`✅ Loaded command: ${command.data.name}`);
                                foundCommands = true;
                            } else {
                                console.log(`⚠️ The command at ${filePath} is missing a required "data" or "execute" property.`);
                            }
                        } catch (error) {
                            console.error(`❌ Error importing command at ${filePath}:`, error);
                        }
                    }
                }
            }

            // If we found and loaded commands from this path, save the path and print it
            if (foundCommands) {
                console.log(`Found and loaded ${commands.length} commands from ${commandsPath}`);

                // Write the found command path to a file so client.ts can find it
                const cmdPathFile = path.join(process.cwd(), 'command-path.txt');
                try {
                    fs.writeFileSync(cmdPathFile, commandsPath);
                    console.log(`Saved command path to ${cmdPathFile}`);
                } catch (error) {
                    console.error(`Failed to save command path: ${error}`);
                }

                break;
            }
        }

        // If we found commands, no need to check other base paths
        if (commands.length > 0) {
            break;
        }
    }
};

// Main function to deploy commands
export const deployCommands = async () => {
    try {
        // First load all commands
        await loadCommands();

        if (commands.length === 0) {
            console.error('❌ No commands found! Deployment aborted.');
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

// Only run the deployment directly if this file is being executed directly (not imported)
if (require.main === module) {
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
}