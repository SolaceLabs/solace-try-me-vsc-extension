import * as vscode from "vscode";
import {
  applyPreferencesOp,
  brokerSecretKey,
  DEFAULT_LOCALHOST_BROKER,
  DEFAULT_LOCALHOST_PASSWORD,
  normalizeStoredPreferences,
  PreferencesOp,
  StoredBroker,
  StoredPreferences,
  withoutSecrets,
} from "./shared/preferences";

// The key older versions used. Keep it so existing broker profiles and presets load.
const STORAGE_KEY = "preferences";

export interface PreferencesStoreOptions {
  /** vscode.env.sessionId: identifies the current VS Code session. */
  sessionId: string;
  /** Per-profile prefix for SecretStorage keys. */
  secretNamespace: string;
}

/**
 * Owns the stored preferences. Webviews only ever send small operations, which are applied
 * to the freshly read state one at a time, and every change is broadcast to all webviews.
 */
export class PreferencesStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<StoredPreferences>();
  readonly onDidChange = this.changeEmitter.event;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly ready: Promise<{ isFirstRun: boolean }>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
    private readonly options: PreferencesStoreOptions
  ) {
    this.ready = this.enqueue(() => this.migrate());
  }

  /** Resolves once first-run seeding and the password migration have finished. */
  whenReady() {
    return this.ready;
  }

  dispose() {
    this.changeEmitter.dispose();
  }

  /** Preferences without any passwords, safe to send to a webview. */
  async get(): Promise<StoredPreferences> {
    await this.ready;
    return withoutSecrets(this.read());
  }

  /** Raw settings for host-side features (file saving, notifications). */
  getSettings(): Record<string, unknown> {
    return this.read().settings;
  }

  async update(op: PreferencesOp): Promise<StoredPreferences> {
    await this.ready;
    const result = await this.enqueue(async () => {
      const current = this.read();
      let next: StoredPreferences;
      if (op.type === "upsertBroker") {
        const { hasPassword, dropLegacyPassword } = await this.updateBrokerSecret(current, op);
        next = applyPreferencesOp(current, {
          ...op,
          broker: { ...op.broker, hasPassword },
        });
        const saved = next.brokerConfigs.find((b) => b.id === op.broker.id);
        if (saved && dropLegacyPassword) {
          delete saved.password;
          delete saved.passwordMigrationSession;
        }
      } else {
        if (op.type === "deleteBroker") {
          await this.deleteSecret(op.id);
        }
        next = applyPreferencesOp(current, op);
      }
      await this.context.globalState.update(STORAGE_KEY, next);
      return next;
    });
    const sanitized = withoutSecrets(result);
    this.changeEmitter.fire(sanitized);
    return sanitized;
  }

  async getPassword(brokerId: string): Promise<string | undefined> {
    await this.ready;
    // A plaintext password (not yet migrated, or written by an older version running in
    // another window) is the most recent one.
    const broker = this.read().brokerConfigs.find((b) => b.id === brokerId);
    if (typeof broker?.password === "string") {
      return broker.password;
    }
    try {
      return await this.context.secrets.get(this.secretKey(brokerId));
    } catch (error) {
      this.log.warn(`Could not read the saved password for broker ${brokerId}: ${error}`);
      return undefined;
    }
  }

  private secretKey(brokerId: string) {
    return brokerSecretKey(this.options.secretNamespace, brokerId);
  }

  private read(): StoredPreferences {
    return normalizeStoredPreferences(this.context.globalState.get<unknown>(STORAGE_KEY));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Seeds the default broker on first run and moves plaintext passwords written by older
   * versions into SecretStorage, in two steps: the secret is stored first, and the plaintext
   * is only removed in a later session once the secret can be read back. SecretStorage may be
   * in-memory only (no OS keyring), so a single step could lose passwords on restart.
   */
  private async migrate(): Promise<{ isFirstRun: boolean }> {
    const raw = this.context.globalState.get<unknown>(STORAGE_KEY);
    const isFirstRun = raw === undefined || raw === null || raw === "";
    const prefs = normalizeStoredPreferences(raw);
    let changed = isFirstRun;

    if (isFirstRun) {
      const broker = prefs.brokerConfigs.find((b) => b.id === DEFAULT_LOCALHOST_BROKER.id);
      if (broker) {
        broker.password = DEFAULT_LOCALHOST_PASSWORD;
      }
    }

    let moved = 0;
    for (const broker of prefs.brokerConfigs) {
      if (typeof broker.password === "string") {
        const result = await this.migrateLegacyPassword(broker);
        changed = changed || result.changed;
        if (result.moved) {
          moved++;
        }
      } else if (broker.hasPassword) {
        changed = (await this.verifySecret(broker)) || changed;
      }
    }

    if (changed) {
      await this.context.globalState.update(STORAGE_KEY, prefs);
    }
    if (moved && !isFirstRun) {
      this.log.info(`Moved ${moved} broker password(s) to VS Code SecretStorage.`);
    }
    return { isFirstRun };
  }

  private async migrateLegacyPassword(broker: StoredBroker): Promise<{ changed: boolean; moved: boolean }> {
    const password = broker.password as string;
    if (!password.length) {
      delete broker.password;
      delete broker.passwordMigrationSession;
      broker.hasPassword = false;
      return { changed: true, moved: false };
    }
    const key = this.secretKey(broker.id);
    try {
      const pendingSince = broker.passwordMigrationSession;
      if (pendingSince && pendingSince !== this.options.sessionId) {
        if ((await this.context.secrets.get(key)) === password) {
          // The secret survived a restart: the plaintext copy can go.
          delete broker.password;
          delete broker.passwordMigrationSession;
          broker.hasPassword = true;
          return { changed: true, moved: true };
        }
      } else if (pendingSince === this.options.sessionId) {
        return { changed: false, moved: false };
      }
      await this.context.secrets.store(key, password);
      broker.passwordMigrationSession = this.options.sessionId;
      broker.hasPassword = true;
      return { changed: true, moved: false };
    } catch (error) {
      this.log.warn(
        `Could not move the password of broker "${broker.title}" to SecretStorage; keeping it as is: ${error}`
      );
      return { changed: false, moved: false };
    }
  }

  /** Clears hasPassword when the secret is gone, so the UI does not claim a saved password. */
  private async verifySecret(broker: StoredBroker): Promise<boolean> {
    try {
      if ((await this.context.secrets.get(this.secretKey(broker.id))) === undefined) {
        this.log.warn(`The saved password of broker "${broker.title}" is missing. Enter it again in the broker profile.`);
        broker.hasPassword = false;
        return true;
      }
    } catch (error) {
      this.log.warn(`Could not check the saved password of broker "${broker.title}": ${error}`);
    }
    return false;
  }

  private async updateBrokerSecret(
    current: StoredPreferences,
    op: Extract<PreferencesOp, { type: "upsertBroker" }>
  ): Promise<{ hasPassword: boolean; dropLegacyPassword: boolean }> {
    const id = op.broker.id;
    const existing = current.brokerConfigs.find((b) => b.id === id);

    if (op.clearPassword || op.broker.savePassword === false) {
      await this.deleteSecret(id);
      return { hasPassword: false, dropLegacyPassword: true };
    }
    if (typeof op.password === "string") {
      if (op.password.length) {
        await this.context.secrets.store(this.secretKey(id), op.password);
        return { hasPassword: true, dropLegacyPassword: true };
      }
      await this.deleteSecret(id);
      return { hasPassword: false, dropLegacyPassword: true };
    }
    // Password unchanged. A legacy plaintext password stays until the migration completes.
    if (typeof existing?.password === "string") {
      return { hasPassword: existing.password.length > 0, dropLegacyPassword: false };
    }
    return { hasPassword: existing?.hasPassword === true, dropLegacyPassword: false };
  }

  private async deleteSecret(brokerId: string) {
    try {
      await this.context.secrets.delete(this.secretKey(brokerId));
    } catch (error) {
      this.log.warn(`Could not delete the saved password for broker ${brokerId}: ${error}`);
    }
  }
}
