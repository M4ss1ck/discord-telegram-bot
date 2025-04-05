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
    // Grab all the command folders from the commands directory you created earlier
    const foldersPath = path.join(__dirname, 'discord/commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        // Grab all the command files from the commands directory you created earlier
        const commandsPath = path.join(foldersPath, folder);
        // Look for .ts files instead of .js files
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

        // Process each command file
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);

            try {
                // Convert to file:// URL for import
                const fileUrl = `file://${filePath}`;
                const command = await import(fileUrl);

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
};

// Main function to deploy commands
const deployCommands = async () => {
    try {
        // First load all commands
        await loadCommands();

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