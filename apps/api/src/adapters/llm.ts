import { config } from './config.js';

export interface ModelCall {
  system: string;
  prompt: string;
  /** Feeds the cost line in the pilot report. */
  purpose: string;
}

export interface ModelResult {
  text: string;
  modelId: string;
  costUsd: number;
  /** Low confidence routes the finding to a human reviewer. */
  confidence: number;
}

export interface Model {
  complete(call: ModelCall): Promise<ModelResult>;
  readonly id: string;
}

/**
 * Offline stand-in for Bedrock. It is deliberately simple and deterministic so
 * the POC runs with no AWS account and no network, and so demo output is
 * reproducible. Every judgment it produces is still routed through the same
 * rubric, calibration and human-review path as a real model's.
 */
export class LocalHeuristicModel implements Model {
  readonly id = 'local-heuristic-v1';
  async complete(call: ModelCall): Promise<ModelResult> {
    return {
      text: `[${this.id}] ${call.purpose}`,
      modelId: this.id,
      costUsd: 0,
      confidence: 0.82,
    };
  }
}

/**
 * Bedrock client placeholder. Wiring: InvokeModel with
 * config.aws.bedrockModelId, or an AgentCore agent for the multi-step
 * role-intake conversation. Kept behind the same interface so no domain code
 * changes when it is switched on.
 */
export function createModel(): Model {
  if (config.backend === 'aws') {
    throw new Error('Bedrock client not wired in this POC. Set RELAUNCH_BACKEND=local.');
  }
  return new LocalHeuristicModel();
}

export const model = createModel();
