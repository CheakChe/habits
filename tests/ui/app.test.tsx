import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { FakeIndexedDBFactory } from '../helpers/fake-indexeddb';

describe('App integration', () => {
  const prevIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new FakeIndexedDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: prevIndexedDB,
      configurable: true,
      writable: true,
    });
  });

  it('starts at EntryView, enters Guest mode, navigates tabs, and creates a habit', async () => {
    render(() => <App />);

    // Starts on EntryView when no mode is remembered
    const guestBtn = screen.getByRole('button', { name: /continue as guest/i });
    fireEvent.click(guestBtn);

    // Wait for IndexedDB init & Today view
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    );

    // Create a habit via Today -> New Habit modal
    fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
    expect(screen.getByRole('dialog', { name: /new habit/i })).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText(/^name$/i), { target: { value: 'Stretch' } });
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));

    await waitFor(() => expect(screen.getByText('Stretch')).toBeInTheDocument());

    // Switch between top nav tabs: Habits, Tasks, Progress
    const nav = screen.getByRole('navigation', { name: /primary navigation/i });
    fireEvent.click(nav.querySelectorAll('button')[1]); // Habits
    expect(screen.getByRole('heading', { name: /^habits$/i })).toBeInTheDocument();

    fireEvent.click(nav.querySelectorAll('button')[2]); // Tasks
    expect(screen.getByRole('heading', { name: /^tasks$/i })).toBeInTheDocument();

    fireEvent.click(nav.querySelectorAll('button')[3]); // Progress
    expect(screen.getByRole('heading', { name: /^progress$/i })).toBeInTheDocument();

    // Open Account & Mode modal from header Guest Mode button
    fireEvent.click(screen.getByRole('button', { name: /guest mode/i }));
    expect(screen.getByRole('dialog', { name: /workspace & sync mode/i })).toBeInTheDocument();
  });
});
