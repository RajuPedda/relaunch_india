import { EVENT_SOURCE, newId, nowIso, type DomainEvent, type EventName } from '@relaunch/shared';

type Handler = (event: DomainEvent<any>) => Promise<void> | void;

/**
 * In-process stand-in for an EventBridge bus. Rules are name -> handlers, same
 * routing model as EventBridge `detail-type` rules targeting Lambdas.
 * Handler failures are captured, never thrown back at the publisher.
 */
export class EventBus {
  private rules = new Map<EventName, Handler[]>();
  readonly log: DomainEvent[] = [];
  readonly failures: { event: DomainEvent; error: string }[] = [];

  on(name: EventName, handler: Handler): void {
    const list = this.rules.get(name) ?? [];
    list.push(handler);
    this.rules.set(name, list);
  }

  async publish<T extends Record<string, unknown>>(name: EventName, detail: T): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = { id: newId('evt'), source: EVENT_SOURCE, name, detail, at: nowIso() };
    this.log.push(event);
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
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
