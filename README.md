# Discord-to-Telegram Bridge Bot

This project is a one-way bridge from Discord to Telegram, forwarding messages from Discord channels to Telegram chats. It allows you to connect Discord channels with Telegram chats for receiving Discord messages.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/discord-telegram-bot.git
   ```

2. Navigate to the project directory:

   ```
   cd discord-telegram-bot
   ```

3. Install the dependencies:

   ```
   npm install
   ```

4. Create a `.env` file in the root directory and add your Discord and Telegram bot tokens:

   ```
   DISCORD_TOKEN=your_discord_bot_token
   BOT_TOKEN=your_telegram_bot_token
   ADMIN_ID=your_telegram_user_id  # Optional, for admin commands
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_GUILD_ID=your_discord_guild_id  # For deploying commands
   ```

5. Configure Discord Bot Permissions:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your application
   - Go to the "Bot" tab
   - Under "Privileged Gateway Intents", enable "MESSAGE CONTENT INTENT"
   - This is required to read message content for forwarding to Telegram
   - Save your changes

## Usage

First, deploy the Discord slash commands:

```
npm run commands
```

Then, start the bot:

```
npm start
```

Or for development:

```
npm run dev
```

## Commands

### Telegram Commands

- `/start` - Start the bot
- `/help` - Show help message
- `/link <discord_channel_id>` - Receive messages from a Discord channel in this chat
- `/unlink <discord_channel_id>` - Stop receiving messages from a Discord channel
- `/status` - Show Discord channels linked to this chat
- `/mappings` - Show all mappings (admin only)

### Discord Commands

- `/bridge link <telegram_chat_id>` - Send messages from this Discord channel to a Telegram chat
- `/bridge unlink <telegram_chat_id>` - Stop sending messages to a Telegram chat
- `/bridge status` - Show Telegram chats receiving messages from this channel
- `/ping` - Check if the bot is running
- `/server` - Get info about the server

## Message Forwarding

Messages sent in Discord channels will be forwarded to their linked Telegram chats, including:

- Text messages
- Images and attachments

Note: This is a one-way bridge. Messages sent in Telegram will NOT be forwarded to Discord.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
