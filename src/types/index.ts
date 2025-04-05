export interface ChannelUpdate {
    id: string;
    name: string;
    type: string;
    position: number;
    parentId?: string;
}

export interface TelegramMessage {
    chatId: string;
    text: string;
}