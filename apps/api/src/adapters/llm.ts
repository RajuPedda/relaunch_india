import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from './config.js';

export interface ModelCall {
  system: string;
  prompt: string;
  /** Feeds the cost line in the pilot report. */
  purpose: string;
  maxTokens?: number;
}

export interface ModelResult {
  text: string;
  modelId: string;
  costUsd: number;
  /** Low confidence routes the finding to a human reviewer. */
  confidence: number;
}

export interface Model {
  readonly id: string;
  complete(call: ModelCall): Promise<ModelResult>;
}

/**
 * Offline stand-in. Deterministic, so the demo is reproducible and runs with no
 * AWS account. It returns no analysis: when this model is in use, the rubric
 * scores come from the automated checks alone, which the findings say.
 */
export class LocalHeuristicModel implements Model {
  readonly id = 'local-heuristic-v1';
  async complete(call: ModelCall): Promise<ModelResult> {
    return { text: '', modelId: this.id, costUsd: 0, confidence: 0.82 };
  }
}

/** Per-1K-token rates, overridable, used only to report cost beside effort. */
const INPUT_USD_PER_1K = Number(process.env.BEDROCK_INPUT_USD_PER_1K ?? 0.003);
const OUTPUT_USD_PER_1K = Number(process.env.BEDROCK_OUTPUT_USD_PER_1K ?? 0.015);

export class BedrockModel implements Model {
  readonly id = config.aws.bedrockModelId;
  private client = new BedrockRuntimeClient({ region: config.aws.region });

  async complete(call: ModelCall): Promise<ModelResult> {
    try {
      const response = await this.client.send(new InvokeModelCommand({
        modelId: this.id,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: call.maxTokens ?? 1500,
          temperature: 0,
          system: call.system,
          messages: [{ role: 'user', content: [{ type: 'text', text: call.prompt }] }],
        }),
      }));

      const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        stop_reason?: string;
      };
      const text = (payload.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      const costUsd =
        ((payload.usage?.input_tokens ?? 0) / 1000) * INPUT_USD_PER_1K +
        ((payload.usage?.output_tokens ?? 0) / 1000) * OUTPUT_USD_PER_1K;

      return {
        text,
        modelId: this.id,
        costUsd: Math.round(costUsd * 100000) / 100000,
        // A truncated answer is not a confident one.
        confidence: payload.stop_reason === 'max_tokens' ? 0.5 : 0.85,
      };
    } catch (error) {
      // Falling back is safer than failing: the automated checks still run, and
      // the finding is marked for human review because confidence is low.
      console.warn(`Bedrock call failed (${call.purpose}): ${error instanceof Error ? error.message : error}`);
      return { text: '', modelId: `${this.id} (unavailable)`, costUsd: 0, confidence: 0 };
    }
  }
}

export function createModel(): Model {
  return config.model === 'bedrock' ? new BedrockModel() : new LocalHeuristicModel();
}

export const model = createModel();
