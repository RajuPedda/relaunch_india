/**
 * Event contract. Mirrors an EventBridge bus: `source` + `detail-type` + `detail`.
 * The local bus and the AWS bus publish exactly these shapes.
 */
export const EVENT_SOURCE = 'relaunch.india';

export type EventName =
  | 'job.published'
  | 'job.changed'
  | 'job.closed'
  | 'profile.registered'
  | 'profile.updated'
  | 'submission.received'
  | 'assessment.completed'
  | 'evidence.approved'
  | 'match.computed'
  | 'application.submitted'
  | 'application.updated'
  | 'notification.requested';

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  source: typeof EVENT_SOURCE;
  name: EventName;
  detail: T;
  at: string;
}

export interface JobPublished { jobId: string; orgId: string; termsVersion: number }
export interface JobChanged { jobId: string; orgId: string; termsVersion: number; changes: string[] }
export interface JobClosed { jobId: string; orgId: string }
export interface ProfileEvent { profileId: string }
export interface AssessmentCompleted { assessmentId: string; profileId: string; roleId: string }
export interface EvidenceApproved { profileId: string; competencyKeys: string[]; assessmentId: string }
export interface MatchComputed { jobId: string; profileId: string; matchId: string; material: boolean }
export interface ApplicationEvent { applicationId: string; jobId: string; profileId: string; orgId: string }
