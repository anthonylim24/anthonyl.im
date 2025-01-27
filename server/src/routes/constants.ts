import { OpenAI } from 'openai'

export const commonConfig: Pick<OpenAI.Chat.ChatCompletionCreateParams, 'model' | 'temperature' | 'max_tokens'> = {
    model: 'klusterai/Meta-Llama-3.3-70B-Instruct-Turbo',
    // model: 'deepseek-ai/DeepSeek-R1',
    temperature: 0.7,
    max_tokens: 1000,
}