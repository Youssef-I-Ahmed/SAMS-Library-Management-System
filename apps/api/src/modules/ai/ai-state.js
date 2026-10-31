import { randomBytes } from 'node:crypto';
import { aiError } from './ai-errors.js';

const publicHandle = () => randomBytes(16).toString('hex');
const privateHandle = () => randomBytes(32).toString('hex');
const SESSION_TTL = 2 * 60 * 60 * 1000;
const JOB_TTL = 60 * 60 * 1000;
const capacity = () => aiError(503, 'AI_CAPACITY_BUSY');
const busy = () => aiError(409, 'AI_SESSION_BUSY');

export class AiState {
  constructor(epoch, now = Date.now) {
    this.epoch = epoch;
    this.now = now;
    this.sessions = new Map();
    this.jobs = new Map();
    this.work = new Set();
    this.rates = new Map();
  }

  cleanup() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAsk >= SESSION_TTL) this.sessions.delete(id);
    }
    for (const [id, job] of this.jobs) {
      if (now - job.created >= JOB_TTL || !this.sessions.has(job.session.id)) this.jobs.delete(id);
    }
    for (const [key, hits] of this.rates) {
      while (hits.length && now - hits[0] >= 60000) hits.shift();
      if (!hits.length) this.rates.delete(key);
    }
    // Expiring public handles is deliberately independent from releasing compute.
    // Unobserved/uncertain work remains in the bounded ledger until reconciliation.
  }

  throttle(owner, operation, limit) {
    this.cleanup();
    const key = `${owner}:${operation}`;
    const hits = this.rates.get(key) ?? [];
    if (hits.length >= limit) {
      const error = aiError(429, 'AI_RATE_LIMITED');
      error.retryAfter = Math.max(1, Math.ceil((60000 - (this.now() - hits[0])) / 1000));
      throw error;
    }
    if (!this.rates.has(key) && this.rates.size >= 4096) throw capacity();
    hits.push(this.now()); this.rates.set(key, hits);
  }

  newSession(owner) {
    this.cleanup();
    if (this.sessions.size >= 1024) throw capacity();
    const session = { id: publicHandle(), internal: privateHandle(), owner, epoch: this.epoch,
      lastAsk: this.now(), state: 'idle', work: null };
    this.sessions.set(session.id, session);
    return session;
  }

  session(id, owner) {
    this.cleanup();
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner || session.epoch !== this.epoch) {
      throw aiError(404, 'AI_SESSION_NOT_FOUND');
    }
    return session;
  }

  job(id, owner) {
    this.cleanup();
    const job = this.jobs.get(id);
    if (!job || job.session.owner !== owner || job.session.epoch !== this.epoch) {
      throw aiError(404, 'AI_JOB_NOT_FOUND');
    }
    return job;
  }

  assertEpoch(epoch) {
    if (epoch !== this.epoch) throw aiError(404, 'AI_SESSION_NOT_FOUND');
  }

  admit(owner, sessionId, requestId) {
    // Foreign handles never consume a quota or contact the upstream.
    const existing = sessionId ? this.session(sessionId, owner) : null;
    this.throttle(owner, 'ask', 20);
    if (existing && existing.state !== 'idle') throw busy();
    if (this.work.size >= 4 || [...this.work].some((work) => work.session.owner === owner) ||
        this.jobs.size + this.work.size >= 128) throw capacity();
    const session = existing ?? this.newSession(owner);
    const work = { session, created: this.now(), requestId, epoch: this.epoch };
    session.state = 'in-flight'; session.lastAsk = this.now(); session.work = work;
    this.work.add(work);
    return work;
  }

  pending(work, internalJob) {
    if (work.epoch !== this.epoch) throw aiError(404, 'AI_JOB_NOT_FOUND');
    // Duplicate internal job IDs across distinct work are a protocol violation.
    if ([...this.jobs.values()].some((job) => job.internal === internalJob)) return null;
    const job = { id: publicHandle(), internal: internalJob, session: work.session,
      work, created: work.created, polling: false, response: null, error: null, nextPoll: 0 };
    this.jobs.set(job.id, job);
    return job;
  }

  finish(work) {
    this.work.delete(work);
    if (work.session.work === work) { work.session.state = 'idle'; work.session.work = null; }
  }

  uncertain(work) {
    if (this.work.has(work)) work.session.state = 'uncertain';
  }

  lockReset(session) {
    if (session.state !== 'idle') throw busy();
    session.state = 'resetting';
  }

  rotate(session) {
    this.sessions.delete(session.id);
    for (const [id, job] of this.jobs) if (job.session === session) this.jobs.delete(id);
    return this.newSession(session.owner);
  }

  // Internal operator hook only: caller must have coordinated a real service restart.
  // No browser endpoint calls this; merely expiring a TTL must NEVER invoke it.
  replaceEpoch(epoch) {
    if (epoch === this.epoch) return;
    this.epoch = epoch;
    this.sessions.clear(); this.jobs.clear(); this.work.clear(); this.rates.clear();
  }

  privateIds() {
    return [...new Set([
      ...[...this.sessions.values()].map((s) => s.internal),
      ...[...this.jobs.values()].map((j) => j.internal),
      ...[...this.work].map((w) => w.session.internal)
    ])];
  }
}
