import { isAnnouncementVisible } from '@/electoral/model';
import type { ElectoralAnnouncement } from '@/electoral/types';

/** Derived notifications keep one stable read/dismiss identity per publication
 * version. Scheduled publications become new when their actual period starts. */
export function electoralAnnouncementNotifications(announcements: ElectoralAnnouncement[], now: Date) {
  return announcements.filter(item => isAnnouncementVisible(item, now)).map(item => {
    const starts = item.startsAt.getTime(), changed = item.updatedAt.getTime();
    const version = Number.isFinite(changed) ? changed : starts;
    return {
      id: `electoral_${item.id}_${version}_${starts}`, rawId: item.id,
      category: 'announcement' as const, fuente: 'electoral' as const,
      title: `Elecciones · ${item.title}`, preview: item.body, important: item.pinned,
      createdAt: new Date(Math.max(version, starts)), linkTo: '/dashboard/elecciones',
    };
  });
}
