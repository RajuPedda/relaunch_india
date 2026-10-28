import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { EVENT_SOURCE, newId, nowIso, type DomainEvent, type EventName } from '@relaunch/shared';
import { config } from './config.js';

type Handler = (event: DomainEvent<any>) => Promise<void> | void;

/**
 * Rules are name -> handlers, the same routing model as EventBridge rules on
 * `detail-type`.
 *
 * When EventBridge is configured, every event is ALSO put on the bus, so the
 * events are real and visible in CloudWatch — but the handlers still run in
 * process. That is deliberate: the Lambda targets that would consume the bus
 * are not deployed in this proof of concept, and an event with no consumer
 * would silently stop matches from being recomputed. Deploy the targets and the
 * in-process rules become the thing to remove.
 */
export class EventBus {
  private rules = new Map<EventName, Handler[]>();
  readonly log: DomainEvent[] = [];
  readonly failures: { event: DomainEvent; error: string }[] = [];
  private client = config.events === 'eventbridge'
    ? new EventBridgeClient({ region: config.aws.region })
    : undefined;

  on(name: EventName, handler: Handler): void {
    this.rules.set(name, [...(this.rules.get(name) ?? []), handler]);
  }

  async publish<T extends Record<string, unknown>>(name: EventName, detail: T): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = { id: newId('evt'), source: EVENT_SOURCE, name, detail, at: nowIso() };
    this.log.push(event);
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);

    if (this.client) {
      try {
        await this.client.send(new PutEventsCommand({
          Entries: [{
            EventBusName: config.aws.eventBus,
            Source: EVENT_SOURCE,
            DetailType: name,
            Detail: JSON.stringify(detail),
            Time: new Date(event.at),
          }],
        }));
      } catch (error) {
        // A bus that will not take the event must not stop the journey.
        this.failures.push({ event, error: error instanceof Error ? error.message : String(error) });
      }
    }

    for (const handler of this.rules.get(name) ?? []) {
      try {
        await handler(event);
      } catch (error) {
        this.failures.push({ event, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return event;
  }
}

export const bus = new EventBus();
