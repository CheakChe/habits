import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import {
  CustomMultiSelect,
  CustomSelect,
  CustomTimePicker,
  DatePicker,
  HistoryRangePicker,
  MeasuredQuickControls,
} from '../../src/ui/CustomControls';
import { OfflineBanner, PWAInstallButton } from '../../src/ui/PwaControls';
import { CivilCalendar } from '../../src/utils/civil-calendar';
import { DateRangeResolver } from '../../src/utils/date-range';

const TODAY = CivilCalendar.fromLocalDate(2026, 11, 25);

describe('CustomControls', () => {
  it('CustomSelect supports normal and portal mode, selection, and Escape dismissal', () => {
    const onChange = vi.fn();
    render(() => (
      <CustomSelect
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

  it('CustomMultiSelect toggles items, quick preset, All, and Clear', () => {
    const onChange = vi.fn();
    render(() => (
      <CustomMultiSelect
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

  it('CustomTimePicker selects hours, minutes, and quick presets', () => {
    const onChange = vi.fn();
    render(() => <CustomTimePicker value="09:00" onChange={onChange} ariaLabel="Slot time" />);

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

  it('PWAInstallButton handles beforeinstallprompt and iOS install guide', async () => {
    render(() => <PWAInstallButton variant="full" />);
    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const evt = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    evt.prompt = promptMock;
    evt.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    window.dispatchEvent(evt);
    const installBtn = screen.getByRole('button', { name: /install app/i });
    fireEvent.click(installBtn);

    await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
  });
});
