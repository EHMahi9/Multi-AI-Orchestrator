import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type {
  CollectedEvidence,
  CorrectionProposal,
  DecisionPacket,
  ExecutionEvidence,
  PipelineStage,
  ReviewConsensus,
} from '../../shared/types';

export interface BridgeStatus {
  bridgeVersion: '1.0';
  stage: PipelineStage | 'ready_for_antigravity' | 'antigravity_executing';
  hasPendingTask: boolean;
  hasCorrectionProposal: boolean;
  hasReviewVerdict: boolean;
  activeTaskTitle?: string;
  activeIteration: number;
  lastUpdated: string;
}

export class AntigravityBridge extends EventEmitter {
  private bridgeDir: string;
  private taskFile: string;
  private evidenceFile: string;
  private correctionFile: string;
  private reviewFile: string;
  private statusFile: string;
  private watcher: fs.FSWatcher | null = null;
  private isProcessingEvidence = false;

  constructor(workspaceDir: string) {
    super();
    this.bridgeDir = path.join(workspaceDir, '.orchestrator', 'bridge');
    this.taskFile = path.join(this.bridgeDir, 'pending_task.json');
    this.evidenceFile = path.join(this.bridgeDir, 'evidence.json');
    this.correctionFile = path.join(this.bridgeDir, 'correction_proposal.json');
    this.reviewFile = path.join(this.bridgeDir, 'review_verdict.json');
    this.statusFile = path.join(this.bridgeDir, 'status.json');

    this.ensureDirectories();
    this.startWatcher();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.bridgeDir)) {
      fs.mkdirSync(this.bridgeDir, { recursive: true });
    }
  }

  /**
   * Publishes an approved Decision Packet to the bridge for Antigravity execution.
   */
  public publishApprovedTask(packet: DecisionPacket): void {
    this.ensureDirectories();
    fs.writeFileSync(this.taskFile, JSON.stringify(packet, null, 2), 'utf-8');

    // Clean any stale evidence or correction from previous run
    if (fs.existsSync(this.evidenceFile)) {
      try { fs.unlinkSync(this.evidenceFile); } catch {}
    }
    if (fs.existsSync(this.correctionFile)) {
      try { fs.unlinkSync(this.correctionFile); } catch {}
    }

    this.updateStatus({
      bridgeVersion: '1.0',
      stage: 'ready_for_antigravity',
      hasPendingTask: true,
      hasCorrectionProposal: false,
      hasReviewVerdict: false,
      activeTaskTitle: packet.title,
      activeIteration: 1,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Publishes a correction proposal formulated after an AI review requires revision.
   */
  public publishCorrection(proposal: CorrectionProposal): void {
    this.ensureDirectories();
    fs.writeFileSync(this.correctionFile, JSON.stringify(proposal, null, 2), 'utf-8');

    // Clean stale evidence so agent can write new evidence for this iteration
    if (fs.existsSync(this.evidenceFile)) {
      try { fs.unlinkSync(this.evidenceFile); } catch {}
    }

    this.updateStatus({
      bridgeVersion: '1.0',
      stage: 'awaiting_correction_approval',
      hasPendingTask: true,
      hasCorrectionProposal: true,
      hasReviewVerdict: true,
      activeTaskTitle: proposal.proposedPacket.title,
      activeIteration: proposal.iteration,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Publishes the consensus review verdict from ChatGPT & the AI review council.
   */
  public publishReviewVerdict(consensus: ReviewConsensus, iteration: number): void {
    this.ensureDirectories();
    fs.writeFileSync(this.reviewFile, JSON.stringify(consensus, null, 2), 'utf-8');

    this.updateStatus({
      bridgeVersion: '1.0',
      stage: consensus.verdict === 'PASS' ? 'completed' : 'reviewing',
      hasPendingTask: consensus.verdict !== 'PASS',
      hasCorrectionProposal: consensus.verdict === 'REVISION_REQUIRED',
      hasReviewVerdict: true,
      activeIteration: iteration,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Updates the bridge status JSON file.
   */
  public updateStatus(status: Partial<BridgeStatus>): void {
    this.ensureDirectories();
    const current = this.getStatus();
    const merged: BridgeStatus = { ...current, ...status, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(this.statusFile, JSON.stringify(merged, null, 2), 'utf-8');
  }

  /**
   * Retrieves the current bridge status.
   */
  public getStatus(): BridgeStatus {
    if (fs.existsSync(this.statusFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.statusFile, 'utf-8'));
      } catch {}
    }
    return {
      bridgeVersion: '1.0',
      stage: 'idle',
      hasPendingTask: false,
      hasCorrectionProposal: false,
      hasReviewVerdict: false,
      activeIteration: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Reads the current pending task packet if one is published.
   */
  public getPendingTask(): DecisionPacket | null {
    if (fs.existsSync(this.taskFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.taskFile, 'utf-8'));
      } catch {}
    }
    return null;
  }

  /**
   * Reads the current active correction proposal.
   */
  public getCorrectionProposal(): CorrectionProposal | null {
    if (fs.existsSync(this.correctionFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.correctionFile, 'utf-8'));
      } catch {}
    }
    return null;
  }

  /**
   * Reads the latest review verdict.
   */
  public getReviewVerdict(): ReviewConsensus | null {
    if (fs.existsSync(this.reviewFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.reviewFile, 'utf-8'));
      } catch {}
    }
    return null;
  }

  /**
   * Watches for evidence.json being created/updated by Antigravity.
   */
  private startWatcher(): void {
    if (this.watcher) return;

    try {
      this.watcher = fs.watch(this.bridgeDir, (eventType, filename) => {
        if (filename === 'evidence.json') {
          this.handleEvidenceFileChange();
        }
      });
    } catch {
      // Fallback polling if fs.watch fails on certain Windows configs
      setInterval(() => {
        this.checkForEvidence();
      }, 2000);
    }
  }

  private checkForEvidence(): void {
    if (fs.existsSync(this.evidenceFile) && !this.isProcessingEvidence) {
      this.handleEvidenceFileChange();
    }
  }

  private handleEvidenceFileChange(): void {
    if (this.isProcessingEvidence) return;
    if (!fs.existsSync(this.evidenceFile)) return;

    try {
      const raw = fs.readFileSync(this.evidenceFile, 'utf-8');
      if (!raw || raw.trim().length === 0) return;

      const evidence = JSON.parse(raw);
      if (evidence && typeof evidence.success === 'boolean') {
        this.isProcessingEvidence = true;
        this.emit('evidence:submitted', evidence);
        // Reset processing lock after brief delay
        setTimeout(() => {
          this.isProcessingEvidence = false;
        }, 1500);
      }
    } catch {
      // Partial write or parse error; retry on next tick
    }
  }

  public close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
