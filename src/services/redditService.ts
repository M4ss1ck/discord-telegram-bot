import Parser from 'rss-parser';
import TelegramBot from '../telegram/bot';
import { createClient } from 'redis';

// Extend Parser.Item to include the id property used in Reddit feeds
declare module 'rss-parser' {
    interface Item {
        id?: string;
    }
}

// Interfaces
interface Subscription {
    subreddit: string;
    chatId: string;
    lastChecked: Date;
    lastPostId?: string;
}

// Redis setup
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({
    url: redisUrl
});

// Redis keys
const REDDIT_SUBSCRIPTIONS_KEY = 'reddit_subscriptions';
const REDDIT_POLLING_STATE_KEY = 'reddit_polling_state';
const REDDIT_POLLING_QUEUE_KEY = 'reddit_polling_queue';

// Redis connection handling
redisClient.on('error', (err) => console.error('Reddit Service Redis Error:', err));
redisClient.on('connect', () => console.log('Reddit Service connected to Redis'));

// Connect to Redis
(async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
})().catch(err => {
    console.error('Reddit Service failed to connect to Redis:', err);
});

const parser = new Parser();

// Polling configuration
const POLLING_CONFIG = {
    baseInterval: 3 * 60 * 1000, // 3 minutes
    maxInterval: 30 * 60 * 1000, // 30 minutes
    backoffFactor: 2,
    maxRetries: 5
};

interface PollingState {
    lastPolled: Date;
    nextPoll: Date;
    retryCount: number;
    errorCount: number;
}

// Declare global variable for polling loop state
declare global {
    var pollingLoopRunning: boolean;
}

// Initialize global variable
global.pollingLoopRunning = false;

/**
 * Get all subscriptions from Redis
 */
async function getAllSubscriptions(): Promise<Map<string, Subscription[]>> {
    try {
        const data = await redisClient.get(REDDIT_SUBSCRIPTIONS_KEY);
        if (!data) return new Map();

        // Parse the stored JSON and convert it back to a Map
        const subscriptionsObj = JSON.parse(data);
        const subscriptionsMap = new Map<string, Subscription[]>();

        // Convert the plain objects back to Map entries with proper date objects
        Object.entries(subscriptionsObj).forEach(([key, value]) => {
            const subs = (value as Subscription[]).map(sub => ({
                ...sub,
                lastChecked: new Date(sub.lastChecked)
            }));
            subscriptionsMap.set(key, subs);
        });

        return subscriptionsMap;
    } catch (error) {
        console.error('Error getting Reddit subscriptions from Redis:', error);
        return new Map();
    }
}

/**
 * Save all subscriptions to Redis
 */
async function saveAllSubscriptions(subscriptions: Map<string, Subscription[]>): Promise<boolean> {
    try {
        // Convert Map to plain object for storage
        const subscriptionsObj: Record<string, Subscription[]> = {};
        subscriptions.forEach((value, key) => {
            subscriptionsObj[key] = value;
        });

        await redisClient.set(REDDIT_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptionsObj));
        return true;
    } catch (error) {
        console.error('Error saving Reddit subscriptions to Redis:', error);
        return false;
    }
}

/**
 * Subscribe to a subreddit
 */
export async function subscribeToSubreddit(subreddit: string, chatId: string): Promise<boolean> {
    // Normalize subreddit name
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    // Get current subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(normalizedSubreddit) || [];

    // Check if subscription already exists
    if (subs.some(sub => sub.chatId === chatId)) {
        return false;
    }

    // Add new subscription
    subs.push({
        subreddit: normalizedSubreddit,
        chatId,
        lastChecked: new Date()
    });

    // Update subscriptions map
    subscriptions.set(normalizedSubreddit, subs);

    // Save to Redis
    await saveAllSubscriptions(subscriptions);

    // Start polling if this is the first subscription
    if (subs.length === 1) {
        startPolling(normalizedSubreddit);
    }

    return true;
}

/**
 * Unsubscribe from a subreddit
 */
export async function unsubscribeFromSubreddit(subreddit: string, chatId: string): Promise<boolean> {
    // Normalize subreddit name
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    // Get current subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(normalizedSubreddit);
    if (!subs) {
        return false;
    }

    // Filter out the subscription
    const newSubs = subs.filter(sub => sub.chatId !== chatId);

    // Update subscriptions map
    if (newSubs.length === 0) {
        subscriptions.delete(normalizedSubreddit);

        // If there are no more subscriptions for this subreddit, we can stop polling
        if (global.pollingLoopRunning) {
            // Note: we can't actually stop the interval, but we'll just let it run
            // and it will exit early when it checks that there are no subscriptions
            global.pollingLoopRunning = false;
        }
    } else {
        subscriptions.set(normalizedSubreddit, newSubs);
    }

    // Save to Redis
    await saveAllSubscriptions(subscriptions);

    return true;
}

/**
 * List all subscriptions for a chat
 */
export async function listSubscriptions(chatId: string): Promise<string[]> {
    const chatSubs: string[] = [];

    // Get all subscriptions
    const subscriptions = await getAllSubscriptions();

    // Iterate through all subscriptions
    for (const [subreddit, subs] of subscriptions.entries()) {
        if (subs.some(sub => sub.chatId === chatId)) {
            chatSubs.push(subreddit);
        }
    }

    return chatSubs;
}

/**
 * Start polling for new posts
 */
async function startPolling(subreddit: string): Promise<void> {
    console.log(`Starting to poll r/${subreddit}`);

    // Initialize polling state in Redis
    const initialState: PollingState = {
        lastPolled: new Date(),
        nextPoll: new Date(Date.now() + POLLING_CONFIG.baseInterval),
        retryCount: 0,
        errorCount: 0
    };

    await redisClient.hSet(REDDIT_POLLING_STATE_KEY, subreddit, JSON.stringify(initialState));

    // Add to polling queue
    await redisClient.zAdd(REDDIT_POLLING_QUEUE_KEY, {
        score: Date.now(),
        value: subreddit
    });

    // Start the polling loop if not already running
    if (!global.pollingLoopRunning) {
        startPollingLoop();
    }
}

/**
 * Start the main polling loop
 */
function startPollingLoop(): void {
    if (global.pollingLoopRunning) return;

    global.pollingLoopRunning = true;
    console.log('Starting Reddit polling loop');

    const pollLoop = async () => {
        try {
            // Get all subreddits due for polling
            const now = Date.now();
            const dueSubreddits = await redisClient.zRangeByScore(
                REDDIT_POLLING_QUEUE_KEY,
                0,
                now
            );

            if (dueSubreddits.length > 0) {
                // Process each subreddit
                for (const subreddit of dueSubreddits) {
                    try {
                        await processSubredditPoll(subreddit);
                    } catch (error) {
                        console.error(`Error processing subreddit ${subreddit}:`, error);
                        await handlePollingError(subreddit, error);
                    }
                }
            }

            // Schedule next check
            setTimeout(pollLoop, 1000); // Check every second
        } catch (error) {
            console.error('Error in polling loop:', error);
            setTimeout(pollLoop, 5000); // Wait 5 seconds on error
        }
    };

    pollLoop();
}

/**
 * Process a single subreddit poll
 */
async function processSubredditPoll(subreddit: string): Promise<void> {
    // Get current state
    const stateStr = await redisClient.hGet(REDDIT_POLLING_STATE_KEY, subreddit);
    if (!stateStr) return;

    const state: PollingState = JSON.parse(stateStr);

    // Check if it's time to poll
    if (new Date(state.nextPoll) > new Date()) {
        return;
    }

    // Get subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(subreddit);
    if (!subs || subs.length === 0) {
        // No subscriptions, remove from polling
        await redisClient.hDel(REDDIT_POLLING_STATE_KEY, subreddit);
        await redisClient.zRem(REDDIT_POLLING_QUEUE_KEY, subreddit);
        return;
    }

    try {
        // Fetch the RSS feed
        const feed = await parser.parseURL(`https://www.reddit.com/r/${subreddit}/new/.rss`);

        if (!feed.items || feed.items.length === 0) {
            console.log(`No items found in the feed for r/${subreddit}`);
            await updatePollingState(subreddit, true);
            return;
        }

        // Process new posts
        const sortedItems = feed.items.sort((a, b) => {
            return new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime();
        });

        let needsSave = false;
        for (const sub of subs) {
            const newPosts = findNewPosts(sortedItems, sub);
            if (newPosts.length > 0) {
                await sendPostsToTelegram(newPosts, sub.chatId, subreddit);
                sub.lastChecked = new Date();
                if (newPosts[0].id) {
                    sub.lastPostId = newPosts[0].id;
                }
                needsSave = true;
            }
        }

        if (needsSave) {
            subscriptions.set(subreddit, subs);
            await saveAllSubscriptions(subscriptions);
        }

        // Update polling state on success
        await updatePollingState(subreddit, true);
    } catch (error) {
        throw error;
    }
}

/**
 * Update polling state after a poll attempt
 */
async function updatePollingState(subreddit: string, success: boolean): Promise<void> {
    const stateStr = await redisClient.hGet(REDDIT_POLLING_STATE_KEY, subreddit);
    if (!stateStr) return;

    const state: PollingState = JSON.parse(stateStr);
    const now = new Date();

    if (success) {
        // Reset error count and retry count on success
        state.errorCount = 0;
        state.retryCount = 0;
        state.lastPolled = now;
        state.nextPoll = new Date(now.getTime() + POLLING_CONFIG.baseInterval);
    } else {
        // Increment error count
        state.errorCount++;
        state.retryCount++;

        // Calculate next poll time with exponential backoff
        const backoffTime = Math.min(
            POLLING_CONFIG.baseInterval * Math.pow(POLLING_CONFIG.backoffFactor, state.retryCount),
            POLLING_CONFIG.maxInterval
        );
        state.nextPoll = new Date(now.getTime() + backoffTime);
    }

    // Save updated state
    await redisClient.hSet(REDDIT_POLLING_STATE_KEY, subreddit, JSON.stringify(state));

    // Update queue with new next poll time
    await redisClient.zAdd(REDDIT_POLLING_QUEUE_KEY, {
        score: state.nextPoll.getTime(),
        value: subreddit
    });
}

/**
 * Handle polling errors
 */
async function handlePollingError(subreddit: string, error: any): Promise<void> {
    console.error(`Error polling r/${subreddit}:`, error);

    // Update state with error
    await updatePollingState(subreddit, false);

    // If too many errors, remove from polling
    const stateStr = await redisClient.hGet(REDDIT_POLLING_STATE_KEY, subreddit);
    if (stateStr) {
        const state: PollingState = JSON.parse(stateStr);
        if (state.errorCount >= POLLING_CONFIG.maxRetries) {
            console.log(`Removing r/${subreddit} from polling due to too many errors`);
            await redisClient.hDel(REDDIT_POLLING_STATE_KEY, subreddit);
            await redisClient.zRem(REDDIT_POLLING_QUEUE_KEY, subreddit);
        }
    }
}

/**
 * Send posts to a Telegram chat
 */
async function sendPostsToTelegram(posts: Parser.Item[], chatId: string, subreddit: string): Promise<void> {
    try {
        // Send at most 5 posts to avoid spam
        const postsToSend = posts.slice(0, 5);

        for (const post of postsToSend) {
            const message = formatRedditPost(post, subreddit);
            await TelegramBot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
        }

        // If there are more than 5 posts, send a notice
        if (posts.length > 5) {
            // Escape the subreddit name for MarkdownV2
            const escapedSubreddit = escapeMarkdown(subreddit);

            await TelegramBot.telegram.sendMessage(
                chatId,
                `_${posts.length - 5} more posts not shown\\. Visit r/${escapedSubreddit} to see all\\._`,
                { parse_mode: 'MarkdownV2' }
            );
        }
    } catch (error) {
        console.error(`Error sending posts to Telegram chat ${chatId}:`, error);
    }
}

/**
 * Fetch the latest post from a subreddit
 */
export async function fetchLatestPost(subreddit: string): Promise<Parser.Item | null> {
    try {
        // Normalize subreddit name
        const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

        // Fetch the RSS feed
        const feed = await parser.parseURL(`https://www.reddit.com/r/${normalizedSubreddit}/new/.rss`);

        if (!feed.items || feed.items.length === 0) {
            return null;
        }

        // Sort items by date (newest first)
        const sortedItems = feed.items.sort((a, b) => {
            return new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime();
        });

        // Return the most recent post
        return sortedItems[0];
    } catch (error) {
        console.error(`Error fetching latest post from r/${subreddit}:`, error);
        return null;
    }
}

/**
 * Escape text for MarkdownV2 formatting
 */
export function escapeMarkdown(text: string): string {
    // Characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/([_*\[\]()~`>#+=|{}.!\\])/g, '\\$1');
}

/**
 * Format a Reddit post for sending to Telegram
 */
export function formatRedditPost(post: Parser.Item, subreddit: string): string {
    const title = post.title || 'No title';
    const link = post.link || '';
    const author = post.creator || 'unknown';

    // Escape Markdown special characters for MarkdownV2
    const escapedTitle = escapeMarkdown(title);
    const escapedSubreddit = escapeMarkdown(subreddit);
    const escapedAuthor = escapeMarkdown(author);
    // Links need special handling in MarkdownV2 - we may need to escape parentheses in links
    const escapedLink = escapeMarkdown(link);

    return `*New post in r/${escapedSubreddit}*\n` +
        `*${escapedTitle}*\n` +
        `Posted by u/${escapedAuthor}\n` +
        `${escapedLink}`;
}

/**
 * Find new posts for a subscription
 */
function findNewPosts(sortedItems: Parser.Item[], sub: Subscription): Parser.Item[] {
    let newPosts: Parser.Item[] = [];

    // If we have a last post ID, use that for comparison first
    if (sub.lastPostId) {
        // Get all posts until we hit the last seen post ID
        const postIds = new Set(sortedItems.map(item => item.id));
        // If the last post ID is not found at all, consider all posts as new (might have been deleted)
        if (!postIds.has(sub.lastPostId)) {
            console.log(`Last post ID ${sub.lastPostId} no longer found in feed. Considering posts as new.`);
            newPosts = sortedItems;
        } else {
            // Get posts until we hit the last seen post
            for (const item of sortedItems) {
                if (item.id === sub.lastPostId) break;
                newPosts.push(item);
            }
        }
    } else {
        // No last post ID, use date comparison as fallback
        newPosts = sortedItems.filter(item => {
            const itemDate = new Date(item.pubDate || '');
            return itemDate > sub.lastChecked;
        });
    }

    return newPosts;
}

/**
 * Initialize the service
 */
export async function initRedditService(): Promise<void> {
    console.log('Reddit subscription service initializing...');

    try {
        // Ensure Redis connection
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Get all subscriptions
        const subscriptions = await getAllSubscriptions();

        // Initialize polling state for existing subscriptions
        for (const [subreddit, subs] of subscriptions.entries()) {
            if (subs.length > 0) {
                // Initialize polling state if it doesn't exist
                const stateStr = await redisClient.hGet(REDDIT_POLLING_STATE_KEY, subreddit);
                if (!stateStr) {
                    const initialState: PollingState = {
                        lastPolled: new Date(),
                        nextPoll: new Date(Date.now() + POLLING_CONFIG.baseInterval),
                        retryCount: 0,
                        errorCount: 0
                    };
                    await redisClient.hSet(REDDIT_POLLING_STATE_KEY, subreddit, JSON.stringify(initialState));
                    await redisClient.zAdd(REDDIT_POLLING_QUEUE_KEY, {
                        score: Date.now(),
                        value: subreddit
                    });
                }
            }
        }

        // Start the polling loop
        if (!global.pollingLoopRunning) {
            startPollingLoop();
        }

        console.log(`Reddit subscription service initialized with ${subscriptions.size} subreddits being monitored`);
    } catch (error) {
        console.error('Error initializing Reddit subscription service:', error);
    }
} 