import React from 'react';
import { ADMIN_PAGE } from './ui';

const RetryAttempt = React.createContext(0);

/** A failed lazy import needs a fresh React lazy payload on region retry. */
export function retryableLazy(loader) {
  const versions = new Map();
  return function LazyRegion(props) {
    const attempt = React.useContext(RetryAttempt);
    if (!versions.has(attempt)) {
      if (versions.size > 1) versions.clear();
      versions.set(attempt, React.lazy(loader));
    }
    const Component = versions.get(attempt);
    return <Component {...props} />;
  };
}

export class AdminWorkspaceBoundary extends React.Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="admin-command-stage" role="alert"><h2>This workspace could not load</h2><p>Your current URL, search and filters are kept. Retry this region to recover.</p><button type="button" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>Retry workspace</button></section>;
    return <RetryAttempt.Provider key={this.state.attempt} value={this.state.attempt}>{this.props.children}</RetryAttempt.Provider>;
  }
}

export function WorkspaceSkeleton({ section }) {
  const calendar = section === 'calendar';
  return <section role="status" aria-label="Loading section" className={`${ADMIN_PAGE} space-y-4 animate-pulse`}>
    <div className="h-12 bg-surface-raised border border-border-hairline" />
    <div className={calendar ? 'grid grid-cols-7 gap-2' : 'grid grid-cols-3 gap-4'}>{Array.from({ length: calendar ? 7 : 3 }, (_, index) => <div key={index} className="h-24 bg-surface-raised border border-border-hairline" />)}</div>
    {Array.from({ length: calendar ? 4 : 6 }, (_, index) => <div key={index} className={calendar ? 'h-24 bg-surface-raised border border-border-hairline' : 'h-12 bg-surface-raised border border-border-hairline'} />)}
  </section>;
}
