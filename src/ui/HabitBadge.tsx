import { JSX, Match, Switch } from 'solid-js';
import { HabitAppearance, HabitIconId } from '../utils/habit-appearance';

export function HabitIconSvg(props: {
  id: HabitIconId;
  class?: string;
}): JSX.Element {
  const cls = () => props.class ?? 'w-3.5 h-3.5';

  return (
    <Switch>
      <Match when={props.id === 'run'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <circle cx="15" cy="4.5" r="2" />
          <path d="M8 11.5 10.5 8.5H13l3 2 2.5-1.5" />
          <path d="M12.5 8.5 10.5 14" />
          <path d="M10.5 14 7.5 16.5 4.5 19" />
          <path d="M10.5 14 14.5 16 13.5 20.5" />
        </svg>
      </Match>
      <Match when={props.id === 'dumbbell'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M2.5 9v6" />
          <path d="M2.5 12H5" />
          <rect x="5" y="6" width="3" height="12" rx="1" />
          <path d="M8 12h8" />
          <rect x="16" y="6" width="3" height="12" rx="1" />
          <path d="M19 12h2.5" />
          <path d="M21.5 9v6" />
        </svg>
      </Match>
      <Match when={props.id === 'droplet'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      </Match>
      <Match when={props.id === 'book'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </Match>
      <Match when={props.id === 'brain'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M12 5v13" />
        </svg>
      </Match>
      <Match when={props.id === 'moon'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </Match>
      <Match when={props.id === 'sun'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      </Match>
      <Match when={props.id === 'heart'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </Match>
      <Match when={props.id === 'pill'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
          <path d="m8.5 8.5 7 7" />
        </svg>
      </Match>
      <Match when={props.id === 'leaf'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      </Match>
      <Match when={props.id === 'code'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </Match>
      <Match when={props.id === 'music'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </Match>
      <Match when={props.id === 'brush'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
          <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
        </svg>
      </Match>
      <Match when={props.id === 'target'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </Match>
      <Match when={props.id === 'flame'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      </Match>
      <Match when={props.id === 'sparkles'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls()} aria-hidden="true">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      </Match>
    </Switch>
  );
}

interface HabitBadgeProps {
  appearanceRaw: string;
  size?: 'xs' | 'sm' | 'md';
}

export function HabitBadge(props: HabitBadgeProps): JSX.Element {
  const parsed = () => HabitAppearance.parse(props.appearanceRaw);
  const size = () => props.size ?? 'sm';

  return (
    <Switch>
      <Match when={parsed().badge.kind === 'none'}>
        <span
          class={`rounded-full shrink-0 ${
            size() === 'md'
              ? 'w-3 h-3'
              : size() === 'xs'
                ? 'w-2 h-2'
                : 'w-2.5 h-2.5'
          }`}
          style={{ 'background-color': parsed().color }}
          aria-hidden="true"
        />
      </Match>
      <Match when={parsed().badge.kind === 'icon'}>
        <span
          class={`rounded-lg shrink-0 inline-flex items-center justify-center border ${
            size() === 'md'
              ? 'w-7 h-7'
              : size() === 'xs'
                ? 'w-5 h-5'
                : 'w-6 h-6'
          }`}
          style={{
            'background-color': `${parsed().color}22`,
            'border-color': `${parsed().color}45`,
            color: parsed().color,
          }}
          aria-hidden="true"
        >
          <HabitIconSvg
            id={(parsed().badge as { kind: 'icon'; id: HabitIconId }).id}
            class={
              size() === 'md'
                ? 'w-4 h-4'
                : size() === 'xs'
                  ? 'w-3 h-3'
                  : 'w-3.5 h-3.5'
            }
          />
        </span>
      </Match>
      <Match when={parsed().badge.kind === 'emoji'}>
        <span
          class={`rounded-lg shrink-0 inline-flex items-center justify-center border leading-none select-none ${
            size() === 'md'
              ? 'w-7 h-7 text-sm'
              : size() === 'xs'
                ? 'w-5 h-5 text-[11px]'
                : 'w-6 h-6 text-xs'
          }`}
          style={{
            'background-color': `${parsed().color}1F`,
            'border-color': `${parsed().color}40`,
          }}
          aria-hidden="true"
        >
          {(parsed().badge as { kind: 'emoji'; value: string }).value}
        </span>
      </Match>
    </Switch>
  );
}
