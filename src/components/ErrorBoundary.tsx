import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors anywhere in the child component tree, logs them,
 * and displays a fallback UI instead of crashing the whole application.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);

    // Auto-reload once for chunk loading failures (stale deploy cache)
    const isChunkError =
      error.message?.includes('dynamically imported module') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Loading CSS chunk');

    const reloaded = sessionStorage.getItem('chunk_reload');
    if (isChunkError && !reloaded) {
      sessionStorage.setItem('chunk_reload', '1');
      window.location.reload();
      return;
    }
  }

  handleReset() {
    sessionStorage.removeItem('chunk_reload');
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-md w-full p-8 text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-slate-800">حدث خطأ غير متوقع</h1>
            <p className="text-slate-500 text-sm">Something went wrong. Please reload or try again.</p>
            {this.state.error && (
              <p className="text-xs text-red-500 font-mono bg-red-50 rounded p-2 text-left break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors"
              >
                Try Again / حاول مجدداً
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-semibold text-sm transition-colors"
              >
                Reload / أعد التحميل
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
