import {
  DomainSnapshot,
  Habit,
  HabitCheckin,
  HabitNote,
  HabitScheduleVersion,
  ReminderSlot,
  Task,
  TaskStatus,
  normalizeCheckinValue,
  normalizeDailyTarget,
  normalizeHabitUnit,
  normalizeReminderSlotIds,
  normalizeReminderSlotLabel,
  normalizeReminderSlotTime,
  normalizeWeeklyTarget,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitSchedule } from '../utils/habit-schedule';
import { IdTable } from './id-table';
import { SnapshotBytes } from './snapshot-bytes';
import { SnapshotReader } from './snapshot-reader';
import { StringTable } from './string-table';

const MAGIC = [0x48, 0x42, 0x54, 0x31] as const; // "HBT1"
const FORMAT_VERSION = 9;

function encodeScaledTarget(value: number | null | undefined): number {
  const clean = normalizeDailyTarget(value);
  return clean === null ? 0 : Math.round(clean * 100);
}

function decodeScaledTarget(scaled: number): number | null {
  if (!Number.isFinite(scaled) || scaled <= 0) return null;
  return normalizeDailyTarget(scaled / 100);
}

function encodeScaledValue(value: number | undefined): number {
  const clean = normalizeCheckinValue(value);
  return clean === undefined ? 0 : Math.round(clean * 100);
}

function decodeScaledValue(scaled: number): number | undefined {
  if (!Number.isFinite(scaled) || scaled <= 0) return undefined;
  return normalizeCheckinValue(scaled / 100);
}

function encodeTaskStatus(task: Task): number {
  const status = task.status ?? (task.done ? 'done' : 'open');
  switch (status) {
    case 'open':
      return 0;
    case 'done':
      return 1;
    case 'not_done':
      return 2;
    case 'archived':
      return 3;
  }
}

function decodeTaskStatus(byte: number): TaskStatus {
  switch (byte) {
    case 0:
      return 'open';
    case 1:
      return 'done';
    case 2:
      return 'not_done';
    case 3:
      return 'archived';
    default:
      throw new Error(`Invalid task status byte in snapshot: ${byte}`);
  }
}

export class SnapshotCodec {
  public static pack(snapshot: DomainSnapshot): Uint8Array {
    const stringTable = new StringTable();
    const idTable = new IdTable();

    const sortedHabits = [...snapshot.habits].sort((a, b) => a.id - b.id);
    const sortedNotes = [...snapshot.notes].sort(
      (a, b) => a.habitId - b.habitId || a.dayIndex - b.dayIndex
    );
    const sortedTasks = [...snapshot.tasks].sort((a, b) => a.id - b.id);
    const sortedSlots = [...(snapshot.reminderSlots ?? [])]
      .map((s) => ({
        ...s,
        id: s.id.trim(),
        label: normalizeReminderSlotLabel(s.label),
        time: normalizeReminderSlotTime(s.time),
        deletedAt: s.deletedAt ?? null,
      }))
      .filter((s) => s.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const habit of sortedHabits) {
      idTable.intern(habit.id);
      stringTable.intern(habit.name);
      stringTable.intern(habit.color);
      if (HabitSchedule.hasAnyDailyTarget(habit)) {
        stringTable.intern(normalizeHabitUnit(habit.unit) ?? '');
      }
      for (const slotId of normalizeReminderSlotIds(habit.reminderSlotIds)) {
        stringTable.intern(slotId);
      }
    }
    for (const checkin of snapshot.checkins) {
      idTable.intern(checkin.habitId);
    }
    for (const note of sortedNotes) {
      idTable.intern(note.habitId);
      stringTable.intern(note.text);
    }
    for (const task of sortedTasks) {
      idTable.intern(task.id);
      stringTable.intern(task.title);
      stringTable.intern(task.note);
    }
    for (const slot of sortedSlots) {
      stringTable.intern(slot.id);
      stringTable.intern(slot.label);
      stringTable.intern(slot.time);
    }

    const checkinsByHabit = new Map<number, HabitCheckin[]>();
    for (const checkin of snapshot.checkins) {
      const list = checkinsByHabit.get(checkin.habitId) ?? [];
      list.push(checkin);
      checkinsByHabit.set(checkin.habitId, list);
    }

    const body = new SnapshotBytes(512);
    for (const m of MAGIC) {
      body.writeUint8(m);
    }
    body.writeUint8(FORMAT_VERSION);

    stringTable.writeTo(body);
    idTable.writeTo(body);

    // Habits + bitmasked check-ins per habit
    body.writeVarUint(sortedHabits.length);
    for (const habit of sortedHabits) {
      body.writeVarUint(idTable.intern(habit.id));
      body.writeVarUint(stringTable.intern(habit.name));
      body.writeVarUint(stringTable.intern(habit.color));
      body.writeUint8(habit.weekdays & 0x7f);
      body.writeUint8(normalizeWeeklyTarget(habit.weeklyTarget) ?? 0);
      body.writeVarInt(habit.startDay);

      if (habit.archivedAt !== null) {
        body.writeUint8(1);
        body.writeFloat64(habit.archivedAt);
      } else {
        body.writeUint8(0);
      }

      body.writeFloat64(habit.createdAt);
      body.writeFloat64(habit.updatedAt);

      const normalizedHistory = HabitSchedule.normalizeHistory(
        habit.startDay,
        habit.weekdays,
        habit.weeklyTarget,
        habit.scheduleHistory,
        habit.dailyTarget
      );
      const historyEntries = normalizedHistory.scheduleHistory;
      if (!historyEntries || historyEntries.length <= 1) {
        body.writeVarUint(0);
      } else {
        body.writeVarUint(historyEntries.length);
        for (const entry of historyEntries) {
          body.writeVarInt(entry.fromDay - habit.startDay);
          body.writeUint8(entry.weekdays & 0x7f);
          body.writeUint8(normalizeWeeklyTarget(entry.weeklyTarget) ?? 0);
          body.writeVarUint(encodeScaledTarget(entry.dailyTarget));
        }
      }

      const cleanDailyTarget = normalizedHistory.dailyTarget;
      body.writeVarUint(encodeScaledTarget(cleanDailyTarget));
      const hasMeasured =
        cleanDailyTarget !== null ||
        (historyEntries?.some((entry) => normalizeDailyTarget(entry.dailyTarget) !== null) ??
          false);
      if (hasMeasured) {
        body.writeVarUint(stringTable.intern(normalizeHabitUnit(habit.unit) ?? ''));
      }

      const habitSlotIds = normalizeReminderSlotIds(habit.reminderSlotIds);
      body.writeVarUint(habitSlotIds.length);
      for (const slotId of habitSlotIds) {
        body.writeVarUint(stringTable.intern(slotId));
      }

      const habitCheckins = (checkinsByHabit.get(habit.id) ?? []).sort(
        (a, b) => a.dayIndex - b.dayIndex
      );

      if (habitCheckins.length === 0) {
        body.writeVarUint(0);
      } else {
        const minDay = habitCheckins[0].dayIndex;
        const maxDay = habitCheckins[habitCheckins.length - 1].dayIndex;
        const spanDays = maxDay - minDay + 1;
        const bitBytesCount = Math.ceil(spanDays / 8);
        const bitBytes = new Uint8Array(bitBytesCount);

        let hasValues = false;
        for (const entry of habitCheckins) {
          if (entry.done) {
            const bitPos = entry.dayIndex - minDay;
            bitBytes[bitPos >> 3] |= 1 << (bitPos & 7);
          }
          if (normalizeCheckinValue(entry.value) !== undefined) {
            hasValues = true;
          }
        }

        body.writeVarUint(habitCheckins.length);
        body.writeVarInt(minDay - habit.startDay);
        body.writeVarUint(spanDays);
        body.writeBytes(bitBytes);

        for (const entry of habitCheckins) {
          body.writeVarUint(entry.dayIndex - minDay);
          body.writeVarInt(entry.updatedAt - habit.createdAt);
        }

        if (hasValues) {
          body.writeUint8(1);
          for (const entry of habitCheckins) {
            body.writeVarUint(encodeScaledValue(entry.value));
          }
        } else {
          body.writeUint8(0);
        }
      }
    }

    // Habit day notes
    body.writeVarUint(sortedNotes.length);
    for (const note of sortedNotes) {
      body.writeVarUint(idTable.intern(note.habitId));
      body.writeVarInt(note.dayIndex);
      body.writeVarUint(stringTable.intern(note.text));
      body.writeFloat64(note.updatedAt);
    }

    // Tasks
    body.writeVarUint(sortedTasks.length);
    for (const task of sortedTasks) {
      body.writeVarUint(idTable.intern(task.id));
      body.writeVarUint(stringTable.intern(task.title));
      body.writeVarUint(stringTable.intern(task.note));
      if (task.dueDay !== null) {
        body.writeUint8(1);
        body.writeVarInt(task.dueDay);
      } else {
        body.writeUint8(0);
      }
      body.writeUint8(task.done ? 1 : 0);
      if (task.deletedAt !== null) {
        body.writeUint8(1);
        body.writeFloat64(task.deletedAt);
      } else {
        body.writeUint8(0);
      }
      if (task.completedDay !== null) {
        body.writeUint8(1);
        body.writeVarInt(task.completedDay);
      } else {
        body.writeUint8(0);
      }
      body.writeUint8(task.repeatable ? 1 : 0);
      body.writeUint8(encodeTaskStatus(task));
      body.writeFloat64(task.createdAt);
      body.writeFloat64(task.updatedAt);
    }

    // Reminder slots (v9+)
    body.writeVarUint(sortedSlots.length);
    for (const slot of sortedSlots) {
      body.writeVarUint(stringTable.intern(slot.id));
      body.writeVarUint(stringTable.intern(slot.label));
      body.writeVarUint(stringTable.intern(slot.time));
      if (slot.deletedAt !== null) {
        body.writeUint8(1);
        body.writeFloat64(slot.deletedAt);
      } else {
        body.writeUint8(0);
      }
      body.writeFloat64(slot.createdAt);
      body.writeFloat64(slot.updatedAt);
    }

    const payload = body.toUint8Array();
    const checksum = SnapshotBytes.computeChecksum(payload);
    const out = new SnapshotBytes(payload.byteLength + 4);
    out.writeBytes(payload);
    out.writeUint32BE(checksum);
    return out.toUint8Array();
  }

  public static unpack(bytes: Uint8Array): DomainSnapshot {
    if (bytes.byteLength < MAGIC.length + 1 + 4) {
      throw new Error('Snapshot is too short or empty');
    }

    const payloadEnd = bytes.byteLength - 4;
    const payload = bytes.subarray(0, payloadEnd);
    const expectedChecksum = SnapshotBytes.computeChecksum(payload);
    const checksumView = new DataView(bytes.buffer, bytes.byteOffset + payloadEnd, 4);
    const actualChecksum = checksumView.getUint32(0, false);
    if (actualChecksum !== expectedChecksum) {
      throw new Error('Snapshot checksum mismatch (corrupt data)');
    }

    const reader = new SnapshotReader(payload);
    for (let i = 0; i < MAGIC.length; i++) {
      if (reader.readUint8() !== MAGIC[i]) {
        throw new Error('Invalid snapshot header magic');
      }
    }
    const version = reader.readUint8();
    if (version < 1 || version > FORMAT_VERSION) {
      throw new Error(`Unsupported snapshot version: ${version}`);
    }

    const stringTable = StringTable.readFrom(reader);
    const idTable = IdTable.readFrom(reader);

    const habitCount = reader.readVarUint();
    if (habitCount > 50_000) {
      throw new Error(`Unreasonable habit count: ${habitCount}`);
    }

    const habits: Habit[] = [];
    const checkins: HabitCheckin[] = [];

    for (let i = 0; i < habitCount; i++) {
      const id = idTable.get(reader.readVarUint());
      const name = stringTable.get(reader.readVarUint());
      const color = stringTable.get(reader.readVarUint());
      const weekdays = reader.readUint8();
      if (weekdays > 0x7f) {
        throw new Error(`Invalid weekdays mask: ${weekdays}`);
      }
      let weeklyTarget: number | null = null;
      if (version >= 6) {
        const wtByte = reader.readUint8();
        if (wtByte > 7) {
          throw new Error(`Invalid weeklyTarget byte in snapshot: ${wtByte}`);
        }
        weeklyTarget = wtByte === 0 ? null : wtByte;
      }
      const startDay = reader.readVarInt();
      const hasArchivedAt = reader.readUint8();
      if (hasArchivedAt !== 0 && hasArchivedAt !== 1) {
        throw new Error('Invalid archivedAt flag in snapshot');
      }
      const archivedAt = hasArchivedAt === 1 ? reader.readFloat64() : null;
      const createdAt = reader.readFloat64();
      const updatedAt = reader.readFloat64();

      let scheduleHistory: HabitScheduleVersion[] | undefined;
      const rawHistory: HabitScheduleVersion[] = [];
      if (version >= 7) {
        const historyCount = reader.readVarUint();
        if (historyCount > 10_000) {
          throw new Error(`Unreasonable scheduleHistory count: ${historyCount}`);
        }
        if (historyCount > 0) {
          for (let s = 0; s < historyCount; s++) {
            const fromDay = startDay + reader.readVarInt();
            const sWeekdays = reader.readUint8();
            if (sWeekdays > 0x7f) {
              throw new Error(`Invalid scheduleHistory weekdays mask: ${sWeekdays}`);
            }
            const sWtByte = reader.readUint8();
            if (sWtByte > 7) {
              throw new Error(`Invalid scheduleHistory weeklyTarget byte: ${sWtByte}`);
            }
            const sWeeklyTarget = sWtByte === 0 ? null : sWtByte;
            const sDailyTarget = version >= 8 ? decodeScaledTarget(reader.readVarUint()) : null;
            const entry: HabitScheduleVersion = {
              fromDay,
              weekdays: HabitSchedule.normalizeWeekdays(sWeekdays, sWeeklyTarget),
              weeklyTarget: sWeeklyTarget,
            };
            if (sDailyTarget !== null) {
              entry.dailyTarget = sDailyTarget;
            }
            rawHistory.push(entry);
          }
        }
      }

      let dailyTarget: number | null = null;
      let unit: string | null = null;
      if (version >= 8) {
        dailyTarget = decodeScaledTarget(reader.readVarUint());
        const hasMeasuredInHistory = rawHistory.some(
          (entry) => normalizeDailyTarget(entry.dailyTarget) !== null
        );
        if (dailyTarget !== null || hasMeasuredInHistory) {
          unit = normalizeHabitUnit(stringTable.get(reader.readVarUint()));
        }
      }

      if (rawHistory.length > 0) {
        const normalized = HabitSchedule.normalizeHistory(
          startDay,
          weekdays,
          weeklyTarget,
          rawHistory,
          dailyTarget
        );
        if (normalized.scheduleHistory && normalized.scheduleHistory.length > 1) {
          scheduleHistory = normalized.scheduleHistory;
        }
      }

      let reminderSlotIds: string[] = [];
      if (version >= 9) {
        const slotRefCount = reader.readVarUint();
        if (slotRefCount > 1_000) {
          throw new Error(`Unreasonable habit reminderSlotIds count: ${slotRefCount}`);
        }
        const rawSlotIds: string[] = [];
        for (let s = 0; s < slotRefCount; s++) {
          rawSlotIds.push(stringTable.get(reader.readVarUint()));
        }
        reminderSlotIds = normalizeReminderSlotIds(rawSlotIds);
      }

      const unpackedHabit: Habit = {
        id,
        name,
        color,
        weekdays,
        weeklyTarget,
        startDay,
        archivedAt,
        createdAt,
        updatedAt,
      };
      if (dailyTarget !== null) {
        unpackedHabit.dailyTarget = dailyTarget;
      }
      if (unit !== null) {
        unpackedHabit.unit = unit;
      }
      if (scheduleHistory) {
        unpackedHabit.scheduleHistory = scheduleHistory;
      }
      if (reminderSlotIds.length > 0) {
        unpackedHabit.reminderSlotIds = reminderSlotIds;
      }
      habits.push(unpackedHabit);

      const checkinCount = reader.readVarUint();
      if (checkinCount > 0) {
        const minOffsetFromStart = reader.readVarInt();
        const minDay = startDay + minOffsetFromStart;
        const spanDays = reader.readVarUint();
        if (spanDays === 0 || spanDays > 200_000) {
          throw new Error(`Invalid check-in spanDays: ${spanDays}`);
        }
        const bitBytesCount = Math.ceil(spanDays / 8);
        const bitBytes = reader.readBytes(bitBytesCount);

        const habitCheckins: HabitCheckin[] = [];
        for (let c = 0; c < checkinCount; c++) {
          const dayOffset = reader.readVarUint();
          if (dayOffset >= spanDays) {
            throw new Error('Check-in day offset out of bitmask bounds');
          }
          const updatedAtDelta = reader.readVarInt();
          const done = (bitBytes[dayOffset >> 3] & (1 << (dayOffset & 7))) !== 0;
          habitCheckins.push({
            habitId: id,
            dayIndex: minDay + dayOffset,
            done,
            updatedAt: createdAt + updatedAtDelta,
          });
        }

        if (version >= 8) {
          const valueMode = reader.readUint8();
          if (valueMode !== 0 && valueMode !== 1) {
            throw new Error(`Invalid check-in value mode in snapshot: ${valueMode}`);
          }
          if (valueMode === 1) {
            for (let c = 0; c < checkinCount; c++) {
              const val = decodeScaledValue(reader.readVarUint());
              if (val !== undefined) {
                habitCheckins[c].value = val;
              }
            }
          }
        }

        for (const hc of habitCheckins) {
          checkins.push(hc);
        }
      }
    }

    const noteCount = reader.readVarUint();
    if (noteCount > 100_000) {
      throw new Error(`Unreasonable note count: ${noteCount}`);
    }
    const notes: HabitNote[] = [];
    for (let i = 0; i < noteCount; i++) {
      const habitId = idTable.get(reader.readVarUint());
      const dayIndex = reader.readVarInt();
      const text = stringTable.get(reader.readVarUint());
      const updatedAt = reader.readFloat64();
      notes.push({ habitId, dayIndex, text, updatedAt });
    }

    const taskCount = reader.readVarUint();
    if (taskCount > 100_000) {
      throw new Error(`Unreasonable task count: ${taskCount}`);
    }
    const tasks: Task[] = [];
    for (let i = 0; i < taskCount; i++) {
      const id = idTable.get(reader.readVarUint());
      const title = stringTable.get(reader.readVarUint());
      const note = stringTable.get(reader.readVarUint());
      const hasDueDay = reader.readUint8();
      if (hasDueDay !== 0 && hasDueDay !== 1) {
        throw new Error('Invalid dueDay flag in snapshot');
      }
      const dueDay = hasDueDay === 1 ? reader.readVarInt() : null;
      const doneByte = reader.readUint8();
      if (doneByte !== 0 && doneByte !== 1) {
        throw new Error('Invalid task done flag in snapshot');
      }
      let deletedAt: number | null = null;
      if (version >= 2) {
        const hasDeletedAt = reader.readUint8();
        if (hasDeletedAt !== 0 && hasDeletedAt !== 1) {
          throw new Error('Invalid task deletedAt flag in snapshot');
        }
        deletedAt = hasDeletedAt === 1 ? reader.readFloat64() : null;
      }
      let hasExplicitCompletedDay = false;
      let explicitCompletedDay: number | null = null;
      if (version >= 3) {
        hasExplicitCompletedDay = true;
        const hasCompleted = reader.readUint8();
        if (hasCompleted !== 0 && hasCompleted !== 1) {
          throw new Error('Invalid task completedDay flag in snapshot');
        }
        explicitCompletedDay = hasCompleted === 1 ? reader.readVarInt() : null;
      }
      let repeatable = false;
      if (version >= 4) {
        const repByte = reader.readUint8();
        if (repByte !== 0 && repByte !== 1) {
          throw new Error('Invalid task repeatable flag in snapshot');
        }
        repeatable = repByte === 1;
      }
      let status: TaskStatus = doneByte === 1 ? 'done' : 'open';
      if (version >= 5) {
        status = decodeTaskStatus(reader.readUint8());
      }
      const createdAt = reader.readFloat64();
      const updatedAt = reader.readFloat64();
      const done = status === 'done';
      const completedDay = !done
        ? null
        : hasExplicitCompletedDay
          ? explicitCompletedDay
          : CivilCalendar.fromTimestamp(updatedAt);
      tasks.push({
        id,
        title,
        note,
        dueDay,
        done,
        status,
        completedDay,
        repeatable,
        deletedAt,
        createdAt,
        updatedAt,
      });
    }

    const reminderSlots: ReminderSlot[] = [];
    if (version >= 9) {
      const slotCount = reader.readVarUint();
      if (slotCount > 10_000) {
        throw new Error(`Unreasonable reminder slot count: ${slotCount}`);
      }
      for (let i = 0; i < slotCount; i++) {
        const id = stringTable.get(reader.readVarUint()).trim();
        const label = normalizeReminderSlotLabel(stringTable.get(reader.readVarUint()));
        const time = normalizeReminderSlotTime(stringTable.get(reader.readVarUint()));
        const hasDeletedAt = reader.readUint8();
        if (hasDeletedAt !== 0 && hasDeletedAt !== 1) {
          throw new Error('Invalid reminder slot deletedAt flag in snapshot');
        }
        const deletedAt = hasDeletedAt === 1 ? reader.readFloat64() : null;
        const createdAt = reader.readFloat64();
        const updatedAt = reader.readFloat64();
        if (id.length > 0) {
          reminderSlots.push({
            id,
            label,
            time,
            deletedAt,
            createdAt,
            updatedAt,
          });
        }
      }
      reminderSlots.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }

    if (reader.remaining !== 0) {
      throw new Error(`Trailing unread bytes in snapshot: ${reader.remaining}`);
    }

    return {
      habits,
      checkins,
      notes,
      tasks,
      ...(reminderSlots.length > 0 ? { reminderSlots } : {}),
    };
  }
}
