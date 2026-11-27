import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { MultiSelect } from '../../src/ui/controls/MultiSelect';
import { Select } from '../../src/ui/controls/Select';
import { TimePicker } from '../../src/ui/controls/TimePicker';
import { DatePicker } from '../../src/ui/controls/DatePicker';
import { HistoryRangePicker } from '../../src/ui/controls/HistoryRangePicker';
import { MeasuredQuickControls } from '../../src/ui/controls/MeasuredQuickControls';
import { OfflineBanner, PWAInstallButton } from '../../src/ui/PwaControls';
import { CivilCalendar } from '../../src/utils/civil-calendar';
import { DateRangeResolver } from '../../src/utils/date-range';

const TODAY = CivilCalendar.fromLocalDate(2026, 11, 25);

describe('Controls & PWA', () => {
  it('Select supports normal and portal mode, selection, and Escape dismissal', () => {
    const onChange = vi.fn();
    render(() => (
      <Select
        ariaLabel="Sort order"
        value="a"
        portal={true}
        options={[
          { value: 'a', label: 'Alpha', hint: '1', dotColor: '#3B82F6' },
          { value: 'b', label: 'Beta' },
        ]}
        onChange={onChange}
      />
    ));

    const trigger = screen.getByRole('button', { name: /sort order/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('MultiSelect toggles items, quick preset, All, and Clear', () => {
    const onChange = vi.fn();
    render(() => (
      <MultiSelect
        ariaLabel="Status filter"
        value={['a']}
        allLabel="All Items"
        quickPreset={{ label: 'Core', values: ['a', 'b'] }}
        options={[
          { value: 'a', label: 'Alpha', dotColor: '#22C55E' },
          { value: 'b', label: 'Beta' },
          { value: 'c', label: 'Gamma' },
        ]}
        onChange={onChange}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: /status filter/i }));
    fireEvent.click(screen.getByRole('option', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: /core/i }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith('all');

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('DatePicker navigates months, picks Today/Tomorrow/No date, and clears', () => {
    const onChange = vi.fn();
    render(() => (
      <DatePicker id="due" value={TODAY} todayDay={TODAY} allowClear={true} onChange={onChange} />
    ));

    fireEvent.click(screen.getByRole('button', { name: /clear date/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: /today · nov 25/i }));
    expect(screen.getByRole('dialog', { name: /choose date/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^tomorrow$/i }));
    expect(onChange).toHaveBeenCalledWith(TODAY + 1);
  });

  it('TimePicker selects hours, minutes, and quick presets', () => {
    const onChange = vi.fn();
    render(() => <TimePicker value="09:00" onChange={onChange} ariaLabel="Slot time" />);

    fireEvent.click(screen.getByRole('button', { name: /slot time/i }));
    expect(screen.getByRole('dialog', { name: /choose reminder time/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '14' })[0]);
    expect(onChange).toHaveBeenCalledWith('14:00');

    fireEvent.click(screen.getByRole('button', { name: '21:30' }));
    expect(onChange).toHaveBeenCalledWith('21:30');
  });

  it('HistoryRangePicker selects presets, custom range, and timezone', () => {
    const onSelectPreset = vi.fn();
    const onSelectCustomRange = vi.fn();
    const onChangeTimeZone = vi.fn();
    const resolved = DateRangeResolver.resolve('last_30', TODAY);

    render(() => (
      <HistoryRangePicker
        preset="last_30"
        customStartDay={TODAY - 29}
        customEndDay={TODAY}
        resolvedRange={resolved}
        todayDay={TODAY}
        timeZone="UTC"
        onSelectPreset={onSelectPreset}
        onSelectCustomRange={onSelectCustomRange}
        onChangeTimeZone={onChangeTimeZone}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }));
    fireEvent.click(screen.getByRole('button', { name: /^last 7 days$/i }));
    expect(onSelectPreset).toHaveBeenCalledWith('last_7');

    // Reopen and switch timezone
    fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }));
    fireEvent.click(screen.getByRole('button', { name: /all zones/i }));
    const tzSearch = screen.getByPlaceholderText(/search iana timezone/i);
    fireEvent.input(tzSearch, { target: { value: 'Europe/Paris' } });
    fireEvent.click(screen.getByRole('button', { name: /europe\/paris/i }));
    expect(onChangeTimeZone).toHaveBeenCalledWith('Europe/Paris');
  });

  it('MeasuredQuickControls increments, applies typed values, and resets on Escape', async () => {
    const onIncrement = vi.fn().mockResolvedValue(undefined);
    const onSetValue = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <MeasuredQuickControls
        habitName="Read"
        accentColor="#3B82F6"
        unit="pages"
        value={10}
        target={20}
        onIncrement={onIncrement}
        onSetValue={onSetValue}
      />
    ));

    const plus5 = screen.getByRole('button', { name: /add 5 pages to read/i });
    fireEvent.click(plus5);
    await waitFor(() => expect(plus5).not.toBeDisabled());
    expect(onIncrement).toHaveBeenCalledWith(5);

    const input = screen.getByRole('textbox', { name: /set read value/i });
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /apply value for read/i }));
    await waitFor(() => expect(onSetValue).toHaveBeenCalledWith(18));

    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('10');

    // Commit via Enter key
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '14' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSetValue).toHaveBeenCalledWith(14));

    // Invalid input reverts on blur without calling onSetValue again
    const prevCalls = onSetValue.mock.calls.length;
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);
    expect(onSetValue).toHaveBeenCalledTimes(prevCalls);
    expect((input as HTMLInputElement).value).toBe('10');
  });

  it('HistoryRangePicker supports edge editing, Year-Month picker, and two-click custom range selection', () => {
    const onSelectPreset = vi.fn();
    const onSelectCustomRange = vi.fn();
    const onChangeTimeZone = vi.fn();
    const resolved = DateRangeResolver.resolve('custom', TODAY, {
      customStartDay: TODAY - 5,
      customEndDay: TODAY,
    });

    render(() => (
      <HistoryRangePicker
        preset="custom"
        customStartDay={TODAY - 5}
        customEndDay={TODAY}
        resolvedRange={resolved}
        todayDay={TODAY}
        timeZone="local"
        onSelectPreset={onSelectPreset}
        onSelectCustomRange={onSelectCustomRange}
        onChangeTimeZone={onChangeTimeZone}
      />
    ));

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: /^custom/i }));
    expect(
      screen.getByRole('dialog', { name: /choose date range and timezone/i })
    ).toBeInTheDocument();

    // Switch via Year-Month picker
    fireEvent.click(screen.getByRole('button', { name: /november 2026/i }));
    fireEvent.click(screen.getByRole('button', { name: /^oct$/i }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();

    // Navigate back to November 2026 and pick From edge
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    fireEvent.click(screen.getByRole('button', { name: /nov 20, 2026/i }));
    expect(screen.getByText(/picking start date \(from\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^10$/ }));
    expect(onSelectCustomRange).toHaveBeenCalledWith(
      CivilCalendar.fromLocalDate(2026, 11, 10),
      TODAY
    );

    // Two-click draft range selection (closes popover on 2nd click)
    fireEvent.click(screen.getByRole('button', { name: /^12$/ }));
    expect(screen.getByText(/pick end date/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^18$/ }));
    expect(onSelectCustomRange).toHaveBeenCalledWith(
      CivilCalendar.fromLocalDate(2026, 11, 12),
      CivilCalendar.fromLocalDate(2026, 11, 18)
    );
  });

  it('supports mobile HistoryRangePicker modal, outside pointerdown closing, TimePicker minute selection, and dirty increment', async () => {
    const prevInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    try {
      const onSelectCustomRange = vi.fn();
      const resolved = DateRangeResolver.resolve('last_30', TODAY);

      render(() => (
        <HistoryRangePicker
          preset="last_30"
          customStartDay={TODAY - 29}
          customEndDay={TODAY}
          resolvedRange={resolved}
          todayDay={TODAY}
          timeZone="UTC"
          onSelectPreset={() => {}}
          onSelectCustomRange={onSelectCustomRange}
          onChangeTimeZone={() => {}}
        />
      ));

      fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }));
      expect(screen.getByText(/date range & timezone/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /close date range picker/i }));
      expect(screen.queryByText(/date range & timezone/i)).not.toBeInTheDocument();

      // TimePicker minute selection and pointerdown dismissal
      const onTimeChange = vi.fn();
      render(() => <TimePicker value="09:00" onChange={onTimeChange} ariaLabel="Pick time" />);
      fireEvent.click(screen.getByRole('button', { name: /pick time/i }));
      fireEvent.click(screen.getByRole('button', { name: '45' }));
      expect(onTimeChange).toHaveBeenCalledWith('09:45');
      fireEvent.pointerDown(document.body);
      expect(
        screen.queryByRole('dialog', { name: /choose reminder time/i })
      ).not.toBeInTheDocument();

      // DatePicker Today + No date + pointerdown dismissal
      const onDateChange = vi.fn();
      render(() => (
        <DatePicker
          id="dp2"
          value={TODAY + 1}
          todayDay={TODAY}
          allowClear={true}
          onChange={onDateChange}
        />
      ));
      fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }));
      fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
      expect(onDateChange).toHaveBeenCalledWith(TODAY);
      fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }));
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('dialog', { name: /choose date/i })).not.toBeInTheDocument();

      // MeasuredQuickControls dirty draft + clicking +1 commits dirty + 1 via onSetValue
      const onIncrement = vi.fn().mockResolvedValue(undefined);
      const onSetValue = vi.fn().mockResolvedValue(undefined);
      render(() => (
        <MeasuredQuickControls
          habitName="Water"
          accentColor="#3B82F6"
          unit="cups"
          value={2}
          target={8}
          onIncrement={onIncrement}
          onSetValue={onSetValue}
        />
      ));
      const input = screen.getByRole('textbox', { name: /set water value/i });
      fireEvent.focus(input);
      fireEvent.input(input, { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: /add 1 cups to water/i }));
      await waitFor(() => expect(onSetValue).toHaveBeenCalledWith(6));
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: prevInnerWidth, configurable: true });
    }
  });
});

describe('PwaControls', () => {
  it('OfflineBanner reacts to offline and online window events', () => {
    render(() => <OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    window.dispatchEvent(new Event('offline'));
    expect(screen.getByRole('status')).toHaveTextContent(/offline mode/i);

    window.dispatchEvent(new Event('online'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('PWAInstallButton handles beforeinstallprompt, dismissed outcome, and appinstalled', async () => {
    render(() => <PWAInstallButton variant="full" />);
    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();

    const promptDismissed = vi.fn().mockResolvedValue(undefined);
    const evt1 = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    evt1.prompt = promptDismissed;
    evt1.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });

    window.dispatchEvent(evt1);
    fireEvent.click(screen.getByRole('button', { name: /install app/i }));
    await waitFor(() => expect(promptDismissed).toHaveBeenCalledTimes(1));

    const promptAccepted = vi.fn().mockResolvedValue(undefined);
    const evt2 = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    evt2.prompt = promptAccepted;
    evt2.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(evt2);
    window.dispatchEvent(new Event('appinstalled'));
    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
  });

  it('PWAInstallButton shows iOS Safari install guide modal and closes via Done and Escape', () => {
    const origUaDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    Object.defineProperty(Navigator.prototype, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });

    try {
      render(() => <PWAInstallButton variant="compact" />);
      const installBtn = screen.getByRole('button', { name: /install/i });
      fireEvent.click(installBtn);

      expect(
        screen.getByRole('dialog', { name: /install on iphone \/ ipad/i })
      ).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(
        screen.queryByRole('dialog', { name: /install on iphone \/ ipad/i })
      ).not.toBeInTheDocument();

      fireEvent.click(installBtn);
      expect(
        screen.getByRole('dialog', { name: /install on iphone \/ ipad/i })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
      expect(
        screen.queryByRole('dialog', { name: /install on iphone \/ ipad/i })
      ).not.toBeInTheDocument();
    } finally {
      if (origUaDesc) {
        Object.defineProperty(Navigator.prototype, 'userAgent', origUaDesc);
      }
    }
  });
});
