import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupService } from '../src/sync/backup-service';
import { IdTable } from '../src/sync/id-table';
import { SnapshotBytes } from '../src/sync/snapshot-bytes';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import { SnapshotMerger } from '../src/sync/snapshot-merger';
import { SnapshotReader } from '../src/sync/snapshot-reader';
import { StringTable } from '../src/sync/string-table';
import { DomainSnapshot } from '../src/types/domain';
import { CivilCalendar } from '../src/utils/civil-calendar';
import { Helpers } from '../src/utils/helpers';

test('SnapshotBytes and SnapshotReader round-trip primitives, varints, UTF-8, and checksums', () => {
  const writer = new SnapshotBytes(4); // force buffer resizing
  writer.writeUint8(0);
  writer.writeUint8(255);
  writer.writeUint32BE(0xdeadbeef);
  writer.writeFloat64(1_760_123_456_789.5);

  const uintSamples = [0, 1, 127, 128, 16383, 16384, 1_000_000, Number.MAX_SAFE_INTEGER];
  for (const v of uintSamples) {
    writer.writeVarUint(v);
  }

  const intSamples = [0, 1, -1, 2, -2, 123456, -123456, -2000000000];
  for (const v of intSamples) {
    writer.writeVarInt(v);
  }

  const strings = ['', 'Habits', 'Утренняя пробежка 🏃‍♂️', '日本語テスト'];
  for (const s of strings) {
    writer.writeUtf8String(s);
  }

  const payload = writer.toUint8Array();
  const checksum1 = SnapshotBytes.computeChecksum(payload);
  const checksum2 = SnapshotBytes.computeChecksum(payload);
  assert.equal(checksum1, checksum2);

  const modified = payload.slice();
  modified[0] ^= 1;
  assert.notEqual(SnapshotBytes.computeChecksum(modified), checksum1);

  const reader = new SnapshotReader(payload);
  assert.equal(reader.readUint8(), 0);
  assert.equal(reader.readUint8(), 255);
  assert.equal(reader.readUint32BE(), 0xdeadbeef);
  assert.equal(reader.readFloat64(), 1_760_123_456_789.5);

  for (const v of uintSamples) {
    assert.equal(reader.readVarUint(), v);
  }
  for (const v of intSamples) {
    assert.equal(reader.readVarInt(), v);
  }
  for (const s of strings) {
    assert.equal(reader.readUtf8String(), s);
  }
  assert.equal(reader.remaining, 0);

  assert.throws(() => reader.readUint8(), /Unexpected end/);
  assert.throws(() => writer.writeVarUint(-1));
  assert.throws(() => writer.writeVarUint(1.5));
  assert.throws(() => writer.writeVarInt(1.25));
});

test('StringTable and IdTable deduplicate entries and validate indices and positive IDs', () => {
  const strings = new StringTable();
  const s0 = strings.intern('Run');
  const s1 = strings.intern('Read');
  const s0Dup = strings.intern('Run');
  assert.equal(s0, 0);
  assert.equal(s1, 1);
  assert.equal(s0Dup, 0);
  assert.equal(strings.get(1), 'Read');
  assert.throws(() => strings.get(-1));
  assert.throws(() => strings.get(2));

  const ids = new IdTable();
  assert.equal(ids.intern(42), 0);
  assert.equal(ids.intern(7), 1);
  assert.equal(ids.intern(42), 0);
  assert.equal(ids.get(0), 42);
  assert.throws(() => ids.intern(0));
  assert.throws(() => ids.intern(-5));
  assert.throws(() => ids.intern(1.5));
  assert.throws(() => ids.get(5));
});

test('SnapshotCodec produces deterministic bytes regardless of input ordering and handles Unicode & sparse days', () => {
  const snapA: DomainSnapshot = {
    habits: [
      {
        id: 5,
        name: 'Вода 💧',
        color: '#14B8A6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20000,
        archivedAt: null,
        createdAt: 5000,
        updatedAt: 5100,
      },
      {
        id: 2,
        name: 'Reading',
        color: '#3B82F6',
        weekdays: 0b0011111,
        weeklyTarget: 3,
        startDay: 19900,
        archivedAt: 9000,
        createdAt: 4000,
        updatedAt: 9000,
      },
    ],
    checkins: [
      { habitId: 2, dayIndex: 20100, done: true, updatedAt: 6000 },
      { habitId: 2, dayIndex: 19895, done: false, updatedAt: 3500 }, // minDay before startDay & updatedAt < createdAt
      { habitId: 5, dayIndex: 20000, done: true, updatedAt: 5050 },
    ],
    notes: [
      { habitId: 5, dayIndex: 20000, text: 'Отличное утро', updatedAt: 5060 },
      { habitId: 2, dayIndex: 19910, text: 'Chapter 1', updatedAt: 4200 },
    ],
    tasks: [
      {
        id: 9,
        title: 'Task 9',
        note: 'Details',
        dueDay: null,
        done: false,
        status: 'not_done',
        completedDay: null,
        repeatable: true,
        deletedAt: null,
        createdAt: 7000,
        updatedAt: 7000,
      },
      {
        id: 1,
        title: 'Task 1',
        note: '',
        dueDay: 20050,
        done: true,
        status: 'done',
        completedDay: 20049,
        repeatable: false,
        deletedAt: 8000,
        createdAt: 3000,
        updatedAt: 8000,
      },
    ],
  };

  const snapAReordered: DomainSnapshot = {
    habits: [...snapA.habits].reverse(),
    checkins: [...snapA.checkins].reverse(),
    notes: [...snapA.notes].reverse(),
    tasks: [...snapA.tasks].reverse(),
  };

  const bytes1 = SnapshotCodec.pack(snapA);
  const bytes2 = SnapshotCodec.pack(snapAReordered);
  assert.equal(Helpers.bytesEqual(bytes1, bytes2), true);

  const unpacked = SnapshotCodec.unpack(bytes1);
  assert.deepEqual(unpacked.habits, [snapA.habits[1], snapA.habits[0]]);
  assert.deepEqual(unpacked.tasks, [snapA.tasks[1], snapA.tasks[0]]);
  assert.equal(unpacked.checkins.length, 3);
  assert.equal(unpacked.notes.length, 2);
});

test('SnapshotCodec backward-compatibly unpacks v1 snapshots and rejects invalid headers/versions/trailing bytes', () => {
  // Hand-craft a minimal valid v1 snapshot with 0 habits, 0 notes, 1 task (without deletedAt byte)
  const stringTable = new StringTable();
  const idTable = new IdTable();
  const titleIdx = stringTable.intern('Legacy v1 task');
  const noteIdx = stringTable.intern('Legacy note');
  const taskIdIdx = idTable.intern(1);

  const body = new SnapshotBytes(128);
  body.writeUint8(0x48); // H
  body.writeUint8(0x42); // B
  body.writeUint8(0x54); // T
  body.writeUint8(0x31); // 1
  body.writeUint8(1); // version = 1
  stringTable.writeTo(body);
  idTable.writeTo(body);
  body.writeVarUint(0); // habits
  body.writeVarUint(0); // notes
  body.writeVarUint(1); // tasks
  body.writeVarUint(taskIdIdx);
  body.writeVarUint(titleIdx);
  body.writeVarUint(noteIdx);
  body.writeUint8(0); // hasDueDay = 0
  body.writeUint8(1); // done = 1
  const updatedAtMs = new Date(2026, 10, 15, 12, 0, 0).getTime();
  body.writeFloat64(1000); // createdAt
  body.writeFloat64(updatedAtMs); // updatedAt

  const payload = body.toUint8Array();
  const checksum = SnapshotBytes.computeChecksum(payload);
  const v1Snapshot = new SnapshotBytes(payload.byteLength + 4);
  v1Snapshot.writeBytes(payload);
  v1Snapshot.writeUint32BE(checksum);

  const unpackedV1 = SnapshotCodec.unpack(v1Snapshot.toUint8Array());
  assert.equal(unpackedV1.tasks.length, 1);
  assert.deepEqual(unpackedV1.tasks[0], {
    id: 1,
    title: 'Legacy v1 task',
    note: 'Legacy note',
    dueDay: null,
    done: true,
    status: 'done',
    completedDay: CivilCalendar.fromTimestamp(updatedAtMs),
    repeatable: false,
    deletedAt: null,
    createdAt: 1000,
    updatedAt: updatedAtMs,
  });

  // Unsupported version 99 with valid checksum
  const badVerPayload = payload.slice();
  badVerPayload[4] = 99;
  const badVerFrame = new SnapshotBytes(badVerPayload.byteLength + 4);
  badVerFrame.writeBytes(badVerPayload);
  badVerFrame.writeUint32BE(SnapshotBytes.computeChecksum(badVerPayload));
  assert.throws(
    () => SnapshotCodec.unpack(badVerFrame.toUint8Array()),
    /Unsupported snapshot version/
  );

  // Bad magic header with valid checksum
  const badMagicPayload = payload.slice();
  badMagicPayload[0] = 0x58;
  const badMagicFrame = new SnapshotBytes(badMagicPayload.byteLength + 4);
  badMagicFrame.writeBytes(badMagicPayload);
  badMagicFrame.writeUint32BE(SnapshotBytes.computeChecksum(badMagicPayload));
  assert.throws(
    () => SnapshotCodec.unpack(badMagicFrame.toUint8Array()),
    /Invalid snapshot header magic/
  );

  // Trailing unread byte with valid checksum
  const trailingPayload = new SnapshotBytes(payload.byteLength + 1);
  trailingPayload.writeBytes(payload);
  trailingPayload.writeUint8(0xaa);
  const trailingBytes = trailingPayload.toUint8Array();
  const trailingFrame = new SnapshotBytes(trailingBytes.byteLength + 4);
  trailingFrame.writeBytes(trailingBytes);
  trailingFrame.writeUint32BE(SnapshotBytes.computeChecksum(trailingBytes));
  assert.throws(() => SnapshotCodec.unpack(trailingFrame.toUint8Array()), /Trailing unread bytes/);
});

test('SnapshotMerger is idempotent and preserves remote edits when remote.updatedAt is newer', () => {
  const local: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Local Older',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20000,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 200,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: 20000, done: true, updatedAt: 250 }],
    notes: [{ habitId: 1, dayIndex: 20000, text: 'Local old note', updatedAt: 250 }],
    tasks: [
      {
        id: 1,
        title: 'Local active',
        note: '',
        dueDay: 20001,
        done: false,
        status: 'open',
        completedDay: null,
        repeatable: false,
        deletedAt: null,
        createdAt: 300,
        updatedAt: 350,
      },
    ],
  };

  const remote: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Remote Newer',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20000,
        archivedAt: 500,
        createdAt: 100,
        updatedAt: 500,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: 20000, done: false, updatedAt: 450 }],
    notes: [{ habitId: 1, dayIndex: 20000, text: 'Remote new note', updatedAt: 450 }],
    tasks: [
      {
        id: 1,
        title: 'Remote deleted',
        note: '',
        dueDay: 20001,
        done: false,
        status: 'open',
        completedDay: null,
        repeatable: false,
        deletedAt: 600,
        createdAt: 300,
        updatedAt: 600,
      },
    ],
  };

  const merged = SnapshotMerger.merge(local, remote);
  assert.equal(merged.habits[0].name, 'Remote Newer');
  assert.equal(merged.habits[0].archivedAt, 500);
  assert.equal(merged.checkins[0].done, false);
  assert.equal(merged.notes[0].text, 'Remote new note');
  assert.equal(merged.tasks[0].deletedAt, 600);

  // Idempotency: merging merged with itself changes nothing
  assert.deepEqual(SnapshotMerger.merge(merged, merged), merged);

  // Symmetry on distinct items
  const reverse = SnapshotMerger.merge(remote, local);
  assert.deepEqual(reverse, merged);
});

test('BackupService builds dated filenames, exports binary snapshots, and safely merges imports', () => {
  const today = CivilCalendar.fromLocalDate(2026, 11, 20);
  assert.equal(BackupService.buildFilename(today), 'habits-backup-2026-11-20.bin');

  const localSnap: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Local Habit',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: today,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
  };

  const backupSnap: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Backup Colliding Habit',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: 4,
        startDay: today,
        archivedAt: null,
        createdAt: 500,
        updatedAt: 500,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: today, done: true, updatedAt: 500 }],
    notes: [],
    tasks: [
      {
        id: 1,
        title: 'Backup task',
        note: '',
        dueDay: today,
        done: true,
        status: 'done',
        completedDay: today - 2,
        repeatable: false,
        deletedAt: null,
        createdAt: 500,
        updatedAt: 500,
      },
    ],
  };

  const bytes = BackupService.exportBytes(backupSnap);
  const imported = BackupService.importBytes(localSnap, bytes);
  assert.equal(imported.importedCounts.habits, 1);
  assert.equal(imported.importedCounts.tasks, 1);
  assert.equal(imported.mergedSnapshot.habits.length, 2);
  assert.equal(imported.mergedSnapshot.habits[1].weeklyTarget, 4);
  assert.equal(imported.mergedSnapshot.tasks[0].completedDay, today - 2);

  assert.throws(() => BackupService.importBytes(localSnap, new Uint8Array([9, 9, 9])));
});

test('SnapshotCodec backward-compatibly unpacks v5 habit records with weeklyTarget: null', () => {
  const stringTable = new StringTable();
  const idTable = new IdTable();
  const nameIdx = stringTable.intern('Legacy v5 habit');
  const colorIdx = stringTable.intern('#3B82F6');
  const idIdx = idTable.intern(1);

  const body = new SnapshotBytes(128);
  body.writeUint8(0x48); // H
  body.writeUint8(0x42); // B
  body.writeUint8(0x54); // T
  body.writeUint8(0x31); // 1
  body.writeUint8(5); // version = 5
  stringTable.writeTo(body);
  idTable.writeTo(body);
  body.writeVarUint(1); // 1 habit
  body.writeVarUint(idIdx);
  body.writeVarUint(nameIdx);
  body.writeVarUint(colorIdx);
  body.writeUint8(127); // weekdays
  body.writeVarInt(20770); // startDay
  body.writeUint8(0); // archivedAt = null
  body.writeFloat64(1000); // createdAt
  body.writeFloat64(2000); // updatedAt
  body.writeVarUint(0); // checkins count
  body.writeVarUint(0); // notes count
  body.writeVarUint(0); // tasks count

  const payload = body.toUint8Array();
  const frame = new SnapshotBytes(payload.byteLength + 4);
  frame.writeBytes(payload);
  frame.writeUint32BE(SnapshotBytes.computeChecksum(payload));

  const unpacked = SnapshotCodec.unpack(frame.toUint8Array());
  assert.equal(unpacked.habits.length, 1);
  assert.equal(unpacked.habits[0].weeklyTarget, null);
  assert.equal(unpacked.habits[0].name, 'Legacy v5 habit');
});

test('SnapshotCodec v7 encodes/decodes scheduleHistory deterministically, omits single-period history, and unpacks v6 cleanly', () => {
  const baseDay = CivilCalendar.fromLocalDate(2026, 11, 2);
  const snapA: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Versioned Habit',
        color: '#3B82F6',
        weekdays: 0b0010101,
        weeklyTarget: null,
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 3000,
        scheduleHistory: [
          // Intentionally unsorted + duplicate same-day + consecutive duplicate + pre-startDay
          { fromDay: baseDay + 14, weekdays: 0b0010101, weeklyTarget: null },
          { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: 3 },
          { fromDay: baseDay - 2, weekdays: 0b0011111, weeklyTarget: null },
          { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: 4 }, // overwrites baseDay+7=3
          { fromDay: baseDay + 14, weekdays: 0b0010101, weeklyTarget: null },
        ],
      },
      {
        id: 2,
        name: 'Single Schedule Habit',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: 5,
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
        scheduleHistory: [{ fromDay: baseDay, weekdays: 127, weeklyTarget: 5 }],
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
  };

  const snapCanonical: DomainSnapshot = {
    ...snapA,
    habits: [
      {
        ...snapA.habits[0],
        scheduleHistory: [
          { fromDay: baseDay, weekdays: 0b0011111, weeklyTarget: null },
          { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: 4 },
          { fromDay: baseDay + 14, weekdays: 0b0010101, weeklyTarget: null },
        ],
      },
      {
        id: 2,
        name: 'Single Schedule Habit',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: 5,
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
  };

  const bytesA = SnapshotCodec.pack(snapA);
  const bytesCanonical = SnapshotCodec.pack(snapCanonical);
  assert.equal(Helpers.bytesEqual(bytesA, bytesCanonical), true);

  const unpacked = SnapshotCodec.unpack(bytesA);
  assert.deepEqual(unpacked.habits[0].scheduleHistory, [
    { fromDay: baseDay, weekdays: 0b0011111, weeklyTarget: null },
    { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: 4 },
    { fromDay: baseDay + 14, weekdays: 0b0010101, weeklyTarget: null },
  ]);
  assert.equal('scheduleHistory' in unpacked.habits[1], false);

  // Hand-craft a v6 snapshot (includes weeklyTarget byte, no scheduleHistory field)
  const stringTable = new StringTable();
  const idTable = new IdTable();
  const nameIdx = stringTable.intern('Legacy v6 habit');
  const colorIdx = stringTable.intern('#A855F7');
  const idIdx = idTable.intern(7);

  const body = new SnapshotBytes(128);
  body.writeUint8(0x48);
  body.writeUint8(0x42);
  body.writeUint8(0x54);
  body.writeUint8(0x31);
  body.writeUint8(6); // version = 6
  stringTable.writeTo(body);
  idTable.writeTo(body);
  body.writeVarUint(1);
  body.writeVarUint(idIdx);
  body.writeVarUint(nameIdx);
  body.writeVarUint(colorIdx);
  body.writeUint8(0b0011111); // weekdays
  body.writeUint8(3); // weeklyTarget
  body.writeVarInt(baseDay); // startDay
  body.writeUint8(0); // archivedAt = null
  body.writeFloat64(1000);
  body.writeFloat64(2000);
  body.writeVarUint(0); // checkins
  body.writeVarUint(0); // notes
  body.writeVarUint(0); // tasks

  const payload = body.toUint8Array();
  const frame = new SnapshotBytes(payload.byteLength + 4);
  frame.writeBytes(payload);
  frame.writeUint32BE(SnapshotBytes.computeChecksum(payload));

  const unpackedV6 = SnapshotCodec.unpack(frame.toUint8Array());
  assert.equal(unpackedV6.habits.length, 1);
  assert.equal(unpackedV6.habits[0].weeklyTarget, 3);
  assert.equal(unpackedV6.habits[0].weekdays, 0b0011111);
  assert.equal('scheduleHistory' in unpackedV6.habits[0], false);
});

test('SnapshotCodec v8 round-trips measured habits, versioned dailyTarget, checkin values, and reads v7 snapshots', () => {
  const baseDay = CivilCalendar.fromLocalDate(2026, 11, 1);

  const snap: DomainSnapshot = {
    habits: [
      {
        id: 10,
        name: 'Meditation',
        color: '#3B82F6',
        weekdays: 0b1111111,
        weeklyTarget: null,
        dailyTarget: 30,
        unit: 'min',
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 3000,
        scheduleHistory: [
          { fromDay: baseDay, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 15 },
          { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 30 },
        ],
      },
      {
        id: 11,
        name: 'Running',
        color: '#22C55E',
        weekdays: 0b1111111,
        weeklyTarget: 3,
        dailyTarget: 2.5,
        unit: 'km',
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: 12,
        name: 'Reverted Habit',
        color: '#F59E0B',
        weekdays: 0b1111111,
        weeklyTarget: null,
        dailyTarget: null,
        unit: 'pages',
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2500,
        scheduleHistory: [
          { fromDay: baseDay, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 20 },
          { fromDay: baseDay + 5, weekdays: 0b1111111, weeklyTarget: null },
        ],
      },
      {
        id: 13,
        name: 'Plain Checkoff',
        color: '#A855F7',
        weekdays: 0b0011111,
        weeklyTarget: null,
        startDay: baseDay,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1500,
      },
    ],
    checkins: [
      { habitId: 10, dayIndex: baseDay, done: true, value: 15, updatedAt: 1100 },
      { habitId: 10, dayIndex: baseDay + 1, done: false, value: 10.5, updatedAt: 1200 },
      { habitId: 10, dayIndex: baseDay + 7, done: true, value: 32.25, updatedAt: 3100 },
      { habitId: 11, dayIndex: baseDay + 2, done: false, updatedAt: 2100 },
      { habitId: 13, dayIndex: baseDay, done: true, updatedAt: 1600 },
    ],
    notes: [],
    tasks: [],
  };

  const bytes1 = SnapshotCodec.pack(snap);
  const bytes2 = SnapshotCodec.pack(snap);
  assert.equal(Helpers.bytesEqual(bytes1, bytes2), true);

  const unpacked = SnapshotCodec.unpack(bytes1);
  assert.equal(unpacked.habits.length, 4);

  const u10 = unpacked.habits.find((h) => h.id === 10)!;
  assert.equal(u10.dailyTarget, 30);
  assert.equal(u10.unit, 'min');
  assert.deepEqual(u10.scheduleHistory, [
    { fromDay: baseDay, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 15 },
    { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 30 },
  ]);

  const u11 = unpacked.habits.find((h) => h.id === 11)!;
  assert.equal(u11.dailyTarget, 2.5);
  assert.equal(u11.unit, 'km');
  assert.equal('scheduleHistory' in u11, false);

  const u12 = unpacked.habits.find((h) => h.id === 12)!;
  assert.equal('dailyTarget' in u12, false);
  assert.equal(u12.unit, 'pages');
  assert.deepEqual(u12.scheduleHistory, [
    { fromDay: baseDay, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 20 },
    { fromDay: baseDay + 5, weekdays: 0b1111111, weeklyTarget: null },
  ]);

  const u13 = unpacked.habits.find((h) => h.id === 13)!;
  assert.equal('dailyTarget' in u13, false);
  assert.equal('unit' in u13, false);
  assert.equal('scheduleHistory' in u13, false);

  assert.deepEqual(
    unpacked.checkins.find((c) => c.habitId === 10 && c.dayIndex === baseDay + 1),
    { habitId: 10, dayIndex: baseDay + 1, done: false, value: 10.5, updatedAt: 1200 }
  );
  assert.deepEqual(
    unpacked.checkins.find((c) => c.habitId === 10 && c.dayIndex === baseDay + 7),
    { habitId: 10, dayIndex: baseDay + 7, done: true, value: 32.25, updatedAt: 3100 }
  );
  const c11 = unpacked.checkins.find((c) => c.habitId === 11)!;
  assert.equal('value' in c11, false);
  const c13 = unpacked.checkins.find((c) => c.habitId === 13)!;
  assert.equal('value' in c13, false);

  // Backward compatibility: hand-craft a v7 snapshot (has scheduleHistory without dailyTarget/unit/checkin values)
  const stringTable = new StringTable();
  const idTable = new IdTable();
  const nameIdx = stringTable.intern('Legacy v7 habit');
  const colorIdx = stringTable.intern('#EF4444');
  const idIdx = idTable.intern(42);

  const body = new SnapshotBytes(256);
  body.writeUint8(0x48);
  body.writeUint8(0x42);
  body.writeUint8(0x54);
  body.writeUint8(0x31);
  body.writeUint8(7); // version = 7
  stringTable.writeTo(body);
  idTable.writeTo(body);
  body.writeVarUint(1); // habitCount
  body.writeVarUint(idIdx);
  body.writeVarUint(nameIdx);
  body.writeVarUint(colorIdx);
  body.writeUint8(0b1111111); // weekdays
  body.writeUint8(4); // weeklyTarget
  body.writeVarInt(baseDay); // startDay
  body.writeUint8(0); // archivedAt = null
  body.writeFloat64(1000);
  body.writeFloat64(2000);
  // v7 scheduleHistory: 2 entries (no dailyTarget varuint)
  body.writeVarUint(2);
  body.writeVarInt(0);
  body.writeUint8(0b0011111);
  body.writeUint8(0);
  body.writeVarInt(7);
  body.writeUint8(0b1111111);
  body.writeUint8(4);
  // v7 checkins: 1 done checkin at baseDay (no valueMode byte)
  body.writeVarUint(1);
  body.writeVarInt(0); // minOffsetFromStart
  body.writeVarUint(1); // spanDays
  body.writeBytes(new Uint8Array([0b00000001])); // bitBytes
  body.writeVarUint(0); // dayOffset
  body.writeVarInt(500); // updatedAtDelta
  body.writeVarUint(0); // notes
  body.writeVarUint(0); // tasks

  const payload = body.toUint8Array();
  const frame = new SnapshotBytes(payload.byteLength + 4);
  frame.writeBytes(payload);
  frame.writeUint32BE(SnapshotBytes.computeChecksum(payload));

  const unpackedV7 = SnapshotCodec.unpack(frame.toUint8Array());
  assert.equal(unpackedV7.habits.length, 1);
  assert.equal('dailyTarget' in unpackedV7.habits[0], false);
  assert.equal('unit' in unpackedV7.habits[0], false);
  assert.deepEqual(unpackedV7.habits[0].scheduleHistory, [
    { fromDay: baseDay, weekdays: 0b0011111, weeklyTarget: null },
    { fromDay: baseDay + 7, weekdays: 0b1111111, weeklyTarget: 4 },
  ]);
  assert.deepEqual(unpackedV7.checkins, [
    { habitId: 42, dayIndex: baseDay, done: true, updatedAt: 1500 },
  ]);
});

test('SnapshotCodec v9 encodes/decodes reminderSlots & Habit.reminderSlotIds deterministically, omits when empty, and unpacks v8 cleanly', () => {
  const baseDay = CivilCalendar.fromLocalDate(2026, 11, 1);

  const snap: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Vitamins',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: baseDay,
        archivedAt: null,
        reminderSlotIds: ['slot-b', 'slot-a', 'slot-b', '  '],
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: 2,
        name: 'No Slots Habit',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: baseDay,
        archivedAt: null,
        reminderSlotIds: [],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
    reminderSlots: [
      {
        id: 'slot-b',
        label: '  Evening  ',
        time: '21:05',
        createdAt: 200,
        updatedAt: 300,
        deletedAt: null,
      },
      {
        id: 'slot-a',
        label: 'Morning',
        time: '08:30',
        createdAt: 100,
        updatedAt: 100,
        deletedAt: null,
      },
      {
        id: 'slot-deleted',
        label: 'Retired',
        time: '14:00',
        createdAt: 150,
        updatedAt: 500,
        deletedAt: 500,
      },
    ],
  };

  const reorderedSnap: DomainSnapshot = {
    ...snap,
    reminderSlots: [...(snap.reminderSlots ?? [])].reverse(),
  };

  const bytes1 = SnapshotCodec.pack(snap);
  const bytes2 = SnapshotCodec.pack(reorderedSnap);
  assert.equal(Helpers.bytesEqual(bytes1, bytes2), true);

  const unpacked = SnapshotCodec.unpack(bytes1);
  assert.deepEqual(unpacked.habits[0].reminderSlotIds, ['slot-a', 'slot-b']);
  assert.equal('reminderSlotIds' in unpacked.habits[1], false);
  assert.deepEqual(unpacked.reminderSlots, [
    {
      id: 'slot-a',
      label: 'Morning',
      time: '08:30',
      createdAt: 100,
      updatedAt: 100,
      deletedAt: null,
    },
    {
      id: 'slot-deleted',
      label: 'Retired',
      time: '14:00',
      createdAt: 150,
      updatedAt: 500,
      deletedAt: 500,
    },
    {
      id: 'slot-b',
      label: 'Evening',
      time: '21:05',
      createdAt: 200,
      updatedAt: 300,
      deletedAt: null,
    },
  ]);

  // Empty reminderSlots omitted cleanly on unpack
  const emptySlotsBytes = SnapshotCodec.pack({
    habits: [unpacked.habits[1]],
    checkins: [],
    notes: [],
    tasks: [],
    reminderSlots: [],
  });
  const unpackedEmptySlots = SnapshotCodec.unpack(emptySlotsBytes);
  assert.equal('reminderSlots' in unpackedEmptySlots, false);

  // Backward compatibility: hand-craft a v8 snapshot (no habit reminderSlotIds, no reminderSlots section)
  const stringTable = new StringTable();
  const idTable = new IdTable();
  const nameIdx = stringTable.intern('Legacy v8 habit');
  const colorIdx = stringTable.intern('#3B82F6');
  const idIdx = idTable.intern(9);

  const body = new SnapshotBytes(128);
  body.writeUint8(0x48);
  body.writeUint8(0x42);
  body.writeUint8(0x54);
  body.writeUint8(0x31);
  body.writeUint8(8); // version = 8
  stringTable.writeTo(body);
  idTable.writeTo(body);
  body.writeVarUint(1); // habitCount
  body.writeVarUint(idIdx);
  body.writeVarUint(nameIdx);
  body.writeVarUint(colorIdx);
  body.writeUint8(127); // weekdays
  body.writeUint8(0); // weeklyTarget = null
  body.writeVarInt(baseDay); // startDay
  body.writeUint8(0); // archivedAt = null
  body.writeFloat64(1000);
  body.writeFloat64(2000);
  body.writeVarUint(0); // scheduleHistory count
  body.writeVarUint(0); // dailyTarget = null
  body.writeVarUint(0); // checkins count
  body.writeVarUint(0); // notes count
  body.writeVarUint(0); // tasks count

  const payload = body.toUint8Array();
  const frame = new SnapshotBytes(payload.byteLength + 4);
  frame.writeBytes(payload);
  frame.writeUint32BE(SnapshotBytes.computeChecksum(payload));

  const unpackedV8 = SnapshotCodec.unpack(frame.toUint8Array());
  assert.equal(unpackedV8.habits.length, 1);
  assert.equal(unpackedV8.habits[0].name, 'Legacy v8 habit');
  assert.equal('reminderSlotIds' in unpackedV8.habits[0], false);
  assert.equal('reminderSlots' in unpackedV8, false);
});

test('SnapshotMerger, rebaseForRestore, and BackupService merge and preserve reminderSlots & tombstones', () => {
  const local: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Drink Water',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20700,
        archivedAt: null,
        reminderSlotIds: ['slot-1'],
        createdAt: 100,
        updatedAt: 200,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
    reminderSlots: [
      {
        id: 'slot-1',
        label: 'Morning Old',
        time: '08:00',
        createdAt: 100,
        updatedAt: 200,
        deletedAt: null,
      },
      {
        id: 'slot-2',
        label: 'Deleted Locally',
        time: '13:00',
        createdAt: 150,
        updatedAt: 900,
        deletedAt: 900,
      },
    ],
  };

  const remote: DomainSnapshot = {
    habits: [],
    checkins: [],
    notes: [],
    tasks: [],
    reminderSlots: [
      {
        id: 'slot-1',
        label: 'Morning Updated',
        time: '09:15',
        createdAt: 100,
        updatedAt: 500,
        deletedAt: null,
      },
      {
        id: 'slot-2',
        label: 'Still Active Remote',
        time: '13:00',
        createdAt: 150,
        updatedAt: 300,
        deletedAt: null,
      },
      {
        id: 'slot-3',
        label: 'Evening',
        time: '21:00',
        createdAt: 400,
        updatedAt: 400,
        deletedAt: null,
      },
    ],
  };

  const merged = SnapshotMerger.merge(local, remote);
  assert.equal(merged.reminderSlots?.length, 3);
  assert.equal(merged.reminderSlots?.find((s) => s.id === 'slot-1')?.label, 'Morning Updated');
  assert.equal(merged.reminderSlots?.find((s) => s.id === 'slot-1')?.time, '09:15');
  assert.equal(merged.reminderSlots?.find((s) => s.id === 'slot-2')?.deletedAt, 900);
  assert.equal(merged.reminderSlots?.find((s) => s.id === 'slot-3')?.time, '21:00');
  assert.deepEqual(SnapshotMerger.merge(merged, merged), merged);

  const rebased = SnapshotMerger.rebaseForRestore(local, [remote], 500);
  assert.equal(rebased.reminderSlots?.[0].updatedAt, 901);
  assert.equal(rebased.habits[0].updatedAt, 901);

  const bytes = BackupService.exportBytes(remote);
  const imported = BackupService.importBytes(local, bytes);
  assert.equal(imported.mergedSnapshot.reminderSlots?.length, 3);
  assert.equal(
    imported.mergedSnapshot.reminderSlots?.find((s) => s.id === 'slot-1')?.time,
    '09:15'
  );
  assert.deepEqual(imported.mergedSnapshot.habits[0].reminderSlotIds, ['slot-1']);
});
