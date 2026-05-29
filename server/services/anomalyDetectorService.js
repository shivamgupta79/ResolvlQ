import Complaint from '../models/Complaint.js';
import AnomalyAlert from '../models/AnomalyAlert.js';
import { computeMedian, deriveApartmentBlock } from '../utils/mlUtils.js';

// io is imported dynamically inside the function to avoid circular ESM dependency
async function getIo() {
  const { io } = await import('../server.js');
  return io;
}

// ── Config (read once at module load) ────────────────────────────────────────
const WINDOW_DAYS = parseInt(process.env.ANOMALY_WINDOW_DAYS, 10) || 7;
const BASELINE_PERIODS = parseInt(process.env.ANOMALY_BASELINE_PERIODS, 10) || 4;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Runs a full anomaly detection pass over the complaint collection.
 *
 * For each (issueType, apartmentBlock) pair observed in the current rolling
 * window, the function:
 *   1. Counts complaints in the current window.
 *   2. Counts complaints in each of the BASELINE_PERIODS prior windows and
 *      computes the median as the baseline.
 *   3. Classifies severity using the ratio (or absolute count when baseline = 0).
 *   4. Upserts an AnomalyAlert document and emits `anomaly:detected` via
 *      Socket.IO for every newly created alert.
 *
 * @returns {{ newAlerts: number, totalEvaluated: number }}
 */
export async function runAnomalyDetection() {
  try {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_MS);

    // ── Step 1: Aggregate current-window counts by (issueType, apartmentNo) ──
    const rawCounts = await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: windowStart, $lte: windowEnd }
        }
      },
      {
        $group: {
          _id: { issueType: '$issueType', apartmentNo: '$apartmentNo' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Post-process: derive apartmentBlock from apartmentNo and merge counts
    // for pairs that share the same (issueType, block).
    const blockMap = new Map(); // key: "issueType||block"
    for (const row of rawCounts) {
      const { issueType, apartmentNo } = row._id;
      const block = deriveApartmentBlock(apartmentNo);
      const key = `${issueType}||${block}`;
      blockMap.set(key, {
        issueType,
        apartmentBlock: block,
        observedCount: (blockMap.get(key)?.observedCount ?? 0) + row.count
      });
    }

    const pairs = Array.from(blockMap.values());
    const totalEvaluated = pairs.length;
    let newAlerts = 0;

    // ── Step 2–4: Baseline, severity, upsert, emit ────────────────────────
    for (const { issueType, apartmentBlock, observedCount } of pairs) {
      // Compute baseline counts for each prior window
      const baselineCounts = [];
      for (let p = 1; p <= BASELINE_PERIODS; p++) {
        const pEnd = new Date(windowStart.getTime() - (p - 1) * WINDOW_MS);
        const pStart = new Date(pEnd.getTime() - WINDOW_MS);

        // Count complaints for this issueType whose apartmentNo derives to this block
        const periodRaw = await Complaint.aggregate([
          {
            $match: {
              issueType,
              createdAt: { $gte: pStart, $lte: pEnd }
            }
          },
          {
            $group: {
              _id: '$apartmentNo',
              count: { $sum: 1 }
            }
          }
        ]);

        // Sum only those apartmentNos that map to the same block
        let periodCount = 0;
        for (const row of periodRaw) {
          if (deriveApartmentBlock(row._id) === apartmentBlock) {
            periodCount += row.count;
          }
        }
        baselineCounts.push(periodCount);
      }

      const baseline = computeMedian(baselineCounts);

      // ── Classify severity ───────────────────────────────────────────────
      let severity;
      if (baseline === 0) {
        if (observedCount >= 5) {
          severity = 'High';
        } else if (observedCount >= 3) {
          severity = 'Medium';
        } else {
          continue; // skip — not anomalous
        }
      } else {
        const ratio = observedCount / baseline;
        if (ratio >= 2.5) {
          severity = 'High';
        } else if (ratio >= 1.5) {
          severity = 'Medium';
        } else {
          continue; // skip — not anomalous
        }
      }

      // ── Upsert AnomalyAlert ─────────────────────────────────────────────
      const filter = {
        issueType,
        apartmentBlock,
        windowStart,
        resolvedAt: null
      };

      // Use a sentinel field to reliably detect new inserts vs updates.
      // $setOnInsert sets _isNew=true only when a new document is created.
      // After reading the result we immediately unset it.
      const upsertUpdate = {
        $set: {
          observedCount,
          baselineCount: baseline,
          severity,
          windowEnd
        },
        $setOnInsert: {
          issueType,
          apartmentBlock,
          windowStart,
          resolvedAt: null,
          createdAt: new Date(),
          _isNew: true
        }
      };

      const result = await AnomalyAlert.findOneAndUpdate(filter, upsertUpdate, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      });

      // _isNew is only set on insert (via $setOnInsert), not on update
      const isNew = result._isNew === true;
      if (isNew) {
        // Clean up the sentinel field
        await AnomalyAlert.updateOne({ _id: result._id }, { $unset: { _isNew: '' } });
        newAlerts++;
        const io = await getIo();
        io.emit('anomaly:detected', result.toObject());
      }
    }

    return { newAlerts, totalEvaluated };
  } catch (err) {
    console.error('[AnomalyDetector] runAnomalyDetection error:', err.message);
    throw err;
  }
}
