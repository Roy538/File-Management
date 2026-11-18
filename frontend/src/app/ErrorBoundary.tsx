import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button';

/** Last line of defence: a render error shows a recoverable screen, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    return this.state.error ? <Crash /> : this.props.children;
  }
}

export function RouteError() {
  const error = useRouteError();
  console.error('Route error', error);
  return <Crash />;
}

function Crash() {
  return (
    <div role="alert" className="mx-auto mt-24 max-w-md px-6 text-center">
      <h1 className="doc-title text-2xl">This page stopped working</h1>
      <p className="mt-2 text-[13.5px] text-muted">
        Nothing you saved has been lost. Reload the page to continue; if it happens again, tell your administrator what you were doing.
      </p>
      <Button variant="primary" className="mt-5" onClick={() => window.location.reload()}>Reload page</Button>
    </div>
  );
}
