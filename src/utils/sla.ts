import { Priority, SLAMetrics, SLAStatus } from '../types/freshdesk';
import { differenceInMinutes, parseISO, addHours } from 'date-fns';

const SLA_CONFIG = {
  4: { response: 1, resolution: 4 }, // Critical
  3: { response: 4, resolution: 24 }, // High
  2: { response: 8, resolution: 48 }, // Medium
  1: { response: 24, resolution: 72 }, // Low
};

export const calculateSLA = (createdAt: string, priority: Priority): SLAMetrics => {
  const created = parseISO(createdAt);
  const limit = addHours(created, SLA_CONFIG[priority].resolution);
  const now = new Date();
  
  const totalMinutes = SLA_CONFIG[priority].resolution * 60;
  const remainingMinutes = differenceInMinutes(limit, now);
  const percentRemaining = Math.max(0, (remainingMinutes / totalMinutes) * 100);
  
  let status: SLAStatus = 'on-track';
  if (percentRemaining < 25) status = 'immediate';
  else if (percentRemaining < 50) status = 'attention';
  
  const hours = Math.floor(Math.abs(remainingMinutes) / 60);
  const mins = Math.abs(remainingMinutes) % 60;
  const timeStr = `${remainingMinutes < 0 ? '-' : ''}${hours}h ${mins}m`;
  
  return { status, remainingTime: timeStr, percentRemaining };
};

export const getPriorityLabel = (p: Priority) => {
  const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
  return labels[p];
};

export const getStatusLabel = (s: number) => {
  const labels: Record<number, string> = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
  return labels[s] || 'Unknown';
};