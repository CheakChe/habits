export interface HabitColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const HABIT_COLORS: HabitColorPreset[] = [
  { id: 'cobalt', label: 'Cobalt', hex: '#3B82F6' },
  { id: 'indigo', label: 'Indigo', hex: '#6366F1' },
  { id: 'emerald', label: 'Emerald', hex: '#22C55E' },
  { id: 'teal', label: 'Teal', hex: '#14B8A6' },
  { id: 'amber', label: 'Amber', hex: '#F59E0B' },
  { id: 'coral', label: 'Coral', hex: '#F97316' },
  { id: 'rose', label: 'Rose', hex: '#F43F5E' },
  { id: 'violet', label: 'Violet', hex: '#A855F7' },
];

export const DEFAULT_HABIT_COLOR = HABIT_COLORS[0].hex;
export const ALL_WEEKDAYS_MASK = 0b1111111; // 127 (Mon-Sun)
