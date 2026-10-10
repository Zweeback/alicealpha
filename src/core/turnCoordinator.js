// Keep one active spoken/computed turn per Alice session.
// Cancellation invalidates callbacks even if a provider ignores AbortSignal.
export class TurnCoordinator {
  constructor() {
    this.version = 0;
    this.controller = null;
  }

  begin() {
    this.cancel();
    const controller = new AbortController();
    const version = ++this.version;
    this.controller = controller;

    const isCurrent = () => this.version === version && !controller.signal.aborted;
    return {
      signal: controller.signal,
      isCurrent,
      finish: () => {
        if (isCurrent()) this.controller = null;
      },
    };
  }

  cancel() {
    this.version += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
