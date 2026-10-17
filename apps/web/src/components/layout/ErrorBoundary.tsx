import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Catches render errors so one broken screen does not blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log locally only; never send private content to a third party.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center p-6">
          <div className="glass max-w-md rounded-2xl p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
            <h1 className="mt-3 text-lg font-semibold">Something broke</h1>
            <p className="mt-1 text-sm text-content-muted">
              The screen failed to render. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
