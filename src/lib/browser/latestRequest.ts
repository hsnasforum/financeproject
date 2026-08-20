export type LatestRequestLease = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => boolean;
};

export type LatestRequestCoordinator = {
  start: () => LatestRequestLease;
  cancel: () => void;
};

export function createLatestRequestCoordinator(): LatestRequestCoordinator {
  let activeController: AbortController | null = null;

  return {
    start() {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      return {
        signal: controller.signal,
        isCurrent: () => activeController === controller && !controller.signal.aborted,
        finish: () => {
          if (activeController !== controller || controller.signal.aborted) return false;
          activeController = null;
          return true;
        },
      };
    },
    cancel() {
      const controller = activeController;
      activeController = null;
      controller?.abort();
    },
  };
}
