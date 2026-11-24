import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { EntryView } from '../../src/ui/EntryView';
import { HabitBadge } from '../../src/ui/HabitBadge';

describe('EntryView', () => {
  it('renders guest/google sign-in options and handles clicks', () => {
    const onSelectGuest = vi.fn();
    const onSelectGoogle = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <EntryView
        onSelectGuest={onSelectGuest}
        onSelectGoogle={onSelectGoogle}
        isSigningIn={false}
        error={null}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(onSelectGuest).toHaveBeenCalledTimes(1);
    expect(onSelectGoogle).toHaveBeenCalledTimes(1);
  });

  it('displays error alert and disables buttons while signing in', () => {
    render(() => (
      <EntryView
        onSelectGuest={() => {}}
        onSelectGoogle={async () => {}}
        isSigningIn={true}
        error="Google Sign-In was cancelled."
      />
    ));

    expect(screen.getByRole('alert')).toHaveTextContent('Google Sign-In was cancelled.');
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeDisabled();
  });
});

describe('HabitBadge', () => {
  it('renders emoji badge when configured', () => {
    const { container } = render(() => <HabitBadge appearanceRaw="#22C55E|emoji:💧" size="md" />);
    expect(container.textContent).toContain('💧');
  });

  it('renders SVG icon badge when icon id is configured', () => {
    const { container } = render(() => (
      <HabitBadge appearanceRaw="#14B8A6|icon:dumbbell" size="sm" />
    ));
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
