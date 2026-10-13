import { Badge } from '@/components/ui/Feedback';
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSISTANCE_STATUS_LABELS,
  LEDGER_STATUS_LABELS,
  MEDIA_STATUS_LABELS,
  MESSAGE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  VOLUNTEER_STATUS_LABELS,
} from '@/lib/labels';
import type { Enums } from '@/types/database';

type Tone = 'neutral' | 'forest' | 'gold' | 'info' | 'success' | 'warning' | 'danger';

const assistanceTone: Record<Enums<'assistance_status'>, Tone> = {
  pending: 'gold',
  under_review: 'info',
  more_information_required: 'warning',
  approved: 'success',
  declined: 'neutral',
  assistance_provided: 'forest',
};
export function AssistanceStatusBadge({ status }: { status: Enums<'assistance_status'> }) {
  return <Badge tone={assistanceTone[status]}>{ASSISTANCE_STATUS_LABELS[status]}</Badge>;
}

const volunteerTone: Record<Enums<'volunteer_status'>, Tone> = {
  pending: 'gold',
  approved: 'info',
  active: 'success',
  inactive: 'neutral',
  declined: 'neutral',
};
export function VolunteerStatusBadge({ status }: { status: Enums<'volunteer_status'> }) {
  return <Badge tone={volunteerTone[status]}>{VOLUNTEER_STATUS_LABELS[status]}</Badge>;
}

export function AssignmentStatusBadge({ status }: { status: Enums<'assignment_status'> }) {
  const tone: Tone = status === 'confirmed' ? 'success' : status === 'completed' ? 'forest' : status === 'withdrawn' ? 'neutral' : 'info';
  return <Badge tone={tone}>{ASSIGNMENT_STATUS_LABELS[status]}</Badge>;
}

export function LedgerStatusBadge({ status }: { status: Enums<'ledger_status'> }) {
  const tone: Tone = status === 'verified' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
  return <Badge tone={tone}>{LEDGER_STATUS_LABELS[status]}</Badge>;
}

export function MediaStatusBadge({ status }: { status: Enums<'media_status'> }) {
  const tone: Tone = status === 'published' ? 'success' : status === 'pending_review' ? 'gold' : status === 'rejected' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{MEDIA_STATUS_LABELS[status]}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: Enums<'project_status'> }) {
  return <Badge tone="neutral">{PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function PublishedBadge({ published }: { published: boolean }) {
  return published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>;
}

export function ReportStatusBadge({ status }: { status: Enums<'report_status'> }) {
  const tone: Tone = status === 'published' ? 'success' : status === 'withdrawn' ? 'danger' : 'gold';
  return <Badge tone={tone}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

export function MessageStatusBadge({ status }: { status: Enums<'message_status'> }) {
  const tone: Tone = status === 'new' ? 'gold' : status === 'in_progress' ? 'info' : 'neutral';
  return <Badge tone={tone}>{MESSAGE_STATUS_LABELS[status]}</Badge>;
}
