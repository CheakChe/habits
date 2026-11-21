export const HABIT_ICON_IDS = [
  'run',
  'dumbbell',
  'droplet',
  'book',
  'brain',
  'moon',
  'sun',
  'heart',
  'pill',
  'leaf',
  'code',
  'music',
  'brush',
  'target',
  'flame',
  'sparkles',
] as const;

export type HabitIconId = (typeof HABIT_ICON_IDS)[number];

export interface HabitIconOption {
  id: HabitIconId;
  label: string;
}

export const HABIT_ICONS: HabitIconOption[] = [
  { id: 'run', label: 'Run' },
  { id: 'dumbbell', label: 'Workout' },
  { id: 'droplet', label: 'Water' },
  { id: 'book', label: 'Read' },
  { id: 'brain', label: 'Focus' },
  { id: 'moon', label: 'Sleep' },
  { id: 'sun', label: 'Morning' },
  { id: 'heart', label: 'Health' },
  { id: 'pill', label: 'Supplement' },
  { id: 'leaf', label: 'Nutrition' },
  { id: 'code', label: 'Code' },
  { id: 'music', label: 'Music' },
  { id: 'brush', label: 'Clean' },
  { id: 'target', label: 'Goal' },
  { id: 'flame', label: 'Streak' },
  { id: 'sparkles', label: 'Mindful' },
];

export const HABIT_EMOJIS = [
  '💪',
  '🏃',
  '💧',
  '📖',
  '🧘',
  '😴',
  '💊',
  '🥗',
  '🧠',
  '✍️',
  '🎯',
  '🔥',
  '☀️',
  '🎵',
  '🧹',
  '💻',
  '🦷',
  '🚶',
] as const;

export type HabitBadge =
  | { kind: 'none' }
  | { kind: 'icon'; id: HabitIconId }
  | { kind: 'emoji'; value: string };

export interface ParsedHabitAppearance {
  color: string;
  badge: HabitBadge;
}

const FALLBACK_HEX = '#3B82F6';
const ICON_ID_SET = new Set<string>(HABIT_ICON_IDS);

export class HabitAppearance {
  public static normalizeHex(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

    if (/^[0-9a-fA-F]{3}$/.test(withoutHash)) {
      const expanded = withoutHash
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase();
      return `#${expanded}`;
    }

    if (/^[0-9a-fA-F]{6}$/.test(withoutHash)) {
      return `#${withoutHash.toUpperCase()}`;
    }

    return null;
  }

  public static parse(raw: string): ParsedHabitAppearance {
    const [colorPart, badgePart] = raw.split('|', 2);
    const color = HabitAppearance.normalizeHex(colorPart ?? '') ?? FALLBACK_HEX;

    if (badgePart) {
      if (badgePart.startsWith('icon:')) {
        const id = badgePart.slice(5);
        if (ICON_ID_SET.has(id)) {
          return { color, badge: { kind: 'icon', id: id as HabitIconId } };
        }
      } else if (badgePart.startsWith('emoji:')) {
        const value = badgePart.slice(6).trim();
        if (value.length > 0) {
          return { color, badge: { kind: 'emoji', value } };
        }
      }
    }

    return { color, badge: { kind: 'none' } };
  }

  public static format(color: string, badge: HabitBadge): string {
    const normalized = HabitAppearance.normalizeHex(color) ?? FALLBACK_HEX;
    if (badge.kind === 'icon') {
      return `${normalized}|icon:${badge.id}`;
    }
    if (badge.kind === 'emoji') {
      const cleanEmoji = badge.value.replace(/\|/g, '').trim();
      return cleanEmoji ? `${normalized}|emoji:${cleanEmoji}` : normalized;
    }
    return normalized;
  }

  public static getColor(raw: string): string {
    return HabitAppearance.parse(raw).color;
  }

  public static getContrastTextColor(hex: string): '#FFFFFF' | '#0A0B0E' {
    const normalized = HabitAppearance.normalizeHex(hex) ?? FALLBACK_HEX;
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 175 ? '#0A0B0E' : '#FFFFFF';
  }
}
