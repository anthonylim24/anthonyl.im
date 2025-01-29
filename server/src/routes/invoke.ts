import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming'

import { OpenAI } from 'openai';
import Groq from 'groq-sdk'
import { config } from '../config';
import { InvokeRequest } from '../types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { commonConfig } from './constants'

const invoke = new Hono();

const openai = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: config.deepseekApiBaseUrl
});

const invokeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
});

invoke.post(
  '/',
  zValidator('json', invokeSchema),
  async (c) => {
    console.log('Received invoke request:', c.req.json());
    console.log(config.deepseekApiKey, config.deepseekApiBaseUrl)
    const { prompt } = await c.req.json<InvokeRequest>();

    const completion = await openai.chat.completions.create({
      stream: true,
      messages: [{ role: 'user', content: prompt }, { role: "system", content: "You are a helpful assistant." }],
      ...commonConfig
    });

    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          await stream.writeSSE({
            data: content
          });
        }
        await stream.writeSSE({
          data: '[DONE]',
        });
      } catch (error) {
        console.error('Streaming error:', error);
        await stream.writeSSE({
          data: JSON.stringify({ error: 'Streaming error occurred' }),
        });
      }
    });
  }
);

invoke.get(
  '/',
  async (c) => {
    const prompt = c.req.query('prompt');
    
    if (!prompt) {
      return c.json({ error: 'Prompt is required' }, 400);
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        },
      ],
      model: "deepseek-r1-distill-llama-70b",
      stream: true
    });

    // const completion = await openai.chat.completions.create({
    //   stream: true,
    //   messages: [{ role: 'user', content: prompt },  { role: "system", content: "You are a helpful assistant." }],
    //   ...commonConfig
    // });

    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          await stream.writeSSE({
            data: content
          });
        }
        await stream.writeSSE({
          data: '[DONE]'
        });
      } catch (error) {
        console.error('Streaming error:', error);
        await stream.writeSSE({
          data: JSON.stringify({ error: 'Streaming error occurred' })
        });
      }
    });
  }
);

export default invoke;
