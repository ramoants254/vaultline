import { Engine } from 'json-rules-engine';

export interface FraudEvaluationResult {
  isSuspicious: boolean;
  ruleTriggered?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class FraudRulesEngine {
  private engine: Engine;

  constructor() {
    this.engine = new Engine();
    this.setupRules();
  }

  private setupRules() {
    // Rule 1: High Transaction Amount Threshold (>= $5,000)
    this.engine.addRule({
      conditions: {
        all: [
          {
            fact: 'amount',
            operator: 'greaterThanInclusive',
            value: 5000,
          },
        ],
      },
      event: {
        type: 'HIGH_AMOUNT_TRANSACTION',
        params: {
          severity: 'HIGH',
          message: 'Transaction amount exceeds safety threshold ($5,000)',
        },
      },
    });

    // Rule 2: High Velocity Transaction Spike (>= 3 transactions per 60 seconds)
    this.engine.addRule({
      conditions: {
        all: [
          {
            fact: 'velocityCount',
            operator: 'greaterThanInclusive',
            value: 3,
          },
        ],
      },
      event: {
        type: 'HIGH_VELOCITY_SPIKE',
        params: {
          severity: 'CRITICAL',
          message: 'Multiple transactions detected in rapid succession',
        },
      },
    });
  }

  async evaluateTransaction(facts: { amount: number; velocityCount: number }): Promise<FraudEvaluationResult> {
    const { events } = await this.engine.run(facts);

    if (events.length > 0) {
      const topEvent = events[0];
      return {
        isSuspicious: true,
        ruleTriggered: topEvent.type,
        severity: topEvent.params?.severity || 'HIGH',
      };
    }

    return { isSuspicious: false };
  }
}