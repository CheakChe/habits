import {
  DomainSnapshot,
  Habit,
  HabitCheckin,
  HabitNote,
  Task,
  TaskStatus,
  normalizeWeeklyTarget,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { IdTable } from './id-table';
import { SnapshotBytes } from './snapshot-bytes';
import { SnapshotReader } from './snapshot-reader';
import { StringTable } from './string-table';

const MAGIC = [0x48, 0x42, 0x54, 0x31] as const; // "HBT1"
const FORMAT_VERSION = 6;

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

    for (const habit of sortedHabits) {
      idTable.intern(habit.id);
      stringTable.intern(habit.name);
      stringTable.intern(habit.color);
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

        for (const entry of habitCheckins) {
          if (entry.done) {
            const bitPos = entry.dayIndex - minDay;
            bitBytes[bitPos >> 3] |= 1 << (bitPos & 7);
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

      habits.push({
        id,
        name,
        color,
        weekdays,
        weeklyTarget,
        startDay,
        archivedAt,
        createdAt,
        updatedAt,
      });

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

        for (let c = 0; c < checkinCount; c++) {
          const dayOffset = reader.readVarUint();
          if (dayOffset >= spanDays) {
            throw new Error('Check-in day offset out of bitmask bounds');
          }
          const updatedAtDelta = reader.readVarInt();
          const done = (bitBytes[dayOffset >> 3] & (1 << (dayOffset & 7))) !== 0;
          checkins.push({
            habitId: id,
            dayIndex: minDay + dayOffset,
            done,
            updatedAt: createdAt + updatedAtDelta,
          });
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

    if (reader.remaining !== 0) {
      throw new Error(`Trailing unread bytes in snapshot: ${reader.remaining}`);
    }

    return { habits, checkins, notes, tasks };
  }
}
